package server

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestPlatformReviews(t *testing.T) {
	t.Setenv("NOVA_DEMO", "1")
	t.Setenv("IDANALYZER_KEY", "")
	api, err := New(filepath.Join(t.TempDir(), "reviews.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = api.Close() })
	srv := httptest.NewServer(api.Handler())
	t.Cleanup(srv.Close)

	res, err := http.Get(srv.URL + "/v1/platform-reviews")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var listed struct {
		Reviews []platformReview `json:"reviews"`
	}
	if err := json.NewDecoder(res.Body).Decode(&listed); err != nil || res.StatusCode != 200 || len(listed.Reviews) != 3 {
		t.Fatalf("seed %d %+v %v", res.StatusCode, listed.Reviews, err)
	}

	denied := postReview(t, srv.URL, "poster-1", 5, "Încă nu am încheiat o sarcină aici.")
	if denied != 403 {
		t.Fatalf("eligibility %d", denied)
	}
	if _, err := api.DB().Exec(`UPDATE tasks SET status = 'completed', assignee_id = 'worker-1' WHERE id = 'task_seed_event_setup'`); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"stars": 5, "text": "Sarcina s-a închis clar și rapid."})
	req, _ := http.NewRequest(http.MethodPost, srv.URL+"/v1/platform-reviews", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Demo-Actor", "poster-1")
	res2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res2.Body.Close()
	raw, _ := io.ReadAll(res2.Body)
	if res2.StatusCode != 201 {
		t.Fatalf("create %d %s", res2.StatusCode, raw)
	}

	hide, err := http.NewRequest(http.MethodPost, srv.URL+"/v1/admin/platform-reviews/prev_seed_mara/hide", nil)
	if err != nil {
		t.Fatal(err)
	}
	hide.Header.Set("X-Demo-Actor", "admin-1")
	hidden, err := http.DefaultClient.Do(hide)
	if err != nil || hidden.StatusCode != 200 {
		t.Fatalf("hide %v", hidden)
	}
	hidden.Body.Close()
}

func postReview(t *testing.T, root, actor string, stars int, text string) int {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"stars": stars, "text": text})
	req, err := http.NewRequest(http.MethodPost, root+"/v1/platform-reviews", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Demo-Actor", actor)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	return res.StatusCode
}
