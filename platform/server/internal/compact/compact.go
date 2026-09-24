package compact

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"os/exec"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/db"
)

const collectionPersonal = "personal"

// Run compacts every personal document through the timacad-core compact-doc binary.
// The new snapshot is appended first. Older sync_log rows are removed only after that.
func Run(ctx context.Context, pool *pgxpool.Pool, bin string) (int, error) {
	docs, err := db.New(pool).ListLoroDocs(ctx)
	if err != nil {
		return 0, err
	}
	done := 0
	for _, doc := range docs {
		snapshot, err := Exec(bin, doc.LatestSnapshot)
		if err != nil {
			return done, err
		}
		if err := replace(ctx, pool, doc.DocID, snapshot); err != nil {
			return done, err
		}
		done++
	}
	return done, nil
}

// Exec runs compact-doc. Stdout is a little-endian length, the snapshot, then the v4 JSON.
func Exec(bin string, doc []byte) ([]byte, error) {
	command := exec.Command(bin)
	command.Stdin = bytes.NewReader(doc)
	output, err := command.Output()
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return nil, errors.New(string(exit.Stderr))
		}
		return nil, err
	}
	if len(output) < 8 {
		return nil, errors.New("compact-doc returned a short header")
	}
	size := binary.LittleEndian.Uint64(output[:8])
	if uint64(len(output)) < 8+size {
		return nil, errors.New("compact-doc snapshot is truncated")
	}
	return output[8 : 8+size], nil
}

func replace(ctx context.Context, pool *pgxpool.Pool, docID string, snapshot []byte) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	latest, err := queries.LatestSyncOp(ctx, db.LatestSyncOpParams{Collection: collectionPersonal, ScopeID: docID})
	lsn := int64(0)
	switch {
	case err == nil && bytes.Equal(latest.Op, snapshot):
		lsn = latest.Lsn
	case err == nil || errors.Is(err, pgx.ErrNoRows):
		lsn, err = queries.NextLSN(ctx, db.NextLSNParams{Collection: collectionPersonal, ScopeID: docID})
		if err != nil {
			return err
		}
		if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
			Collection: collectionPersonal, ScopeID: docID, Lsn: lsn, Op: snapshot, RecordedAt: now,
		}); err != nil {
			return err
		}
	default:
		return err
	}
	if err := queries.UpdateLoroSnapshot(ctx, db.UpdateLoroSnapshotParams{
		DocID: docID, LatestSnapshot: snapshot, SnapshotVersion: lsn, UpdatedAt: now,
	}); err != nil {
		return err
	}
	if err := queries.DeleteSyncOpsBefore(ctx, db.DeleteSyncOpsBeforeParams{
		Collection: collectionPersonal, ScopeID: docID, Lsn: lsn,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
