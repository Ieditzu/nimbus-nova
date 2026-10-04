package main_test

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Ieditzu/nimbus-nova/api/internal/server"
)

var (
	taskIDPattern = regexp.MustCompile(`^task_[0-9a-f]{16}$`)
	appIDPattern  = regexp.MustCompile(`^app_[0-9a-f]{16}$`)
	revIDPattern  = regexp.MustCompile(`^rev_[0-9a-f]{16}$`)
)

type harness struct {
	t   *testing.T
	URL string
	DB  *sql.DB
	srv *httptest.Server
	api *server.Server
}

func start(t *testing.T) *harness {
	t.Helper()
	t.Setenv("NOVA_DEMO", "1")
	t.Setenv("IDANALYZER_KEY", "")
	dbPath := filepath.Join(t.TempDir(), "nova.db")
	api, err := server.New(dbPath)
	if err != nil {
		t.Fatalf("new server: %v", err)
	}
	srv := httptest.NewServer(api.Handler())
	t.Cleanup(func() {
		srv.Close()
		_ = api.Close()
	})
	return &harness{t: t, URL: srv.URL, DB: api.DB(), srv: srv, api: api}
}

func (h *harness) do(method, path, actor string, body any, setActor bool) (int, http.Header, []byte) {
	h.t.Helper()
	var rdr io.Reader
	if body != nil {
		switch raw := body.(type) {
		case []byte:
			rdr = bytes.NewReader(raw)
		case string:
			rdr = strings.NewReader(raw)
		default:
			buf, err := json.Marshal(body)
			if err != nil {
				h.t.Fatalf("marshal body: %v", err)
			}
			rdr = bytes.NewReader(buf)
		}
	}
	req, err := http.NewRequest(method, h.URL+path, rdr)
	if err != nil {
		h.t.Fatalf("request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if setActor {
		req.Header.Set("X-Demo-Actor", actor)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatalf("do: %v", err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(res.Body)
	if err != nil {
		h.t.Fatalf("read: %v", err)
	}
	if res.StatusCode != http.StatusNoContent {
		if got := res.Header.Get("Content-Type"); got != "application/json; charset=utf-8" {
			h.t.Fatalf("%s %s content-type %q body %s", method, path, got, payload)
		}
	}
	return res.StatusCode, res.Header, payload
}

func decode(t *testing.T, payload []byte) any {
	t.Helper()
	dec := json.NewDecoder(bytes.NewReader(payload))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		t.Fatalf("decode %s: %v", payload, err)
	}
	return v
}

func fixture(t *testing.T, name string) any {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "docs", "fixtures", name))
	if err != nil {
		t.Fatalf("fixture %s: %v", name, err)
	}
	return decode(t, raw)
}

