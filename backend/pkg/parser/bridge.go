package parser

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
)

type Bridge struct {
	pythonBin  string
	scriptPath string
	dataPath   string
}

func New(pythonBin, scriptPath, dataPath string) *Bridge {
	return &Bridge{
		pythonBin:  pythonBin,
		scriptPath: scriptPath,
		dataPath:   dataPath,
	}
}

// Run executes the Python parser script, captures output, and reads the resulting schedule JSON
func (b *Bridge) Run(ctx context.Context) ([]byte, error) {
	scriptCandidates := []string{
		b.scriptPath,
		"../scripts/timacad_parser.py",
		"scripts/timacad_parser.py",
		"/app/scripts/timacad_parser.py",
		"../../scripts/timacad_parser.py",
	}

	var resolvedScript string
	for _, sc := range scriptCandidates {
		if fi, err := os.Stat(sc); err == nil && !fi.IsDir() {
			resolvedScript, _ = filepath.Abs(sc)
			break
		}
	}

	pyCandidates := []string{
		b.pythonBin,
		"python3",
		"python",
		"py",
	}

	var pyErr error
	var executed bool

	if resolvedScript == "" {
		return nil, fmt.Errorf("python parser script not found: checked candidates %v", scriptCandidates)
	}

	for _, py := range pyCandidates {
		if py == "" {
			continue
		}
		cmd := exec.CommandContext(ctx, py, resolvedScript)
		cmd.Dir = filepath.Dir(resolvedScript)
		log.Printf("[ParserBridge] Executing %s %s in %s...", py, resolvedScript, cmd.Dir)

		output, err := cmd.CombinedOutput()
		if err == nil {
			log.Printf("[ParserBridge] Parser execution successful. Output:\n%s", string(output))
			executed = true
			break
		} else {
			pyErr = fmt.Errorf("cmd %s %s failed: %w (output: %s)", py, resolvedScript, err, string(output))
			log.Printf("[ParserBridge] Attempt with %s failed: %v", py, pyErr)
		}
	}

	if !executed {
		if pyErr == nil {
			pyErr = fmt.Errorf("no python executable available among candidates: %v", pyCandidates)
		}
		return nil, fmt.Errorf("python parser execution failed: %w", pyErr)
	}

	// Now read resulting data file
	dataCandidates := []string{
		b.dataPath,
		"../public/data/official-schedule.json",
		"public/data/official-schedule.json",
		"/app/public/data/official-schedule.json",
		"../../public/data/official-schedule.json",
	}

	var dataBytes []byte
	var loadedPath string
	for _, dp := range dataCandidates {
		if content, err := os.ReadFile(dp); err == nil && len(content) > 0 {
			dataBytes = content
			loadedPath = dp
			break
		}
	}

	if len(dataBytes) == 0 {
		return nil, fmt.Errorf("python parser succeeded but output schedule data file not found in candidates: %v", dataCandidates)
	}

	log.Printf("[ParserBridge] Read schedule dataset from %s (%d bytes)", loadedPath, len(dataBytes))
	return dataBytes, nil
}
