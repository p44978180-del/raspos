package syncsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	openfga "github.com/openfga/go-sdk"
	openfgaclient "github.com/openfga/go-sdk/client"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/identity"
	"raspos/platform/server/internal/schema"
	"raspos/platform/server/internal/session"
)

func TestLessonChangeAuthorization(t *testing.T) {
	apiURL := startOpenFGA(t)
	databaseURL := startPostgres(t)
	ctx := context.Background()
	if err := schema.Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	queries := db.New(pool)
	raw := dialOpenFGA(t, ctx, apiURL)
	checker := &authz.CachingChecker{Inner: raw, TTL: 10 * time.Second}
	group := "DA-401"
	objectID := ObjectID(group)
	head := insertPrincipal(t, ctx, queries, "Староста")
	deputy := insertPrincipal(t, ctx, queries, "Зам")
	member := insertPrincipal(t, ctx, queries, "Студент")
	outsider := insertPrincipal(t, ctx, queries, "Чужой")
	if err := checker.Write(ctx, []authz.Tuple{
		{User: "user:" + head.String(), Relation: "head", Object: "group:" + objectID},
		{User: "user:" + deputy.String(), Relation: "deputy", Object: "group:" + objectID},
		{User: "user:" + member.String(), Relation: "member", Object: "group:" + objectID},
		{User: "group:" + objectID, Relation: "group", Object: "lesson_change:" + objectID},
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(handlerWithAuth(pool, checker))
	t.Cleanup(server.Close)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)

	headToken := mustSession(t, ctx, queries, head)
	pushMany(t, ctx, client, headToken, head, group, 50)
	if raw.Calls() != 1 {
		t.Fatalf("50 publishes of one group made %d OpenFGA checks", raw.Calls())
	}
	pushMany(t, ctx, client, headToken, head, group, 1)
	if raw.Calls() != 1 {
		t.Fatalf("cached publish made a new OpenFGA check, calls=%d", raw.Calls())
	}
	if got := pushOne(t, ctx, client, mustSession(t, ctx, queries, member), member, group, 1); got.GetAccepted() {
		t.Fatal("member published a lesson change")
	}
	if got := pushOne(t, ctx, client, mustSession(t, ctx, queries, outsider), outsider, group, 1); got.GetAccepted() {
		t.Fatal("outsider published a lesson change")
	}
	if got := pushOne(t, ctx, client, mustSession(t, ctx, queries, deputy), deputy, group, 1); !got.GetAccepted() {
		t.Fatalf("deputy was refused: %s", got.GetRejectReason())
	}
	changes, err := queries.CountLessonChanges(ctx, group)
	if err != nil {
		t.Fatal(err)
	}
	if changes != 52 {
		t.Fatalf("stored lesson changes = %d", changes)
	}
	denied, err := queries.CountAudit(ctx, db.CountAuditParams{
		PrincipalID: pgtype.UUID{Bytes: [16]byte(member), Valid: true}, ObjectID: group, Allowed: false,
	})
	if err != nil || denied < 1 {
		t.Fatalf("member denial was not audited, count=%d err=%v", denied, err)
	}
	allowed, err := queries.CountAudit(ctx, db.CountAuditParams{
		PrincipalID: pgtype.UUID{Bytes: [16]byte(head), Valid: true}, ObjectID: group, Allowed: true,
	})
	if err != nil || allowed < 1 {
		t.Fatalf("head publish was not audited, count=%d err=%v", allowed, err)
	}
	if raw.Calls() != 4 {
		t.Fatalf("unique principals made %d OpenFGA checks, want 4", raw.Calls())
	}
	if grants := pullGrants(t, ctx, client, head.String()); grants != 51 {
		t.Fatalf("head device projections = %d", grants)
	}
	if grants := pullGrants(t, ctx, client, member.String()); grants != 0 {
		t.Fatalf("member received %d device projections", grants)
	}
}

func TestPasskeyBeginRejectsForgedFinish(t *testing.T) {
	databaseURL := startPostgres(t)
	ctx := context.Background()
	if err := schema.Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	handler, err := identity.New(db.New(pool))
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	handler.Register(mux)
	begin := httptest.NewRequest(http.MethodPost, "/auth/webauthn/register/begin?name=Anna", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, begin)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "challenge") {
		t.Fatalf("begin status %d body %s", rec.Code, rec.Body.String())
	}
	finish := httptest.NewRequest(http.MethodPost, "/auth/webauthn/register/finish", strings.NewReader(`{}`))
	finish.Header.Set("X-Principal-Id", rec.Header().Get("X-Principal-Id"))
	done := httptest.NewRecorder()
	mux.ServeHTTP(done, finish)
	if done.Code == http.StatusOK {
		t.Fatal("a forged passkey response was accepted")
	}
	principalID, err := uuid.Parse(rec.Header().Get("X-Principal-Id"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.New(pool).InsertWebAuthnCredential(ctx, db.InsertWebAuthnCredentialParams{
		CredentialID: []byte("cred-1"), PrincipalID: principalID, PublicKey: []byte{1}, SignCount: 0,
		CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
	login := httptest.NewRequest(http.MethodPost, "/auth/webauthn/login/begin", nil)
	login.Header.Set("X-Principal-Id", principalID.String())
	loginRec := httptest.NewRecorder()
	mux.ServeHTTP(loginRec, login)
	if loginRec.Code != http.StatusOK || !strings.Contains(loginRec.Body.String(), "challenge") {
		t.Fatalf("login begin status %d body %s", loginRec.Code, loginRec.Body.String())
	}
	forged := httptest.NewRequest(http.MethodPost, "/auth/webauthn/login/finish", strings.NewReader(`{}`))
	forged.Header.Set("X-Principal-Id", principalID.String())
	forgedRec := httptest.NewRecorder()
	mux.ServeHTTP(forgedRec, forged)
	if forgedRec.Code == http.StatusOK {
		t.Fatal("a forged passkey login was accepted")
	}
}

func openfgaBinaryMatchesCompose(t *testing.T, bin string) (string, error) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(findPlatform(t), "deploy", "docker-compose.yml"))
	if err != nil {
		return "", err
	}
	var pins []string
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		const prefix = "image: openfga/openfga:"
		if strings.HasPrefix(line, prefix) {
			pins = append(pins, strings.TrimPrefix(line, prefix))
		}
	}
	if len(pins) < 2 {
		return "", fmt.Errorf("compose pins %d OpenFGA images, want the migrate and run services", len(pins))
	}
	for _, pin := range pins[1:] {
		if pin != pins[0] {
			return "", fmt.Errorf("OpenFGA image pins differ: %v", pins)
		}
	}
	out, err := exec.Command(bin, "version").CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("openfga version: %w (%s)", err, out)
	}
	if !strings.Contains(string(out), pins[0]) {
		return "", fmt.Errorf("binary %q does not match compose pin %s", out, pins[0])
	}
	return pins[0], nil
}