func (h *harness) equalFixture(status int, payload []byte, wantStatus int, name string) {
	h.t.Helper()
	if status != wantStatus {
		h.t.Fatalf("%s status %d body %s", name, status, payload)
	}
	if !reflect.DeepEqual(decode(h.t, payload), fixture(h.t, name)) {
		h.t.Fatalf("%s\n got %s\nwant %s", name, payload, mustJSON(fixture(h.t, name)))
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func asMap(t *testing.T, v any) map[string]any {
	t.Helper()
	m, ok := v.(map[string]any)
	if !ok {
		t.Fatalf("not an object: %#v", v)
	}
	return m
}

func (h *harness) errorCode(status int, payload []byte, wantStatus int, code, message string) {
	h.t.Helper()
	if status != wantStatus {
		h.t.Fatalf("status %d want %d body %s", status, wantStatus, payload)
	}
	errObj := asMap(h.t, asMap(h.t, decode(h.t, payload))["error"])
	if errObj["code"] != code || errObj["message"] != message {
		h.t.Fatalf("error got %#v want %s %s", errObj, code, message)
	}
}

func cloneMap(t *testing.T, name string) map[string]any {
	t.Helper()
	return asMap(t, fixture(t, name))
}

func ids(t *testing.T, payload []byte) []string {
	t.Helper()
	tasks := asMap(t, decode(t, payload))["tasks"].([]any)
	out := make([]string, len(tasks))
	for i, item := range tasks {
		out[i] = asMap(t, item)["id"].(string)
	}
	return out
}

func (h *harness) createSeedLike() string {
	h.t.Helper()
	status, _, body := h.do(http.MethodPost, "/v1/tasks", "poster-1", cloneMap(h.t, "create-task-request.json"), true)
	if status != http.StatusCreated {
		h.t.Fatalf("create task %d %s", status, body)
	}
	return asMap(h.t, asMap(h.t, decode(h.t, body))["task"])["id"].(string)
}

func (h *harness) apply(taskID, message string) (int, []byte) {
	h.t.Helper()
	status, _, body := h.do(http.MethodPost, "/v1/tasks/"+taskID+"/applications", "worker-1", map[string]any{"message": message}, true)
	return status, body
}

func offsetOK(t *testing.T, value string) {
	t.Helper()
	if !strings.HasSuffix(value, "+03:00") {
		t.Fatalf("timestamp %s", value)
	}
}

func TestSeedMatchesFixtures(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodGet, "/health", "", nil, false)
	h.equalFixture(status, body, 200, "health.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	h.equalFixture(status, body, 200, "task-list.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup", "", nil, false)
	h.equalFixture(status, body, 200, "task-open.json")
	status, _, body = h.do(http.MethodGet, "/v1/profiles/me", "worker-1", nil, true)
	h.equalFixture(status, body, 200, "profile.json")
	status, _, body = h.do(http.MethodGet, "/v1/admin/tasks", "admin-1", nil, true)
	h.equalFixture(status, body, 200, "admin-task-list.json")
	status, _, body = h.do(http.MethodGet, "/v1/me/tasks", "poster-1", nil, true)
	if got := ids(t, body); status != 200 || !reflect.DeepEqual(got, []string{"task_seed_shop_cover", "task_seed_event_setup"}) {
		t.Fatalf("my tasks %d %#v", status, got)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup/applications", "poster-1", nil, true)
	h.equalFixture(status, body, 200, "application-list-empty.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup/reviews", "", nil, false)
	h.equalFixture(status, body, 200, "review-list-empty.json")
	status, _, body = h.do(http.MethodGet, "/v1/me/applications", "worker-1", nil, true)
	h.equalFixture(status, body, 200, "application-list-empty.json")
}

func TestPublicListFilters(t *testing.T) {
	h := start(t)
	checks := []struct {
		query string
		ids   []string
	}{
		{"?category=event_setup", []string{"task_seed_event_setup"}},
		{"?category=shop_cover", []string{"task_seed_shop_cover"}},
		{"?category=light_moving", []string{}},
		{"?category=", []string{"task_seed_event_setup", "task_seed_shop_cover"}},
		{"?city=București", []string{"task_seed_event_setup", "task_seed_shop_cover"}},
		{"?city=bucurești", []string{"task_seed_event_setup", "task_seed_shop_cover"}},
		{"?city=%20București%20", []string{"task_seed_event_setup", "task_seed_shop_cover"}},
		{"?city=Cluj", []string{}},
	}
	for _, check := range checks {
		status, _, body := h.do(http.MethodGet, "/v1/tasks"+check.query, "", nil, false)
		if status != 200 || !reflect.DeepEqual(ids(t, body), check.ids) {
			t.Fatalf("%s status %d ids %#v body %s", check.query, status, ids(t, body), body)
		}
	}
	status, _, body := h.do(http.MethodGet, "/v1/tasks?category=nope", "", nil, false)
	h.equalFixture(status, body, 400, "error-invalid-category.json")

	status, _, body = h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("hide %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if !reflect.DeepEqual(ids(t, body), []string{"task_seed_event_setup"}) {
		t.Fatalf("after hide %#v", ids(t, body))
	}
	_, appBody := h.apply("task_seed_event_setup", "Pot ajunge la 13:45 și ajut la amenajare.")
	appID := asMap(t, asMap(t, decode(t, appBody))["application"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if !reflect.DeepEqual(ids(t, body), []string{}) {
		t.Fatalf("after accept %#v", ids(t, body))
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("complete %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if !reflect.DeepEqual(ids(t, body), []string{}) {
		t.Fatalf("after complete %#v", ids(t, body))
	}
}

func TestCreateTaskRoundTrip(t *testing.T) {
	h := start(t)
	req := cloneMap(t, "create-task-request.json")
	status, _, body := h.do(http.MethodPost, "/v1/tasks", "poster-1", req, true)
	if status != 201 {
		t.Fatalf("create %d %s", status, body)
	}
	task := asMap(t, asMap(t, decode(t, body))["task"])
	if !taskIDPattern.MatchString(task["id"].(string)) {
		t.Fatalf("id %v", task["id"])
	}
	if task["poster_id"] != "poster-1" || task["poster_name"] != "Andrei Popescu" || task["status"] != "open" || task["assignee_id"] != nil || task["assignee_name"] != nil {
		t.Fatalf("server fields %#v", task)
	}
	offsetOK(t, task["created_at"].(string))
	for _, key := range []string{"title", "category", "city", "starts_at", "ends_at", "amount_bani", "description", "safety_note"} {
		if !reflect.DeepEqual(task[key], req[key]) {
			t.Fatalf("%s got %#v want %#v", key, task[key], req[key])
		}
	}
	status, _, got := h.do(http.MethodGet, "/v1/tasks/"+task["id"].(string), "", nil, false)
	if status != 200 || !reflect.DeepEqual(asMap(t, asMap(t, decode(t, got))["task"]), task) {
		t.Fatalf("get created %d %s", status, got)
	}
	status, _, list := h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if status != 200 || !contains(ids(t, list), task["id"].(string)) {
		t.Fatalf("public list %#v", ids(t, list))
	}
	status, _, mine := h.do(http.MethodGet, "/v1/me/tasks", "poster-1", nil, true)
	if status != 200 || ids(t, mine)[0] != task["id"].(string) {
		t.Fatalf("my tasks %#v", ids(t, mine))
	}

	extra := cloneMap(t, "create-task-request.json")
	extra["poster_id"] = "worker-1"
	extra["status"] = "hidden"
	extra["phone"] = "0700"
	extra["title"] = "Altă sarcină publică"
	status, _, body = h.do(http.MethodPost, "/v1/tasks", "poster-1", extra, true)
	if status != 201 {
		t.Fatalf("extra create %d %s", status, body)
	}
	created := asMap(t, asMap(t, decode(t, body))["task"])
	if _, ok := created["phone"]; ok || created["poster_id"] != "poster-1" || created["status"] != "open" {
		t.Fatalf("ignored fields not applied %#v", created)
	}
}

func contains(ids []string, want string) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

func TestCreateTaskValidation(t *testing.T) {
	h := start(t)
	base := func() map[string]any { return cloneMap(t, "create-task-request.json") }
	long := strings.Repeat("a", 81)
	rows := []struct {
		name    string
		mutate  func(map[string]any)
		raw     string
		status  int
		message string
		code    string
		stored  string
	}{
		{name: "title_too_short", mutate: func(m map[string]any) { m["title"] = "ab" }, status: 400, message: "Titlul trebuie să aibă între 3 și 80 de caractere."},
		{name: "title_too_long", mutate: func(m map[string]any) { m["title"] = long }, status: 400, message: "Titlul trebuie să aibă între 3 și 80 de caractere."},
		{name: "title_min", mutate: func(m map[string]any) { m["title"] = "abc" }, status: 201, stored: "abc"},
		{name: "title_max", mutate: func(m map[string]any) { m["title"] = strings.Repeat("a", 80) }, status: 201},
		{name: "title_trimmed", mutate: func(m map[string]any) { m["title"] = "  abc  " }, status: 201, stored: "abc"},
		{name: "bad_category", mutate: func(m map[string]any) { m["category"] = "jobs" }, status: 400, message: "Categoria trebuie să fie event_setup, light_moving, shop_cover sau other."},
		{name: "city_one_char", mutate: func(m map[string]any) { m["city"] = "B" }, status: 400, message: "Orașul trebuie să aibă între 2 și 80 de caractere."},
		{name: "city_min", mutate: func(m map[string]any) { m["city"] = "AB" }, status: 201},
		{name: "bad_time", mutate: func(m map[string]any) { m["starts_at"] = "tomorrow" }, status: 400, message: "Timpul trebuie să fie RFC3339 cu fus orar."},
		{name: "end_before_start", mutate: func(m map[string]any) { m["ends_at"] = "2026-10-05T13:59:00+03:00" }, status: 400, message: "Ora de final trebuie să fie după ora de început."},
		{name: "end_equal_start", mutate: func(m map[string]any) { m["ends_at"] = "2026-10-05T14:00:00+03:00" }, status: 400, message: "Ora de final trebuie să fie după ora de început."},
		{name: "duration_exact_12h", mutate: func(m map[string]any) { m["ends_at"] = "2026-10-06T02:00:00+03:00" }, status: 201},
		{name: "duration_over_12h", mutate: func(m map[string]any) { m["ends_at"] = "2026-10-06T02:00:01+03:00" }, status: 400, message: "Durata trebuie să fie de cel mult 12 ore."},
		{name: "amount_negative", mutate: func(m map[string]any) { m["amount_bani"] = -1 }, status: 400, message: "Suma trebuie să fie un număr întreg de bani între 0 și 500000."},
		{name: "amount_over", mutate: func(m map[string]any) { m["amount_bani"] = 500001 }, status: 400, message: "Suma trebuie să fie un număr întreg de bani între 0 și 500000."},
		{name: "amount_zero", mutate: func(m map[string]any) { m["amount_bani"] = 0 }, status: 201},
		{name: "amount_max", mutate: func(m map[string]any) { m["amount_bani"] = 500000 }, status: 201},
		{name: "amount_float", raw: `{"title":"abc","category":"other","city":"AB","starts_at":"2026-10-05T14:00:00+03:00","ends_at":"2026-10-05T15:00:00+03:00","amount_bani":100.5,"description":"1234567890","safety_note":""}`, status: 400, code: "invalid_json"},
		{name: "amount_string", raw: `{"title":"abc","category":"other","city":"AB","starts_at":"2026-10-05T14:00:00+03:00","ends_at":"2026-10-05T15:00:00+03:00","amount_bani":"10000","description":"1234567890","safety_note":""}`, status: 400, code: "invalid_json"},
		{name: "description_9", mutate: func(m map[string]any) { m["description"] = "123456789" }, status: 400, message: "Descrierea trebuie să aibă între 10 și 500 de caractere."},
		{name: "description_10", mutate: func(m map[string]any) { m["description"] = "1234567890" }, status: 201},
		{name: "description_501", mutate: func(m map[string]any) { m["description"] = strings.Repeat("d", 501) }, status: 400, message: "Descrierea trebuie să aibă între 10 și 500 de caractere."},
		{name: "safety_201", mutate: func(m map[string]any) { m["safety_note"] = strings.Repeat("s", 201) }, status: 400, message: "Nota de siguranță poate avea cel mult 200 de caractere."},
		{name: "safety_empty", mutate: func(m map[string]any) { m["safety_note"] = "" }, status: 201},
		{name: "omitted_title", mutate: func(m map[string]any) { delete(m, "title") }, status: 400, message: "Titlul trebuie să aibă între 3 și 80 de caractere."},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			var body any
			if row.raw != "" {
				body = row.raw
			} else {
				item := base()
				row.mutate(item)
				body = item
			}
			status, _, payload := h.do(http.MethodPost, "/v1/tasks", "poster-1", body, true)
			if row.status == 201 {
				if status != 201 {
					t.Fatalf("status %d %s", status, payload)
				}
				if row.stored != "" {
					got := asMap(t, asMap(t, decode(t, payload))["task"])["title"]
					if got != row.stored {
						t.Fatalf("stored %v", got)
					}
				}
				return
			}
			code := row.code
			if code == "" {
				code = "invalid_input"
			}
			if code == "invalid_json" {
				h.equalFixture(status, payload, 400, "error-invalid-json.json")
				return
			}
			h.errorCode(status, payload, 400, code, row.message)
		})
	}
	status, _, payload := h.do(http.MethodPost, "/v1/tasks", "poster-1", nil, true)
	h.equalFixture(status, payload, 400, "error-invalid-json.json")
	status, _, payload = h.do(http.MethodPost, "/v1/tasks", "poster-1", "{", true)
	h.equalFixture(status, payload, 400, "error-invalid-json.json")
}

func TestActorAndRoleGuards(t *testing.T) {
	h := start(t)
	paths := []struct {
		method, path string
		body         any
	}{
		{http.MethodPost, "/v1/tasks", nil},
		{http.MethodGet, "/v1/me/tasks", nil},
		{http.MethodGet, "/v1/profiles/me", nil},
		{http.MethodPut, "/v1/profiles/me", nil},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", nil},
		{http.MethodGet, "/v1/tasks/task_seed_event_setup/applications", nil},
		{http.MethodGet, "/v1/me/applications", nil},
		{http.MethodPost, "/v1/applications/missing/accept", nil},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", nil},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", nil},
		{http.MethodGet, "/v1/admin/tasks", nil},
		{http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", nil},
		{http.MethodPost, "/v1/demo/reset", nil},
	}
	for _, path := range paths {
		status, _, body := h.do(path.method, path.path, "", nil, false)
		h.equalFixture(status, body, 401, "error-missing-actor.json")
		status, _, body = h.do(path.method, path.path, "", nil, true)
		h.equalFixture(status, body, 401, "error-missing-actor.json")
		status, _, body = h.do(path.method, path.path, "nope", nil, true)
		h.equalFixture(status, body, 401, "error-unknown-actor.json")
	}
	status, _, body := h.do(http.MethodGet, "/v1/profiles/me", " worker-1 ", nil, true)
	if status != 200 {
		t.Fatalf("trimmed actor %d %s", status, body)
	}
	forbidden := []struct{ method, path, actor string }{
		{http.MethodPost, "/v1/tasks", "admin-1"},
		{http.MethodGet, "/v1/me/tasks", "admin-1"},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "poster-1"},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "admin-1"},
		{http.MethodGet, "/v1/tasks/task_seed_event_setup/applications", "worker-1"},
		{http.MethodGet, "/v1/tasks/task_seed_event_setup/applications", "admin-1"},
		{http.MethodGet, "/v1/me/applications", "poster-1"},
		{http.MethodPost, "/v1/applications/missing/accept", "admin-1"},
		{http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "worker-1"},
		{http.MethodGet, "/v1/admin/tasks", "poster-1"},
		{http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "poster-1"},
		{http.MethodPost, "/v1/demo/reset", "worker-1"},
		{http.MethodPost, "/v1/demo/reset", "poster-1"},
	}
	reviewBody := map[string]any{"stars": 5, "text": "Nu sunt participant."}
	for _, row := range forbidden {
		var payloadBody any
		if strings.HasSuffix(row.path, "/reviews") {
			payloadBody = reviewBody
		}
		if strings.HasSuffix(row.path, "/applications") {
			payloadBody = map[string]any{"message": "Pot ajunge."}
		}
		status, _, payload := h.do(row.method, row.path, row.actor, payloadBody, true)
		h.equalFixture(status, payload, 403, "error-forbidden.json")
	}
	status, _, payload := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "admin-1", reviewBody, true)
	h.equalFixture(status, payload, 403, "error-forbidden.json")
	for _, path := range []string{"/health", "/v1/tasks", "/v1/tasks/task_seed_event_setup", "/v1/tasks/task_seed_event_setup/reviews"} {
		status, _, body := h.do(http.MethodGet, path, "", nil, false)
		if status != 200 {
			t.Fatalf("public %s %d %s", path, status, body)
		}
	}
}

func TestProfileReplace(t *testing.T) {
	h := start(t)
	body := map[string]any{
		"skills":       []string{"doar una"},
		"city":         "Cluj",
		"availability": "Seara",
		"bio":          "",
		"display_name": "Alt Nume",
		"phone":        "0700",
	}
	status, _, payload := h.do(http.MethodPut, "/v1/profiles/me", "worker-1", body, true)
	if status != 200 {
		t.Fatalf("put %d %s", status, payload)
	}
	status, _, payload = h.do(http.MethodGet, "/v1/profiles/me", "worker-1", nil, true)
	profile := asMap(t, asMap(t, decode(t, payload))["profile"])
	if status != 200 || profile["display_name"] != "Maria Ionescu" || profile["city"] != "Cluj" || profile["availability"] != "Seara" || profile["bio"] != "" {
		t.Fatalf("profile %#v", profile)
	}
	if _, ok := profile["phone"]; ok {
		t.Fatalf("phone leaked %#v", profile)
	}
	if !reflect.DeepEqual(profile["skills"], []any{"doar una"}) {
		t.Fatalf("skills %#v", profile["skills"])
	}
	valid := map[string]any{"skills": []string{"una"}, "city": "Cluj", "availability": "Seara", "bio": "scurt"}
	rows := []struct {
		name, message string
		status        int
		mutate        func(map[string]any)
	}{
		{name: "empty_skills", message: "Competențele trebuie să conțină între 1 și 8 elemente, fiecare de cel mult 40 de caractere.", status: 400, mutate: func(m map[string]any) { m["skills"] = []string{} }},
		{name: "nine_skills", message: "Competențele trebuie să conțină între 1 și 8 elemente, fiecare de cel mult 40 de caractere.", status: 400, mutate: func(m map[string]any) {
			m["skills"] = []string{"1", "2", "3", "4", "5", "6", "7", "8", "9"}
		}},
		{name: "skill_41", message: "Competențele trebuie să conțină între 1 și 8 elemente, fiecare de cel mult 40 de caractere.", status: 400, mutate: func(m map[string]any) { m["skills"] = []string{strings.Repeat("x", 41)} }},
		{name: "skill_40", status: 200, mutate: func(m map[string]any) { m["skills"] = []string{strings.Repeat("x", 40)} }},
		{name: "availability_empty", message: "Disponibilitatea trebuie să aibă între 1 și 80 de caractere.", status: 400, mutate: func(m map[string]any) { m["availability"] = "" }},
		{name: "availability_81", message: "Disponibilitatea trebuie să aibă între 1 și 80 de caractere.", status: 400, mutate: func(m map[string]any) { m["availability"] = strings.Repeat("a", 81) }},
		{name: "bio_281", message: "Bio poate avea cel mult 280 de caractere.", status: 400, mutate: func(m map[string]any) { m["bio"] = strings.Repeat("b", 281) }},
		{name: "bio_empty", status: 200, mutate: func(m map[string]any) { m["bio"] = "" }},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			item := map[string]any{}
			for k, v := range valid {
				item[k] = v
			}
			row.mutate(item)
			status, _, payload := h.do(http.MethodPut, "/v1/profiles/me", "worker-1", item, true)
			if row.status == 200 {
				if status != 200 {
					t.Fatalf("%d %s", status, payload)
				}
				return
			}
			h.errorCode(status, payload, 400, "invalid_input", row.message)
		})
	}
}

