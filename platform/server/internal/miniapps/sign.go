package miniapps

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
)

// Sign returns the standard base64 Ed25519 signature of the bundle bytes.
func Sign(private ed25519.PrivateKey, bundle []byte) string {
	return base64.StdEncoding.EncodeToString(ed25519.Sign(private, bundle))
}

// Verify checks the publisher signature and that the manifest names the bundle hash.
func Verify(public ed25519.PublicKey, manifest Manifest, bundle []byte) error {
	sum := sha256.Sum256(bundle)
	if hex.EncodeToString(sum[:]) != manifest.BundleSHA256 {
		return errors.New("bundle hash does not match the manifest")
	}
	if manifest.WasmComponentSHA256 != "" && manifest.WasmComponentSHA256 != manifest.BundleSHA256 {
		return errors.New("wasm component hash does not match the bundle")
	}
	signature, err := base64.StdEncoding.DecodeString(manifest.Signature)
	if err != nil || !ed25519.Verify(public, bundle, signature) {
		return errors.New("bundle signature was not accepted")
	}
	return nil
}
