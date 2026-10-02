// Package campus owns the versioned, source-backed outdoor map distributed by sync.
package campus

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"

	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
)

//go:embed data/campus-pack.json
var pack []byte

func Snapshot() *syncv1.CampusSnapshot {
	sum := sha256.Sum256(pack)
	return &syncv1.CampusSnapshot{SnapshotHash: hex.EncodeToString(sum[:]), PackJson: append([]byte(nil), pack...)}
}