func TestApplyFlow(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", fixture(t, "apply-request.json"), true)
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	got := asMap(t, asMap(t, decode(t, body))["application"])
	want := asMap(t, asMap(t, fixture(t, "application.json"))["application"])
	if !appIDPattern.MatchString(got["id"].(string)) {
		t.Fatalf("app id %v", got["id"])
	}
	offsetOK(t, got["created_at"].(string))
	delete(got, "id")
	delete(got, "created_at")
	delete(want, "id")
	delete(want, "created_at")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("application %#v want %#v", got, want)
	}
	status, _, listed := h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup/applications", "poster-1", nil, true)
	apps := asMap(t, decode(t, listed))["applications"].([]any)
	if status != 200 || len(apps) != 1 {
		t.Fatalf("poster list %d %s", status, listed)
	}
	status, _, mine := h.do(http.MethodGet, "/v1/me/applications", "worker-1", nil, true)
	mineApps := asMap(t, decode(t, mine))["applications"].([]any)
	if status != 200 || len(mineApps) != 1 || asMap(t, asMap(t, mineApps[0])["task"])["status"] != "open" {
		t.Fatalf("mine %d %s", status, mine)
	}
	status, _, again := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", fixture(t, "apply-request.json"), true)
	h.equalFixture(status, again, 409, "error-duplicate-application.json")
	status, _, missing := h.do(http.MethodPost, "/v1/tasks/missing/applications", "worker-1", fixture(t, "apply-request.json"), true)
	h.equalFixture(status, missing, 404, "error-not-found.json")
	status, _, _ = h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("hide %d", status)
	}
	status, _, hidden := h.do(http.MethodPost, "/v1/tasks/task_seed_shop_cover/applications", "worker-1", fixture(t, "apply-request.json"), true)
	h.equalFixture(status, hidden, 404, "error-not-found.json")

	taskID := h.createSeedLike()
	status, applied := h.apply(taskID, "Pot ajunge.")
	if status != 201 {
		t.Fatalf("second apply %d %s", status, applied)
	}
	appID := asMap(t, asMap(t, decode(t, applied))["application"])["id"].(string)
	status, _, _ = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept second %d", status)
	}
	status, _, closed := h.do(http.MethodPost, "/v1/tasks/"+taskID+"/applications", "worker-1", map[string]any{"message": "din nou"}, true)
	h.errorCode(status, closed, 409, "task_not_open", "Sarcina nu este deschisă.")
}

