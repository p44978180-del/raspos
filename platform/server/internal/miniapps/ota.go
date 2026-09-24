package miniapps

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
)

// Switch verifies the downloaded bytes and then points current at the new file.
// A hash mismatch leaves the previous current file in place.
func Switch(dir, name string, bundle []byte, wantHash string) (string, error) {
	pointer := filepath.Join(dir, "current")
	previous, _ := os.ReadFile(pointer)
	sum := sha256.Sum256(bundle)
	if hex.EncodeToString(sum[:]) != wantHash {
		return string(previous), errors.New("downloaded bundle hash does not match")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return string(previous), err
	}
	partial := filepath.Join(dir, name+".partial")
	if err := os.WriteFile(partial, bundle, 0o600); err != nil {
		return string(previous), err
	}
	final := filepath.Join(dir, name)
	if err := os.Rename(partial, final); err != nil {
		return string(previous), err
	}
	temporary := pointer + ".tmp"
	if err := os.WriteFile(temporary, []byte(name), 0o600); err != nil {
		return string(previous), err
	}
	if err := os.Rename(temporary, pointer); err != nil {
		return string(previous), err
	}
	return name, nil
}
