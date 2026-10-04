package main_test

import (
	"fmt"
	"github.com/Ieditzu/nimbus-nova/api/internal/server"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func account(t *testing.T, h *harness, email, phone string) (string, string) {
	t.Helper()
	status, raw := h.doBearer(http.MethodPost, "/v1/auth/register", "", map[string]any{"role": "poster", "email": email, "password": "workflow-password-42", "display_name": "Workflow Person", "identity_proof": verifiedProofFixture(t, h, email), "phone_number": phone})
	if status != 201 {
		t.Fatalf("register %d %s", status, raw)
	}
	id := asMap(t, asMap(t, decode(t, raw))["user"])["id"].(string)
	status, raw = h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": email, "password": "workflow-password-42"})
	if status != 200 {
		t.Fatalf("login %d %s", status, raw)
	}
	return id, asMap(t, decode(t, raw))["token"].(string)
}
func makeJob(t *testing.T, h *harness, token string) string {
	t.Helper()
	status, raw := h.doBearer(http.MethodPost, "/v1/tasks", token, cloneMap(t, "create-task-request.json"))
	if status != 201 {
		t.Fatalf("job %d %s", status, raw)
	}
	return asMap(t, asMap(t, decode(t, raw))["task"])["id"].(string)
}
func TestPhoneRequiredAndPrivate(t *testing.T) {
	h := start(t)
	_, token := account(t, h, "phone@example.test", "")
	for _, path := range []string{"/v1/me/tasks", "/v1/me/conversations"} {
		status, raw := h.doBearer(http.MethodGet, path, token, nil)
		h.errorCode(status, raw, 409, "phone_required", "Completează numărul de telefon pentru a continua.")
	}
	status, _ := h.doBearer(http.MethodPut, "/v1/me/phone", token, map[string]any{"phone_number": "123"})
	if status != 400 {
		t.Fatalf("invalid phone %d", status)
	}
	status, raw := h.doBearer(http.MethodPut, "/v1/me/phone", token, map[string]any{"phone_number": "0712 345 678"})
	if status != 200 {
		t.Fatalf("phone %d %s", status, raw)
	}
	if asMap(t, asMap(t, decode(t, raw))["user"])["phone_number"] != "+40712345678" {
		t.Fatalf("normalize %s", raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/me", token, nil)
	if status != 200 || asMap(t, asMap(t, decode(t, raw))["user"])["phone_number"] != "+40712345678" {
		t.Fatalf("persisted phone %d %s", status, raw)
	}
	status, _ = h.doBearer(http.MethodPut, "/v1/me/phone", token, map[string]any{"phone_number": ""})
	if status != 400 {
		t.Fatalf("clearing required phone %d", status)
	}
	id := makeJob(t, h, token)
	status, _, raw = h.do(http.MethodGet, "/v1/tasks/"+id, "", nil, false)
	if status != 200 || strings.Contains(string(raw), "phone_number") || strings.Contains(string(raw), "+40712345678") {
		t.Fatalf("public phone leaked %d %s", status, raw)
	}
}
func TestWorkerCanPublishButCannotApplyOwnJob(t *testing.T) {
	h := start(t)
	id, token := account(t, h, "worker-jobs@example.test", "+40712345678")
	if _, err := h.DB.Exec(`UPDATE users SET role='worker' WHERE id=?`, id); err != nil {
		t.Fatal(err)
	}
	job := makeJob(t, h, token)
	status, raw := h.doBearer(http.MethodPost, "/v1/tasks/"+job+"/applications", token, map[string]any{"message": "Apply to own job"})
	h.errorCode(status, raw, 409, "cannot_apply_own_task", "Nu poți aplica la propria sarcină.")
	status, raw = h.doBearer(http.MethodGet, "/v1/me/tasks", token, nil)
	if status != 200 || !strings.Contains(string(raw), job) {
		t.Fatalf("my jobs %d %s", status, raw)
	}
	if _, err := h.DB.Exec(`UPDATE users SET volunteer_only=1 WHERE id=?`, id); err != nil {
		t.Fatal(err)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks", token, cloneMap(t, "create-task-request.json"))
	if status != 403 {
		t.Fatalf("minor publish %d", status)
	}
}
func TestConversationMembershipMessagesAndHistory(t *testing.T) {
	h := start(t)
	owner, ownerToken := account(t, h, "owner-chat@example.test", "+40712345678")
	peer, peerToken := account(t, h, "peer-chat@example.test", "+40723456789")
	_, strangerToken := account(t, h, "stranger-chat@example.test", "+40734567890")
	task := makeJob(t, h, ownerToken)
	status, raw := h.doBearer(http.MethodPost, "/v1/tasks/"+task+"/conversations", peerToken, map[string]any{})
	if status != 200 {
		t.Fatalf("start %d %s", status, raw)
	}
	chat := asMap(t, asMap(t, decode(t, raw))["conversation"])["id"].(string)
	// Repeated/concurrent opens are the same thread.
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			status, raw := h.doBearer(http.MethodPost, "/v1/tasks/"+task+"/conversations", peerToken, map[string]any{})
			if status != 200 || !strings.Contains(string(raw), chat) {
				t.Errorf("repeat %d %s", status, raw)
			}
		}()
	}
	wg.Wait()
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		status, _ = h.doBearer(method, "/v1/conversations/"+chat+"/messages", strangerToken, map[string]any{"text": "steal"})
		if status != 404 {
			t.Fatalf("stranger %s %d", method, status)
		}
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks/"+task+"/conversations", ownerToken, map[string]any{"participant_id": owner})
	if status != 400 {
		t.Fatalf("self chat %d", status)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/conversations/"+chat+"/messages", peerToken, map[string]any{"text": strings.Repeat("x", 2001)})
	if status != 400 {
		t.Fatalf("long text %d", status)
	}
	for i := 0; i < 105; i++ {
		token := peerToken
		if i%2 == 0 {
			token = ownerToken
		}
		status, raw = h.doBearer(http.MethodPost, "/v1/conversations/"+chat+"/messages", token, map[string]any{"text": fmt.Sprintf("Message %03d", i)})
		if status != 201 {
			t.Fatalf("send %d %s", status, raw)
		}
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages", peerToken, nil)
	page := asMap(t, decode(t, raw))
	messages := page["messages"].([]any)
	if status != 200 || len(messages) != 100 || page["has_more"] != true {
		t.Fatalf("recent %d %s", status, raw)
	}
	if asMap(t, messages[0])["text"] != "Message 005" || asMap(t, messages[99])["sender_id"] != owner {
		t.Fatalf("order/sender %s", raw)
	}
	cursor := fmt.Sprint(page["previous_cursor"])
	status, raw = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages?before="+cursor, peerToken, nil)
	if status != 200 || len(asMap(t, decode(t, raw))["messages"].([]any)) != 5 {
		t.Fatalf("older %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages?after="+fmt.Sprint(page["next_cursor"]), ownerToken, nil)
	if status != 200 || len(asMap(t, decode(t, raw))["messages"].([]any)) != 0 {
		t.Fatalf("cursor %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/me/conversations", ownerToken, nil)
	if status != 200 || !strings.Contains(string(raw), peer) || !strings.Contains(string(raw), "+40723456789") || strings.Contains(string(raw), "+40712345678") {
		t.Fatalf("inbox %d %s", status, raw)
	}
	if _, err := h.DB.Exec(`UPDATE users SET status='suspended' WHERE id=?`, peer); err != nil {
		t.Fatal(err)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/conversations/"+chat+"/messages", ownerToken, map[string]any{"text": "disabled peer"})
	if status != 403 {
		t.Fatalf("disabled peer %d", status)
	}
	status, _ = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages", peerToken, nil)
	if status != 401 {
		t.Fatalf("suspended token %d", status)
	}
	status, _, _ = h.do(http.MethodGet, "/v1/me/conversations", "worker-1", nil, true)
	if status != 401 {
		t.Fatalf("demo impersonation %d", status)
	}
}

func TestMobileTestAccountOptIn(t *testing.T) {
	for _, mode := range []struct {
		demo, fixture string
		want          int
	}{{"0", "1", 401}, {"1", "", 401}, {"1", "1", 200}} {
		t.Run(mode.demo+"-"+mode.fixture, func(t *testing.T) {
			t.Setenv("NOVA_DEMO", mode.demo)
			t.Setenv("NOVA_TEST_ACCOUNT", mode.fixture)
			api, err := server.New(filepath.Join(t.TempDir(), "nova.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer api.Close()
			h := &harness{t: t, DB: api.DB()}
			srv := httptest.NewServer(api.Handler())
			defer srv.Close()
			h.URL = srv.URL
			status, raw := h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": "test@haisamoritu.com", "password": "samoaraplatoniimei"})
			if status != mode.want {
				t.Fatalf("fixture login %d %s", status, raw)
			}
			if status == 200 {
				user := asMap(t, asMap(t, decode(t, raw))["user"])
				if user["phone_number"] != "" {
					t.Fatalf("fixture skips phone gate %s", raw)
				}
				var hash string
				if err := api.DB().QueryRow(`SELECT password_hash FROM users WHERE id='mobile-test-worker'`).Scan(&hash); err != nil {
					t.Fatal(err)
				}
				if !strings.HasPrefix(hash, "$2") {
					t.Fatal("test password was not hashed")
				}
			}
		})
	}
}
