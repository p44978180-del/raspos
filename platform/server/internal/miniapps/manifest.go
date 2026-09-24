package miniapps

import (
	"encoding/json"
	"errors"
	"regexp"
)

const MaxBundleBytes = 8 * 1024 * 1024

var (
	idPattern      = regexp.MustCompile(`^[a-z0-9-]{3,64}$`)
	versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)
	hashPattern    = regexp.MustCompile(`^[0-9a-f]{64}$`)
	hostMethods    = map[string]struct{}{
		"host.v1.schedule.read":     {},
		"host.v1.group.read":        {},
		"host.v1.navigate.building": {},
		"host.v1.thread.read":       {},
		"host.v1.storage.kv":        {},
		"host.v1.duty_roster.write": {},
	}
	forbidden = map[string]struct{}{
		"nfc": {}, "biometrics": {}, "wallet": {},
		"host.v1.nfc": {}, "host.v1.biometrics": {}, "host.v1.wallet": {},
	}
)

// Manifest is the published description of one mini-app release.
type Manifest struct {
	ID                  string   `json:"id"`
	Name                string   `json:"name"`
	Version             string   `json:"version"`
	BundleSHA256        string   `json:"bundle_sha256"`
	Signature           string   `json:"signature"`
	CSP                 string   `json:"csp"`
	HostMethods         []string `json:"host_methods"`
	WasmComponentSHA256 string   `json:"wasm_component_sha256,omitempty"`
	Permissions         []string `json:"permissions,omitempty"`
}

func Parse(raw []byte) (Manifest, error) {
	var manifest Manifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return Manifest{}, err
	}
	if err := manifest.Validate(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func (m Manifest) Validate() error {
	if !idPattern.MatchString(m.ID) || m.Name == "" || len(m.Name) > 80 || !versionPattern.MatchString(m.Version) {
		return errors.New("manifest identity is invalid")
	}
	if !hashPattern.MatchString(m.BundleSHA256) || len(m.Signature) < 80 || m.CSP == "" || len(m.CSP) > 512 {
		return errors.New("manifest bundle, signature or csp is invalid")
	}
	if m.WasmComponentSHA256 != "" && !hashPattern.MatchString(m.WasmComponentSHA256) {
		return errors.New("wasm component hash is invalid")
	}
	seen := map[string]struct{}{}
	for _, method := range m.HostMethods {
		if _, blocked := forbidden[method]; blocked {
			return errors.New("host method is forbidden")
		}
		if _, ok := hostMethods[method]; !ok {
			return errors.New("host method is not on the allowlist")
		}
		if _, dup := seen[method]; dup {
			return errors.New("host method is repeated")
		}
		seen[method] = struct{}{}
	}
	for _, permission := range m.Permissions {
		if _, blocked := forbidden[permission]; blocked {
			return errors.New("permission is forbidden")
		}
	}
	return nil
}