func TestOpenFGABinaryMatchesComposePin(t *testing.T) {
	bin := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "bin", "openfga.exe")
	if _, err := openfgaBinaryMatchesCompose(t, bin); err != nil {
		t.Fatal(err)
	}
}

func startOpenFGA(t *testing.T) string {
	t.Helper()
	bin := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "bin", "openfga.exe")
	if _, err := openfgaBinaryMatchesCompose(t, bin); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(bin, "run", "--datastore-engine", "memory", "--http-addr", "127.0.0.1:18081", "--grpc-addr", "127.0.0.1:18082", "--playground-enabled=false", "--metrics-enabled=false")
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
	})
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		response, err := http.Get("http://127.0.0.1:18081/healthz")
		if err == nil {
			response.Body.Close()
			if response.StatusCode == http.StatusOK {
				return "http://127.0.0.1:18081"
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("OpenFGA did not become healthy")
	return ""
}

func dialOpenFGA(t *testing.T, ctx context.Context, apiURL string) *authz.OpenFGA {
	t.Helper()
	bootstrap, err := openfgaclient.NewSdkClient(&openfgaclient.ClientConfiguration{ApiUrl: apiURL})
	if err != nil {
		t.Fatal(err)
	}
	store, err := bootstrap.CreateStore(ctx).Body(openfgaclient.ClientCreateStoreRequest{Name: "timacad"}).Execute()
	if err != nil {
		t.Fatal(err)
	}
	if err := bootstrap.SetStoreId(store.GetId()); err != nil {
		t.Fatal(err)
	}
	modelPath := filepath.Join(findPlatform(t), "server", "authz", "model.json")
	raw, err := os.ReadFile(modelPath)
	if err != nil {
		t.Fatal(err)
	}
	var model openfga.WriteAuthorizationModelRequest
	if err := json.Unmarshal(raw, &model); err != nil {
		t.Fatal(err)
	}
	written, err := bootstrap.WriteAuthorizationModel(ctx).Body(model).Execute()
	if err != nil {
		t.Fatal(err)
	}
	client, err := authz.Dial(apiURL, store.GetId(), written.GetAuthorizationModelId())
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func handlerWithAuth(pool *pgxpool.Pool, checker authz.Checker) http.Handler {
	mux := http.NewServeMux()
	path, service := syncv1connect.NewSyncServiceHandler(&Service{Pool: pool, Queries: db.New(pool), Authz: checker})
	mux.Handle(path, service)
	return mux
}

func insertPrincipal(t *testing.T, ctx context.Context, queries *db.Queries, name string) uuid.UUID {
	t.Helper()
	id := uuid.Must(uuid.NewV7())
	if err := queries.InsertPrincipal(ctx, db.InsertPrincipalParams{
		ID: id, DisplayName: name, CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		t.Fatal(err)
	}
	return id
}

func mustSession(t *testing.T, ctx context.Context, queries *db.Queries, principal uuid.UUID) string {
	t.Helper()
	token, err := session.Issue(ctx, queries, principal)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func pushMany(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, token string, principal uuid.UUID, group string, count int) {
	t.Helper()
	ops := make([]*syncv1.PushOperation, 0, count)
	for seq := 1; seq <= count; seq++ {
		ops = append(ops, lessonOp(t, principal, group, int64(seq)))
	}
	request := connect.NewRequest(&syncv1.PushRequest{ReplicaId: uuid.Must(uuid.NewV7()).String(), Operations: ops})
	request.Header().Set("Authorization", "Bearer "+token)
	response, err := client.Push(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range response.Msg.GetItems() {
		if !item.GetAccepted() {
			t.Fatalf("publish refused: %s", item.GetRejectReason())
		}
	}
}

func pushOne(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, token string, principal uuid.UUID, group string, seq int64) *syncv1.PushAckItem {
	t.Helper()
	request := connect.NewRequest(&syncv1.PushRequest{
		ReplicaId: uuid.Must(uuid.NewV7()).String(), Operations: []*syncv1.PushOperation{lessonOp(t, principal, group, seq)},
	})
	request.Header().Set("Authorization", "Bearer "+token)
	response, err := client.Push(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	return response.Msg.GetItems()[0]
}

func pullGrants(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, principal string) int {
	t.Helper()
	stream, err := client.Pull(ctx, connect.NewRequest(&syncv1.PullRequest{
		Collection: collectionProjection, ScopeId: principal, SinceLsn: 0,
	}))
	if err != nil {
		t.Fatal(err)
	}
	grants := 0
	for stream.Receive() {
		var projection syncv1.AuthzProjection
		if err := proto.Unmarshal(stream.Msg().GetOp(), &projection); err != nil {
			t.Fatal(err)
		}
		if projection.GetPrincipalId() != principal || len(projection.GetGrants()) != 1 || projection.GetGrants()[0].GetRelation() != "can_publish" {
			t.Fatalf("projection %+v", &projection)
		}
		grants++
	}
	if err := stream.Err(); err != nil {
		t.Fatal(err)
	}
	return grants
}

func lessonOp(t *testing.T, principal uuid.UUID, group string, seq int64) *syncv1.PushOperation {
	t.Helper()
	payload, err := proto.Marshal(&syncv1.LessonChange{
		GroupCode: group, LessonFingerprint: "pair-1", Kind: "cancel", PayloadJson: `{"reason":"преподаватель болен"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	return &syncv1.PushOperation{Collection: collectionLessonChange, ScopeId: group, ClientSeq: seq, Op: payload}
}
