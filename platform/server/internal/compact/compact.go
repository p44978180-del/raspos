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
		if err := compactOne(ctx, pool, doc.DocID, bin); err != nil {
			return done, err
		}
		done++
	}
	return done, nil
}

// Exec runs compact-doc. Stdout is a little-endian length, the snapshot, then the v4 JSON.
func Exec(bin string, doc []byte) ([]byte, error) {
	return ExecBatch(context.Background(), bin, [][]byte{doc})
}

func ExecBatch(ctx context.Context, bin string, updates [][]byte) ([]byte, error) {
	var input bytes.Buffer
	input.WriteString("TMB1")
	_ = binary.Write(&input, binary.LittleEndian, uint32(len(updates)))
	for _, update := range updates {
		if len(update) > 8*1024*1024 || input.Len()+len(update) > 64*1024*1024 {
			return nil, errors.New("compaction batch is too large")
		}
		_ = binary.Write(&input, binary.LittleEndian, uint32(len(update)))
		input.Write(update)
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, bin)
	command.Stdin = &input
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

func compactOne(ctx context.Context, pool *pgxpool.Pool, docID, bin string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	// The same scope lock as Push protects the read/merge/replace cycle.
	if err := queries.LockSyncScope(ctx, collectionPersonal+"|"+docID); err != nil {
		return err
	}
	rows, err := queries.SyncOpsAfter(ctx, db.SyncOpsAfterParams{Collection: collectionPersonal, ScopeID: docID, Lsn: 0})
	if err != nil {
		return err
	}
	updates := make([][]byte, 0, len(rows))
	for _, row := range rows {
		updates = append(updates, row.Op)
	}
	if len(updates) == 0 {
		stored, err := queries.GetLoroDoc(ctx, docID)
		if err != nil {
			return err
		}
		updates = append(updates, stored.LatestSnapshot)
	}
	snapshot, err := ExecBatch(ctx, bin, updates)
	if err != nil {
		return err
	}
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
