// Package server is the platform API module.
// Phase 0 has no RPC server. Connect handlers arrive with the snapshot schema.
package server

// ModulePath is the Go module that later hosts Connect, sqlc, and OpenFGA checks.
func ModulePath() string {
	return "raspos/platform/server"
}