func TestApplyValidation(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", map[string]any{"message": ""}, true)
	h.errorCode(status, body, 400, "invalid_input", "Mesajul trebuie să aibă între 1 și 280 de caractere.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", map[string]any{"message": strings.Repeat("m", 281)}, true)
	h.errorCode(status, body, 400, "invalid_input", "Mesajul trebuie să aibă între 1 și 280 de caractere.")
	first := h.createSeedLike()
	status, body = h.apply(first, "a")
	if status != 201 {
		t.Fatalf("one char %d %s", status, body)
	}
	second := h.createSeedLike()
	status, body = h.apply(second, strings.Repeat("m", 280))
	if status != 201 {
		t.Fatalf("280 %d %s", status, body)
	}
}

func TestApplyOwnTask(t *testing.T) {
	h := start(t)
	_, err := h.DB.Exec(`INSERT INTO tasks (id, poster_id, title, category, city, starts_at, ends_at, amount_bani, description, safety_note, status, assignee_id, created_at)
VALUES ('task_own', 'worker-1', 'Propria', 'other', 'București', '2026-10-05T14:00:00+03:00', '2026-10-05T15:00:00+03:00', 0, 'Sarcină de test pentru regula proprie.', '', 'open', NULL, '2026-10-04T12:07:00+03:00')`)
	if err != nil {
		t.Fatal(err)
	}
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_own/applications", "worker-1", map[string]any{"message": "eu"}, true)
	h.errorCode(status, body, 409, "cannot_apply_own_task", "Nu poți aplica la propria sarcină.")
}

func TestProfileRequired(t *testing.T) {
	h := start(t)
	if _, err := h.DB.Exec(`DELETE FROM profiles WHERE user_id='worker-1'`); err != nil {
		t.Fatal(err)
	}
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", fixture(t, "apply-request.json"), true)
	h.errorCode(status, body, 409, "profile_required", "Completează profilul înainte să aplici.")
	status, _, body = h.do(http.MethodGet, "/v1/profiles/me", "worker-1", nil, true)
	h.equalFixture(status, body, 404, "error-not-found.json")
}

