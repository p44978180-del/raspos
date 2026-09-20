package config

import "testing"

func TestNoDefaultCredentialOrAutomaticLegacySeed(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("AUTO_SEED", "")
	cfg := Load()
	if cfg.DatabaseURL != "" {
		t.Fatal("DATABASE_URL must not have a default credential")
	}
	if cfg.AutoSeed {
		t.Fatal("legacy auto-seed must be disabled by default")
	}
}
