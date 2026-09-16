package parser

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestBridge_ScriptNotFound(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	bridge := New("python3", "/non/existent/script/path/parser.py", "/non/existent/data.json")
	data, err := bridge.Run(ctx)
	if err == nil {
		t.Fatalf("expected error for non-existent script, got nil (data len: %d)", len(data))
	}
	if !strings.Contains(err.Error(), "python parser script not found") {
		t.Errorf("expected 'python parser script not found' in error, got %q", err.Error())
	}
}

func TestBridge_ExecutionFailure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Create a dummy failing script
	tmpDir := t.TempDir()
	failingScript := filepath.Join(tmpDir, "fail.py")
	if err := os.WriteFile(failingScript, []byte("import sys; sys.exit(1)\n"), 0755); err != nil {
		t.Fatalf("failed to write dummy script: %v", err)
	}

	// Create a dummy fallback data file that should NOT be returned on failure
	fallbackData := filepath.Join(tmpDir, "fallback.json")
	if err := os.WriteFile(fallbackData, []byte(`{"groups":{}}`), 0644); err != nil {
		t.Fatalf("failed to write fallback data: %v", err)
	}

	bridge := New("nonexistent_python_binary", failingScript, fallbackData)
	data, err := bridge.Run(ctx)
	if err == nil {
		t.Fatalf("expected error when python execution fails, got nil (swallowed error and returned %d bytes)", len(data))
	}
	if !strings.Contains(err.Error(), "python parser execution failed") {
		t.Errorf("expected 'python parser execution failed' in error, got %q", err.Error())
	}
}