func TestAcceptRejectsOtherPending(t *testing.T) {
	h := start(t)
	_, err := h.DB.Exec(`INSERT INTO users (id, role, display_name) VALUES ('worker-2', 'worker', 'Ion Test')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = h.DB.Exec(`INSERT INTO profiles (user_id, skills_json, city, availability, bio) VALUES ('worker-2', '["test"]', 'București', 'Oricând', 'Profil de test.')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = h.DB.Exec(`INSERT INTO applications (id, task_id, worker_id, message, status, created_at) VALUES ('app_worker2test0001', 'task_seed_event_setup', 'worker-2', 'A doua aplicare.', 'pending', '2026-10-04T12:31:00+03:00')`)
	if err != nil {
		t.Fatal(err)
	}
	status, body := h.apply("task_seed_event_setup", "Pot ajunge la 13:45 și ajut la amenajare.")
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	appID := asMap(t, asMap(t, decode(t, body))["application"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept %d %s", status, body)
	}
	task := asMap(t, asMap(t, decode(t, body))["task"])
	if task["status"] != "assigned" || task["assignee_id"] != "worker-1" || task["assignee_name"] != "Maria Ionescu" {
		t.Fatalf("assigned %#v", task)
	}
	var other, accepted int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM applications WHERE id='app_worker2test0001' AND status='rejected'`).Scan(&other); err != nil || other != 1 {
		t.Fatalf("other rejected %d %v", other, err)
	}
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM applications WHERE status='accepted'`).Scan(&accepted); err != nil || accepted != 1 {
		t.Fatalf("accepted %d %v", accepted, err)
	}
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	h.errorCode(status, body, 409, "task_already_assigned", "Sarcina este deja atribuită.")
}

func TestConcurrentAccept(t *testing.T) {
	h := start(t)
	status, body := h.apply("task_seed_event_setup", "Pot ajunge.")
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	appID := asMap(t, asMap(t, decode(t, body))["application"])["id"].(string)
	var wg sync.WaitGroup
	codes := make([]int, 20)
	payloads := make([][]byte, 20)
	for i := range codes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			codes[i], _, payloads[i] = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
		}(i)
	}
	wg.Wait()
	ok, conflict := 0, 0
	for i, code := range codes {
		switch code {
		case 200:
			ok++
		case 409:
			conflict++
			h.errorCode(code, payloads[i], 409, "task_already_assigned", "Sarcina este deja atribuită.")
		default:
			t.Fatalf("status %d %s", code, payloads[i])
		}
	}
	if ok != 1 || conflict != 19 {
		t.Fatalf("ok %d conflict %d", ok, conflict)
	}
	var assignee string
	var accepted int
	if err := h.DB.QueryRow(`SELECT assignee_id FROM tasks WHERE id='task_seed_event_setup'`).Scan(&assignee); err != nil || assignee != "worker-1" {
		t.Fatalf("assignee %s %v", assignee, err)
	}
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM applications WHERE task_id='task_seed_event_setup' AND status='accepted'`).Scan(&accepted); err != nil || accepted != 1 {
		t.Fatalf("accepted %d %v", accepted, err)
	}
}

func TestComplete(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	h.errorCode(status, body, 409, "task_not_assigned", "Sarcina nu este atribuită.")
	_, applied := h.apply("task_seed_event_setup", "Pot ajunge.")
	appID := asMap(t, asMap(t, decode(t, applied))["application"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	task := asMap(t, asMap(t, decode(t, body))["task"])
	if status != 200 || task["status"] != "completed" || task["assignee_id"] != "worker-1" {
		t.Fatalf("complete %#v %s", task, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	h.errorCode(status, body, 409, "task_not_assigned", "Sarcina nu este atribuită.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "worker-1", map[string]any{}, true)
	h.equalFixture(status, body, 403, "error-forbidden.json")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/missing/complete", "poster-1", map[string]any{}, true)
	h.equalFixture(status, body, 404, "error-not-found.json")
}

func TestReviews(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", fixture(t, "review-request.json"), true)
	h.errorCode(status, body, 409, "task_not_completed", "Sarcina nu este finalizată.")
	_, applied := h.apply("task_seed_event_setup", "Pot ajunge.")
	appID := asMap(t, asMap(t, decode(t, applied))["application"])["id"].(string)
	h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", map[string]any{"stars": 0, "text": "x"}, true)
	h.errorCode(status, body, 400, "invalid_input", "Nota trebuie să fie un număr întreg între 1 și 5.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", map[string]any{"stars": 6, "text": "x"}, true)
	h.errorCode(status, body, 400, "invalid_input", "Nota trebuie să fie un număr întreg între 1 și 5.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", `{"stars":4.5,"text":"x"}`, true)
	h.equalFixture(status, body, 400, "error-invalid-json.json")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", map[string]any{"stars": 5, "text": ""}, true)
	h.errorCode(status, body, 400, "invalid_input", "Textul trebuie să aibă între 1 și 280 de caractere.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", map[string]any{"stars": 5, "text": strings.Repeat("r", 281)}, true)
	h.errorCode(status, body, 400, "invalid_input", "Textul trebuie să aibă între 1 și 280 de caractere.")

	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", fixture(t, "review-request.json"), true)
	if status != 201 {
		t.Fatalf("poster review %d %s", status, body)
	}
	got := asMap(t, asMap(t, decode(t, body))["review"])
	want := asMap(t, asMap(t, fixture(t, "review.json"))["review"])
	if !revIDPattern.MatchString(got["id"].(string)) {
		t.Fatalf("review id %v", got["id"])
	}
	offsetOK(t, got["created_at"].(string))
	delete(got, "id")
	delete(got, "created_at")
	delete(want, "id")
	delete(want, "created_at")
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("review %#v want %#v", got, want)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "worker-1", map[string]any{"stars": 4, "text": "Sarcină clară."}, true)
	worker := asMap(t, asMap(t, decode(t, body))["review"])
	if status != 201 || worker["author_id"] != "worker-1" || worker["author_name"] != "Maria Ionescu" || worker["subject_id"] != "poster-1" || worker["subject_name"] != "Andrei Popescu" {
		t.Fatalf("worker review %d %#v", status, worker)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", fixture(t, "review-request.json"), true)
	h.errorCode(status, body, 409, "duplicate_review", "Ai lăsat deja o recenzie.")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "worker-1", map[string]any{"stars": 4, "text": "Sarcină clară."}, true)
	h.errorCode(status, body, 409, "duplicate_review", "Ai lăsat deja o recenzie.")
	status, _, listed := h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup/reviews", "", nil, false)
	reviews := asMap(t, decode(t, listed))["reviews"].([]any)
	if status != 200 || asMap(t, reviews[0])["author_id"] != "poster-1" || asMap(t, reviews[1])["author_id"] != "worker-1" {
		t.Fatalf("review order %s", listed)
	}

	other := h.createSeedLike()
	status, applied = h.apply(other, "a")
	if status != 201 {
		t.Fatalf("other apply %d %s", status, applied)
	}
	otherApp := asMap(t, asMap(t, decode(t, applied))["application"])["id"].(string)
	h.do(http.MethodPost, "/v1/applications/"+otherApp+"/accept", "poster-1", map[string]any{}, true)
	h.do(http.MethodPost, "/v1/tasks/"+other+"/complete", "poster-1", map[string]any{}, true)
	status, _, body = h.do(http.MethodPost, "/v1/tasks/"+other+"/reviews", "poster-1", map[string]any{"stars": 1, "text": "a"}, true)
	if status != 201 {
		t.Fatalf("short review %d %s", status, body)
	}
}

func TestHideAndAdminList(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	h.equalFixture(status, body, 200, "task-hidden.json")
	status, _, body = h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	if status != 200 || asMap(t, asMap(t, decode(t, body))["task"])["status"] != "hidden" {
		t.Fatalf("second hide %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_shop_cover", "", nil, false)
	h.equalFixture(status, body, 404, "error-not-found.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if contains(ids(t, body), "task_seed_shop_cover") {
		t.Fatalf("public still has hidden %s", body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/me/tasks", "poster-1", nil, true)
	if contains(ids(t, body), "task_seed_shop_cover") {
		t.Fatalf("mine still has hidden %s", body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/admin/tasks", "admin-1", nil, true)
	found := false
	for _, item := range asMap(t, decode(t, body))["tasks"].([]any) {
		task := asMap(t, item)
		if task["id"] == "task_seed_shop_cover" && task["status"] == "hidden" {
			found = true
		}
	}
	if status != 200 || !found {
		t.Fatalf("admin list %s", body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/admin/tasks/task_missing/hide", "admin-1", map[string]any{}, true)
	h.equalFixture(status, body, 404, "error-not-found.json")
}

func TestResetRestoresSeed(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPut, "/v1/profiles/me", "worker-1", map[string]any{
		"skills": []string{"una"}, "city": "Cluj", "availability": "Seara", "bio": "schimbat",
	}, true)
	if status != 200 {
		t.Fatalf("bio %d %s", status, body)
	}
	created := h.createSeedLike()
	status, applied := h.apply("task_seed_event_setup", "Pot ajunge.")
	appID := asMap(t, asMap(t, decode(t, applied))["application"])["id"].(string)
	h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/reviews", "poster-1", fixture(t, "review-request.json"), true)
	h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	status, _, body = h.do(http.MethodPost, "/v1/demo/reset", "admin-1", map[string]any{}, true)
	h.equalFixture(status, body, 200, "health.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	h.equalFixture(status, body, 200, "task-list.json")
	status, _, body = h.do(http.MethodGet, "/v1/profiles/me", "worker-1", nil, true)
	h.equalFixture(status, body, 200, "profile.json")
	status, _, body = h.do(http.MethodGet, "/v1/me/applications", "worker-1", nil, true)
	h.equalFixture(status, body, 200, "application-list-empty.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup/reviews", "", nil, false)
	h.equalFixture(status, body, 200, "review-list-empty.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks/"+created, "", nil, false)
	h.equalFixture(status, body, 404, "error-not-found.json")
}

func TestCORS(t *testing.T) {
	h := start(t)
	for _, origin := range []string{"http://127.0.0.1:5173", "http://localhost:5173", "http://10.0.2.2:8081", "http://192.168.1.20:8081", "https://nimbusnova.cc", "https://www.nimbusnova.cc", "https://app.nimbusnova.cc", "https://admin.nimbusnova.cc"} {
		req, _ := http.NewRequest(http.MethodGet, h.URL+"/v1/tasks", nil)
		req.Header.Set("Origin", origin)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.Header.Get("Access-Control-Allow-Origin") != origin {
			t.Fatalf("origin %s got %q", origin, res.Header.Get("Access-Control-Allow-Origin"))
		}
	}
	req, _ := http.NewRequest(http.MethodGet, h.URL+"/v1/tasks", nil)
	req.Header.Set("Origin", "https://vnuhack.com")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("disallowed origin echoed %q", res.Header.Get("Access-Control-Allow-Origin"))
	}
	preflight := func(origin string) *http.Response {
		t.Helper()
		req, _ := http.NewRequest(http.MethodOptions, h.URL+"/v1/tasks", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "Content-Type, X-Demo-Actor")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		return res
	}
	res = preflight("http://localhost:5173")
	payload, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 204 || len(payload) != 0 || res.Header.Get("Access-Control-Allow-Origin") != "http://localhost:5173" || !strings.Contains(res.Header.Get("Access-Control-Allow-Methods"), "POST") || !strings.Contains(res.Header.Get("Access-Control-Allow-Headers"), "Content-Type") || !strings.Contains(res.Header.Get("Access-Control-Allow-Headers"), "X-Demo-Actor") || !strings.Contains(res.Header.Get("Access-Control-Allow-Headers"), "Authorization") {
		t.Fatalf("preflight %d %q headers %#v", res.StatusCode, payload, res.Header)
	}
	res = preflight("https://evil.example")
	payload, _ = io.ReadAll(res.Body)
	res.Body.Close()
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("evil preflight %d %q", res.StatusCode, res.Header.Get("Access-Control-Allow-Origin"))
	}
}

func TestDemoFlow(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodGet, "/health", "", nil, false)
	h.equalFixture(status, body, 200, "health.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	h.equalFixture(status, body, 200, "task-list.json")
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_event_setup", "", nil, false)
	h.equalFixture(status, body, 200, "task-open.json")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "", fixture(t, "apply-request.json"), false)
	h.equalFixture(status, body, 401, "error-missing-actor.json")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", fixture(t, "apply-request.json"), true)
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	app := asMap(t, asMap(t, decode(t, body))["application"])
	if app["worker_id"] != "worker-1" || app["status"] != "pending" || app["message"] != "Pot ajunge la 13:45 și ajut la amenajare." {
		t.Fatalf("shape %#v", app)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", fixture(t, "apply-request.json"), true)
	h.equalFixture(status, body, 409, "error-duplicate-application.json")
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+app["id"].(string)+"/accept", "poster-1", map[string]any{}, true)
	task := asMap(t, asMap(t, decode(t, body))["task"])
	if status != 200 || task["status"] != "assigned" || task["assignee_id"] != "worker-1" || task["assignee_name"] != "Maria Ionescu" {
		t.Fatalf("accept %#v", task)
	}
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+app["id"].(string)+"/accept", "poster-1", map[string]any{}, true)
	h.errorCode(status, body, 409, "task_already_assigned", "Sarcina este deja atribuită.")
	status, _, body = h.do(http.MethodGet, "/v1/me/applications", "worker-1", nil, true)
	mine := asMap(t, asMap(t, decode(t, body))["applications"].([]any)[0])
	if status != 200 || asMap(t, mine["task"])["status"] != "assigned" {
		t.Fatalf("mine %s", body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	if status != 200 || asMap(t, asMap(t, decode(t, body))["task"])["status"] != "completed" {
		t.Fatalf("complete %s", body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/admin/tasks/task_seed_shop_cover/hide", "admin-1", map[string]any{}, true)
	if status != 200 || asMap(t, asMap(t, decode(t, body))["task"])["status"] != "hidden" {
		t.Fatalf("hide %s", body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	if contains(ids(t, body), "task_seed_shop_cover") {
		t.Fatalf("list %s", body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks/task_seed_shop_cover", "", nil, false)
	h.equalFixture(status, body, 404, "error-not-found.json")
	status, _, body = h.do(http.MethodPost, "/v1/demo/reset", "admin-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("reset %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/tasks", "", nil, false)
	h.equalFixture(status, body, 200, "task-list.json")
}

func (h *harness) doBearer(method, path, token string, body any) (int, []byte) {
	h.t.Helper()
	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			h.t.Fatal(err)
		}
		rdr = bytes.NewReader(buf)
	}
	req, err := http.NewRequest(method, h.URL+path, rdr)
	if err != nil {
		h.t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(res.Body)
	if err != nil {
		h.t.Fatal(err)
	}
	return res.StatusCode, payload
}

func TestAuthAndDemoHeader(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/tasks", "poster-1", cloneMap(t, "create-task-request.json"), true)
	if status != 201 {
		t.Fatalf("demo create %d %s", status, body)
	}
	t.Setenv("NOVA_DEMO", "0")
	status, _, body = h.do(http.MethodPost, "/v1/tasks", "poster-1", cloneMap(t, "create-task-request.json"), true)
	h.errorCode(status, body, 401, "demo_disabled", "Modul demo este oprit.")
	t.Setenv("NOVA_DEMO", "1")

	reg := map[string]any{
		"role": "poster", "email": "andrei@example.com", "password": "correct-horse",
		"display_name": "Andrei Popescu", "birth_date": "2000-01-01",
		"identity_proof": verifiedProofFixture(t, h, "andrei@example.com"),
	}
	status, payload := h.doBearer(http.MethodPost, "/v1/auth/register", "", reg)
	if status != 201 {
		t.Fatalf("register %d %s", status, payload)
	}
	user := asMap(t, asMap(t, decode(t, payload))["user"])
	if user["role"] != "poster" || user["display_name"] != "Andrei Popescu" || user["volunteer_only"] != false || !strings.HasPrefix(user["id"].(string), "user_") {
		t.Fatalf("user %#v", user)
	}
	if _, ok := user["email"]; ok || strings.Contains(string(payload), "password") {
		t.Fatalf("secret leaked %s", payload)
	}
	status, payload = h.doBearer(http.MethodPost, "/v1/auth/register", "", map[string]any{
		"role": "worker", "email": "minor@example.com", "password": "correct-horse",
		"display_name": "Minor Pop", "birth_date": "2015-01-01",
	})
	h.errorCode(status, payload, 409, "identity_required", "Verifică identitatea înainte de cont.")
	status, payload = h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": "andrei@example.com", "password": "wrong-password"})
	h.errorCode(status, payload, 401, "invalid_credentials", "Email sau parolă incorectă.")
	status, payload = h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": "andrei@example.com", "password": "correct-horse"})
	if status != 200 {
		t.Fatalf("login %d %s", status, payload)
	}
	token := asMap(t, decode(t, payload))["token"].(string)
	if len(token) != 64 {
		t.Fatalf("token %s", token)
	}
	status, payload = h.doBearer(http.MethodGet, "/v1/me", token, nil)
	if status != 200 || asMap(t, asMap(t, decode(t, payload))["user"])["id"] != user["id"] {
		t.Fatalf("me %d %s", status, payload)
	}
	status, payload = h.doBearer(http.MethodPost, "/v1/auth/logout", token, map[string]any{})
	if status != 200 {
		t.Fatalf("logout %d %s", status, payload)
	}
	status, payload = h.doBearer(http.MethodGet, "/v1/me", token, nil)
	h.errorCode(status, payload, 401, "invalid_token", "Token invalid.")
	status, _, body = h.do(http.MethodPost, "/v1/contracts/framework", "poster-1", map[string]any{}, true)
	h.equalFixture(status, body, 403, "error-forbidden.json")
}

func TestPayLedgerAndContract(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/contracts/framework", "worker-1", map[string]any{}, true)
	if status != 200 || asMap(t, asMap(t, decode(t, body))["contract"])["status"] != "signed" {
		t.Fatalf("framework %d %s", status, body)
	}
	status, body = h.apply("task_seed_event_setup", "Pot ajunge.")
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	appID := asMap(t, asMap(t, decode(t, body))["application"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept %d %s", status, body)
	}
	var workOrders int
	if err := h.DB.QueryRow(`SELECT COUNT(*) FROM contracts WHERE task_id='task_seed_event_setup' AND kind='work_order' AND status='signed'`).Scan(&workOrders); err != nil || workOrders != 1 {
		t.Fatalf("work order %d %v", workOrders, err)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/pay", "worker-1", map[string]any{}, true)
	h.equalFixture(status, body, 403, "error-forbidden.json")
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/pay", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("pay %d %s", status, body)
	}
	payment := asMap(t, asMap(t, decode(t, body))["payment"])
	if payment["pay_status"] != "held" || payment["amount_bani"] != json.Number("10000") || payment["platform_fee_bani"] != json.Number("1500") || payment["worker_payout_bani"] != json.Number("8500") || payment["provider"] != "simulated" {
		t.Fatalf("payment %#v", payment)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/complete", "poster-1", map[string]any{}, true)
	if status != 200 || asMap(t, asMap(t, decode(t, body))["task"])["status"] != "completed" {
		t.Fatalf("complete %s", body)
	}
	var debit, credit int
	if err := h.DB.QueryRow(`SELECT COALESCE(SUM(amount_bani),0) FROM ledger_entries WHERE task_id='task_seed_event_setup' AND direction='debit'`).Scan(&debit); err != nil || debit != 20000 {
		t.Fatalf("debit %d %v", debit, err)
	}
	if err := h.DB.QueryRow(`SELECT COALESCE(SUM(amount_bani),0) FROM ledger_entries WHERE task_id='task_seed_event_setup' AND direction='credit'`).Scan(&credit); err != nil || credit != 20000 {
		t.Fatalf("credit %d %v", credit, err)
	}
	if _, err := h.DB.Exec(`UPDATE tasks SET kind='volunteer', status='assigned', assignee_id='worker-1', pay_status='unpaid' WHERE id='task_seed_shop_cover'`); err != nil {
		t.Fatal(err)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_shop_cover/pay", "poster-1", map[string]any{}, true)
	h.errorCode(status, body, 409, "volunteer_unpaid", "Sarcina de voluntariat nu se plătește.")
}

func TestEventsHaveNoMoney(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodGet, "/v1/events", "", nil, false)
	if status != 200 {
		t.Fatalf("events %d %s", status, body)
	}
	events := asMap(t, decode(t, body))["events"].([]any)
	if len(events) != 1 || asMap(t, events[0])["id"] != "event_seed_cartier" {
		t.Fatalf("seed event %s", body)
	}
	if _, ok := asMap(t, events[0])["amount_bani"]; ok {
		t.Fatalf("money field on event %s", body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/events", "poster-1", map[string]any{
		"title": "Alt eveniment", "city": "București", "starts_at": "2026-10-07T09:00:00+03:00",
		"ends_at": "2026-10-07T11:00:00+03:00", "slots": 4, "min_age": 14, "description": "Fără plată.",
	}, true)
	h.equalFixture(status, body, 403, "error-forbidden.json")
}

func TestPlatformRoutes(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodGet, "/v1/tasks/search?kind=local_task", "worker-1", nil, true)
	if status != 200 || !strings.Contains(string(body), "task_seed_event_setup") {
		t.Fatalf("search %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/profiles/me/documents", "worker-1", map[string]any{"kind": "id_card"}, true)
	if status != 201 || !strings.Contains(string(body), `"kind":"id_card"`) {
		t.Fatalf("document %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/me/contracts", "worker-1", nil, true)
	if status != 200 || !strings.Contains(string(body), "framework") {
		t.Fatalf("contracts %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_event_setup/applications", "worker-1", map[string]any{"message": "Pot ajuta la amenajare."}, true)
	if status != 201 {
		t.Fatalf("apply %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/me/notifications", "poster-1", nil, true)
	if status != 200 || !strings.Contains(string(body), "application_received") {
		t.Fatalf("notifications %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks", "poster-1", map[string]any{
		"title": "Disputa", "category": "other", "city": "București",
		"starts_at": "2026-10-06T10:00:00+03:00", "ends_at": "2026-10-06T12:00:00+03:00",
		"amount_bani": 10000, "description": "1234567890", "safety_note": "ok",
	}, true)
	if status != 201 {
		t.Fatalf("create %d %s", status, body)
	}
	taskID := asMap(t, asMap(t, decode(t, body))["task"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/tasks/"+taskID+"/applications", "worker-1", map[string]any{"message": "Pot ajuta la mutare."}, true)
	if status != 201 {
		t.Fatalf("apply2 %d %s", status, body)
	}
	appID := asMap(t, asMap(t, decode(t, body))["application"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/applications/"+appID+"/accept", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("accept %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/"+taskID+"/pay", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("pay %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/me/ledger", "poster-1", nil, true)
	if status != 200 || !strings.Contains(string(body), "poster") {
		t.Fatalf("ledger %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/"+taskID+"/dispute", "poster-1", map[string]any{"reason": "Nu s-a prezentat."}, true)
	if status != 201 {
		t.Fatalf("dispute %d %s", status, body)
	}
	disputeID := asMap(t, asMap(t, decode(t, body))["dispute"])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/tasks/"+taskID+"/complete", "poster-1", map[string]any{}, true)
	if status != 409 || !strings.Contains(string(body), "dispute_open") {
		t.Fatalf("complete blocked %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/admin/disputes/"+disputeID+"/resolve", "admin-1", map[string]any{"result": "refund"}, true)
	if status != 200 {
		t.Fatalf("resolve %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/tasks/task_seed_shop_cover/cancel", "poster-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("cancel %d %s", status, body)
	}
	if _, err := h.DB.Exec(`INSERT INTO users (id, role, display_name) VALUES ('partner-1', 'partner_user', 'Partener')`); err != nil {
		t.Fatal(err)
	}
	if _, err := h.DB.Exec(`INSERT INTO partners (id, name, status, user_id) VALUES ('par_test', 'Magazin', 'prospect', 'partner-1')`); err != nil {
		t.Fatal(err)
	}
	status, _, body = h.do(http.MethodPost, "/v1/partner/shifts", "partner-1", map[string]any{
		"title": "Schimb", "category": "shop_cover", "city": "București",
		"starts_at": "2026-10-06T10:00:00+03:00", "ends_at": "2026-10-06T14:00:00+03:00",
		"amount_bani": 20000, "description": "Acoperire magazin", "safety_note": "ok",
	}, true)
	if status != 403 || !strings.Contains(string(body), "partner_inactive") {
		t.Fatalf("inactive partner %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/admin/partners/par_test/activate", "admin-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("activate %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/partner/shifts", "partner-1", map[string]any{
		"title": "Schimb", "category": "shop_cover", "city": "București",
		"starts_at": "2026-10-06T10:00:00+03:00", "ends_at": "2026-10-06T14:00:00+03:00",
		"amount_bani": 20000, "description": "Acoperire magazin", "safety_note": "ok",
	}, true)
	if status != 201 {
		t.Fatalf("shift %d %s", status, body)
	}
	var kind string
	if err := h.DB.QueryRow(`SELECT kind FROM tasks WHERE poster_id = 'partner-1'`).Scan(&kind); err != nil || kind != "partner_shift" {
		t.Fatalf("shift kind %q err %v body %s", kind, err, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/events", "worker-1", nil, true)
	events := asMap(t, decode(t, body))["events"].([]any)
	eventID := asMap(t, events[0])["id"].(string)
	status, _, body = h.do(http.MethodPost, "/v1/events/"+eventID+"/attend", "worker-1", map[string]any{}, true)
	if status != 200 {
		t.Fatalf("attend %d %s", status, body)
	}
	if _, err := h.DB.Exec(`INSERT INTO users (id, role, display_name) VALUES ('org-1', 'organizer', 'Organizator')`); err != nil {
		t.Fatal(err)
	}
	status, _, body = h.do(http.MethodPost, "/v1/events/"+eventID+"/check-in", "org-1", map[string]any{"volunteer_id": "worker-1"}, true)
	if status != 200 {
		t.Fatalf("check-in %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/events/"+eventID+"/complete", "org-1", map[string]any{"volunteer_id": "worker-1"}, true)
	if status != 200 || !strings.Contains(string(body), "diploma") {
		t.Fatalf("diploma %d %s", status, body)
	}
	status, _, body = h.do(http.MethodGet, "/v1/users/poster-1/reputation", "worker-1", nil, true)
	if status != 200 || !strings.Contains(string(body), "count") {
		t.Fatalf("reputation %d %s", status, body)
	}
}

func TestIdentityUnavailableCannotIssueProof(t *testing.T) {
	h := start(t)
	status, _, body := h.do(http.MethodPost, "/v1/auth/identity", "", map[string]any{"email": "new@example.test", "kind": "ci"}, false)
	if status != 503 || !strings.Contains(string(body), "identity_unavailable") {
		t.Fatalf("unconfigured identity %d %s", status, body)
	}
	status, _, body = h.do(http.MethodPost, "/v1/auth/register", "", map[string]any{"role": "worker", "email": "new@example.test", "password": "correct-horse", "display_name": "New Person", "identity_proof": "made-up"}, false)
	if status != 409 {
		t.Fatalf("fake proof %d %s", status, body)
	}
}

func TestListingPlaceFields(t *testing.T) {
	h := start(t)
	body := cloneMap(h.t, "create-task-request.json")
	body["photo_url"] = "https://example.com/task.jpg"
	body["sector"] = "Sector 1"
	body["lat"] = 44.0
	body["lng"] = 26.0
	status, _, raw := h.do(http.MethodPost, "/v1/tasks", "poster-1", body, true)
	if status != http.StatusCreated {
		t.Fatalf("create %d %s", status, raw)
	}
	task := asMap(t, asMap(t, decode(t, raw))["task"])
	if task["photo_url"] != "https://example.com/task.jpg" || task["sector"] != "Sector 1" || task["lat"] != json.Number("44") || task["lng"] != json.Number("26") {
		t.Fatalf("created %#v", task)
	}
	id := task["id"].(string)
	status, _, raw = h.do(http.MethodGet, "/v1/tasks?sector=sector%201", "", nil, false)
	if status != 200 || !contains(ids(t, raw), id) {
		t.Fatalf("sector %d %s", status, raw)
	}
	status, _, raw = h.do(http.MethodGet, "/v1/tasks?lat=44&lng=26&radius_km=5", "", nil, false)
	if status != 200 || !contains(ids(t, raw), id) || contains(ids(t, raw), "task_seed_event_setup") {
		t.Fatalf("near %d %s", status, raw)
	}
	status, _, raw = h.do(http.MethodGet, "/v1/tasks?radius_km=5", "", nil, false)
	h.errorCode(status, raw, 400, "invalid_input", "Pentru căutare în apropiere trimite lat, lng și radius_km.")
	status, _, raw = h.do(http.MethodGet, "/v1/tasks?lat=44&lng=26", "", nil, false)
	h.errorCode(status, raw, 400, "invalid_input", "Pentru căutare în apropiere trimite lat, lng și radius_km.")
}

func TestProductionAdmin(t *testing.T) {
	t.Setenv("NOVA_DEMO", "0")
	t.Setenv("ADMIN_EMAIL", "admin@nimbusnova.cc")
	t.Setenv("ADMIN_PASSWORD", "correct-horse")
	dbPath := filepath.Join(t.TempDir(), "nova.db")
	api, err := server.New(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.Handler())
	t.Cleanup(func() {
		srv.Close()
		_ = api.Close()
	})
	h := &harness{t: t, URL: srv.URL, DB: api.DB(), srv: srv, api: api}
	status, _, body := h.do(http.MethodPost, "/v1/demo/reset", "admin-1", map[string]any{}, true)
	h.errorCode(status, body, 401, "demo_disabled", "Modul demo este oprit.")
	status, raw := h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": "admin@nimbusnova.cc", "password": "correct-horse"})
	if status != 200 {
		t.Fatalf("login %d %s", status, raw)
	}
	token := asMap(t, decode(t, raw))["token"].(string)
	status, raw = h.doBearer(http.MethodGet, "/v1/admin/users", token, nil)
	if status != 200 || !strings.Contains(string(raw), "admin@nimbusnova.cc") {
		t.Fatalf("users %d %s", status, raw)
	}
	worker := ""
	for _, item := range asMap(t, decode(t, raw))["users"].([]any) {
		user := asMap(t, item)
		if user["id"] == "worker-1" {
			worker = "worker-1"
		}
	}
	if worker == "" {
		t.Fatal("missing seeded worker")
	}
	status, raw = h.doBearer(http.MethodPost, "/v1/admin/users/worker-1/suspend", token, map[string]any{})
	if status != 200 {
		t.Fatalf("suspend %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/admin/logs", token, nil)
	if status != 200 || !strings.Contains(string(raw), "user_suspend") {
		t.Fatalf("logs %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodPost, "/v1/demo/reset", token, map[string]any{})
	if status != 404 {
		t.Fatalf("reset %d %s", status, raw)
	}
}

// This is test-owned database setup, never a production verification endpoint.
func verifiedProofFixture(t *testing.T, h *harness, email string) string {
	t.Helper()
	token := "synthetic-verified-proof-" + email
	hash := sha256.Sum256([]byte(token))
	_, err := h.DB.Exec(`INSERT INTO identity_sessions(id,email,kind,status,birth_date,proof_hash,expires_at,created_at,checks_json,verified_provider) VALUES(?,?,'ci','verified','2000-01-01',?,?,?,?,'idanalyzer-v2-eu')`, "synthetic-"+email, email, hex.EncodeToString(hash[:]), time.Now().Add(time.Hour).In(time.FixedZone("fixture", 3*3600)).Format(time.RFC3339), time.Now().Format(time.RFC3339), `{"files":"passed","cnp":"passed","selfie":"passed","face_match":"passed","document":"passed"}`)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func TestAdminDeskRoutes(t *testing.T) {
	h := start(t)
	get := func(path string) map[string]any {
		t.Helper()
		status, _, body := h.do(http.MethodGet, path, "admin-1", nil, true)
		if status != 200 {
			t.Fatalf("GET %s %d %s", path, status, body)
		}
		return asMap(t, decode(t, body))
	}
	post := func(path string, body any, want int) map[string]any {
		t.Helper()
		status, _, raw := h.do(http.MethodPost, path, "admin-1", body, true)
		if status != want {
			t.Fatalf("POST %s %d %s", path, status, raw)
		}
		return asMap(t, decode(t, raw))
	}

	stats := asMap(t, get("/v1/admin/stats")["stats"])
	if len(stats["daily"].([]any)) != 14 {
		t.Fatalf("daily series %v", stats["daily"])
	}
	if len(asMap(t, get("/v1/admin/stats?days=30")["stats"])["daily"].([]any)) != 30 {
		t.Fatal("30-day series")
	}
	system := asMap(t, get("/v1/admin/system")["system"])
	if system["demo_mode"] != true || asMap(t, system["tables"])["users"] == nil {
		t.Fatalf("system %v", system)
	}

	user := get("/v1/admin/users/worker-1")
	if asMap(t, user["user"])["display_name"] != "Maria Ionescu" || user["profile"] == nil {
		t.Fatalf("user detail %v", user)
	}
	status, _, body := h.do(http.MethodGet, "/v1/admin/users/missing", "admin-1", nil, true)
	h.errorCode(status, body, 404, "not_found", "Nu există.")

	task := get("/v1/admin/tasks/task_seed_event_setup")
	if asMap(t, task["task"])["id"] != "task_seed_event_setup" || task["pay_status"] != "unpaid" {
		t.Fatalf("task detail %v", task)
	}

	h.apply("task_seed_event_setup", "Pot ajuta la amenajare.")
	apps := get("/v1/admin/applications")["applications"].([]any)
	if len(apps) != 1 || asMap(t, apps[0])["task_title"] == "" {
		t.Fatalf("applications %v", apps)
	}
	if _, ok := get("/v1/admin/reviews")["reviews"].([]any); !ok {
		t.Fatal("reviews list")
	}
	if _, ok := get("/v1/admin/identity")["sessions"].([]any); !ok {
		t.Fatal("identity list")
	}

	note := asMap(t, post("/v1/admin/notes", map[string]any{"target": "worker-1", "text": "Verificat la telefon."}, 201)["note"])
	if note["text"] != "Verificat la telefon." {
		t.Fatalf("note %v", note)
	}
	post("/v1/admin/notes", map[string]any{"target": "worker-1", "text": "  "}, 400)
	if len(get("/v1/admin/notes?target=worker-1")["notes"].([]any)) != 1 {
		t.Fatal("notes list")
	}
	if len(get("/v1/admin/users/worker-1")["notes"].([]any)) != 1 {
		t.Fatal("notes on user detail")
	}

	partner := asMap(t, post("/v1/admin/partners", map[string]any{"name": "Magazin Nou"}, 201)["partner"])
	partnerID := partner["id"].(string)
	post("/v1/admin/partners/"+partnerID+"/activate", map[string]any{}, 200)
	post("/v1/admin/partners/"+partnerID+"/pause", map[string]any{}, 200)
	post("/v1/admin/partners/par_missing/pause", map[string]any{}, 404)
	post("/v1/admin/partners", map[string]any{"name": "x"}, 400)

	events := get("/v1/admin/events")["events"].([]any)
	if len(events) != 1 || asMap(t, events[0])["attendees"] == nil {
		t.Fatalf("events %v", events)
	}
	post("/v1/admin/events/event_seed_cartier/delete", map[string]any{}, 200)
	post("/v1/admin/events/event_seed_cartier/delete", map[string]any{}, 404)

	post("/v1/admin/users/worker-1/revoke-sessions", map[string]any{}, 200)
	post("/v1/admin/users/admin-1/revoke-sessions", map[string]any{}, 400)
	post("/v1/admin/reviews/rev_missing/remove", map[string]any{}, 404)

	logs := get("/v1/admin/logs")["logs"].([]any)
	seen := map[string]bool{}
	for _, item := range logs {
		seen[asMap(t, item)["action"].(string)] = true
	}
	for _, action := range []string{"note_create", "partner_create", "partner_pause", "event_delete", "user_revoke_sessions"} {
		if !seen[action] {
			t.Fatalf("missing audit %s in %v", action, logs)
		}
	}

	for _, path := range []string{"/v1/admin/stats", "/v1/admin/system", "/v1/admin/users/worker-1", "/v1/admin/applications", "/v1/admin/identity"} {
		status, _, body := h.do(http.MethodGet, path, "poster-1", nil, true)
		h.errorCode(status, body, 403, "forbidden", "Interzis.")
	}
}
