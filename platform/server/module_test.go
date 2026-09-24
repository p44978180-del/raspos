package server

import "testing"

func TestModulePath(t *testing.T) {
	if got := ModulePath(); got != "raspos/platform/server" {
		t.Fatalf("ModulePath() = %q", got)
	}
}
