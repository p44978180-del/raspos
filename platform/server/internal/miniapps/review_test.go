package miniapps

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/testsuite"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/db"
	miniappsv1 "raspos/platform/server/internal/gen/timacad/miniapps/v1"
	miniappsv1connect "raspos/platform/server/internal/gen/timacad/miniapps/v1/miniappsv1connect"
	"raspos/platform/server/internal/schema"
)

func TestSchemaAndExamplesStayOnTheAllowlist(t *testing.T) {
	raw := readRepo(t, filepath.Join("miniapps", "spec", "manifest.schema.json"))
	text := string(raw)
	for _, method := range []string{
		"host.v1.schedule.read", "host.v1.group.read", "host.v1.navigate.building",
		"host.v1.thread.read", "host.v1.storage.kv", "host.v1.duty_roster.write",
	} {
		if !strings.Contains(text, method) {
			t.Fatalf("schema is missing %s", method)
		}
	}
	var schema struct {
		Properties struct {
			HostMethods struct {
				Items struct {
					Enum []string `json:"enum"`
				} `json:"items"`
			} `json:"host_methods"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &schema); err != nil {
		t.Fatal(err)
	}
	allowed := map[string]struct{}{}
	for _, method := range schema.Properties.HostMethods.Items.Enum {
		allowed[method] = struct{}{}
	}
	for _, method := range []string{"nfc", "biometrics", "wallet", "host.v1.nfc", "host.v1.biometrics", "host.v1.wallet"} {
		if _, ok := allowed[method]; ok {
			t.Fatalf("schema allows %s", method)
		}
	}
	for _, example := range []string{"bulletin", "duties"} {
		var manifest Manifest
		if err := json.Unmarshal(readRepo(t, filepath.Join("miniapps", "examples", example, "manifest.json")), &manifest); err != nil {
			t.Fatal(err)
		}
		for _, method := range manifest.HostMethods {
			if _, ok := hostMethods[method]; !ok {
				t.Fatalf("%s method %s", example, method)
			}
		}
	}
	blocked := Manifest{
		ID: "group-duties", Name: "Дежурства", Version: "1.0.0", CSP: "default-src 'none'",
		BundleSHA256: strings.Repeat("ab", 32), Signature: strings.Repeat("a", 88),
		Permissions: []string{"nfc"},
	}
	if err := blocked.Validate(); err == nil {
		t.Fatal("nfc permission was accepted")
	}
	blocked.Permissions = nil
	blocked.HostMethods = []string{"host.v1.wallet"}
	if err := blocked.Validate(); err == nil {
		t.Fatal("wallet host method was accepted")
	}
}

func TestVerifyRejectsAMismatchedWasmHash(t *testing.T) {
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	bundle := []byte("wasm-bytes")
	manifest := signedManifest(t, private, "group-duties", "1.0.0", []string{"host.v1.storage.kv"}, bundle)
	manifest.WasmComponentSHA256 = strings.Repeat("ab", 32)
	if err := Verify(public, manifest, bundle); err == nil {
		t.Fatal("wasm hash was ignored")
	}
}

func TestEmptyBundleIsRejectedBeforeStorage(t *testing.T) {
	_, err := (&Activities{}).CheckMiniapp(context.Background(), Submission{})
	if err == nil {
		t.Fatal("empty bundle entered review")
	}
}

func TestSwitchKeepsThePreviousHashOnMismatch(t *testing.T) {
	dir := t.TempDir()
	if _, err := Switch(dir, "one", []byte("first"), hashOf([]byte("first"))); err != nil {
		t.Fatal(err)
	}
	if _, err := Switch(dir, "two", []byte("tampered"), hashOf([]byte("first"))); err == nil {
		t.Fatal("mismatched download replaced the current bundle")
	}
	current, err := os.ReadFile(filepath.Join(dir, "current"))
	if err != nil || string(current) != "one" {
		t.Fatalf("current %q err %v", current, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "two")); err == nil {
		t.Fatal("rejected bundle was kept")
	}
}

func TestReviewPublishResolveAndRevoke(t *testing.T) {
	pool := startMiniappPostgres(t)
	public, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	bundle := []byte("bulletin-bytes")
	manifest := signedManifest(t, private, "group-bulletin", "1.0.0", []string{"host.v1.schedule.read", "host.v1.thread.read"}, bundle)
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	registry := Registry{Queries: db.New(pool), Blobs: &blob.Memory{}}
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(ReviewMiniapp)
	env.RegisterActivity(&Activities{Registry: registry, Publisher: public})
	env.RegisterDelayedCallback(func() { env.SignalWorkflow(ReviewSignal, "approve") }, 0)
	env.ExecuteWorkflow(ReviewMiniapp, Submission{ManifestJSON: raw, Bundle: bundle})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(connectHandler(registry))
	t.Cleanup(server.Close)
	client := miniappsv1connect.NewMiniappServiceClient(server.Client(), server.URL)
	resolved, err := client.Resolve(context.Background(), connect.NewRequest(&miniappsv1.ResolveRequest{AppId: "group-bulletin"}))
	if err != nil {
		t.Fatal(err)
	}
	if resolved.Msg.GetBundleSha256() != manifest.BundleSHA256 || resolved.Msg.GetVersion() != "1.0.0" {
		t.Fatalf("resolve %+v", resolved.Msg)
	}
	if err := registry.SetStatus(context.Background(), "group-bulletin", "1.0.0", "revoked"); err != nil {
		t.Fatal(err)
	}
	_, err = client.Resolve(context.Background(), connect.NewRequest(&miniappsv1.ResolveRequest{AppId: "group-bulletin"}))
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatalf("revoked release resolved: %v", err)
	}
}

func TestUnsignedBundleNeverEntersTheRegistry(t *testing.T) {
	pool := startMiniappPostgres(t)
	public, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	_, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	bundle := []byte("not-signed-by-the-publisher")
	manifest := signedManifest(t, private, "group-duties", "1.0.0", []string{"host.v1.duty_roster.write"}, bundle)
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	registry := Registry{Queries: db.New(pool), Blobs: &blob.Memory{}}
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(ReviewMiniapp)
	env.RegisterActivity(&Activities{Registry: registry, Publisher: public})
	env.ExecuteWorkflow(ReviewMiniapp, Submission{ManifestJSON: raw, Bundle: bundle})
	if err := env.GetWorkflowError(); err == nil {
		t.Fatal("a bundle signed by another key was reviewed")
	}
	if _, err := registry.Resolve(context.Background(), "group-duties"); err == nil {
		t.Fatal("unsigned bundle became resolvable")
	}
}

func signedManifest(t *testing.T, private ed25519.PrivateKey, id, version string, methods []string, bundle []byte) Manifest {
	t.Helper()
	return Manifest{
		ID: id, Name: id, Version: version, BundleSHA256: hashOf(bundle), Signature: Sign(private, bundle),
		CSP: "default-src 'none'", HostMethods: methods,
	}
}

func hashOf(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func connectHandler(registry Registry) http.Handler {
	mux := http.NewServeMux()
	path, handler := miniappsv1connect.NewMiniappServiceHandler(&Service{Registry: registry})
	mux.Handle(path, handler)
	return mux
}

func readRepo(t *testing.T, relative string) []byte {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		candidate := filepath.Join(dir, relative)
		if raw, err := os.ReadFile(candidate); err == nil {
			return raw
		}
		if raw, err := os.ReadFile(filepath.Join(dir, "platform", relative)); err == nil {
			return raw
		}
		dir = filepath.Dir(dir)
	}
	t.Fatalf("%s not found", relative)
	return nil
}

func startMiniappPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dir := t.TempDir()
	cache := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "embedded-postgres")
	config := embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Username("timacad").
		Password("timacad").
		Database("timacad").
		Port(55438).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	url := "postgres://timacad:timacad@127.0.0.1:55438/timacad?sslmode=disable"
	if err := schema.Up(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
