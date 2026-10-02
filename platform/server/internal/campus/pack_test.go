package campus

import (
	"bytes"
	"os"
	"testing"
)

func TestEmbeddedPackMatchesReproducibleSource(t *testing.T) {
	source, err := os.ReadFile("../../../campus/data/campus-pack.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, Snapshot().GetPackJson()) {
		t.Fatal("run campus/import_osm.py with --install after changing the dataset")
	}
	copy := Snapshot()
	copy.PackJson[0] ^= 1
	if !bytes.Equal(source, Snapshot().GetPackJson()) {
		t.Fatal("snapshot caller mutated the embedded pack")
	}
}
