package main_test

import (
	"net/http"
	"testing"
)

func TestJobCountyAndLocalityPersistAndMustMatch(t *testing.T) {
	h := start(t)
	_, token := account(t, h, "location@example.test", "+40700000003")
	body := cloneMap(t, "create-task-request.json")
	body["county"] = "Alba"
	body["city"] = "Alba Iulia"
	body["locality_id"] = "1026"
	status, raw := h.doBearer(http.MethodPost, "/v1/tasks", token, body)
	if status != 201 {
		t.Fatalf("create location %d %s", status, raw)
	}
	task := asMap(t, asMap(t, decode(t, raw))["task"])
	if task["county"] != "Alba" || task["locality_id"] != "1026" {
		t.Fatalf("location lost %s", raw)
	}
	path := "/v1/tasks/" + task["id"].(string)
	status, raw = h.doBearer(http.MethodPut, path, token, body)
	if status != 200 {
		t.Fatalf("edit location %d %s", status, raw)
	}
	body["county"] = "Cluj"
	status, _ = h.doBearer(http.MethodPut, path, token, body)
	if status != 400 {
		t.Fatalf("county mismatch accepted %d", status)
	}
	body["county"] = "Alba"
	body["city"] = "Another place"
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks", token, body)
	if status != 400 {
		t.Fatalf("city mismatch accepted %d", status)
	}
	body["city"] = "Alba Iulia"
	body["locality_id"] = "unknown"
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks", token, body)
	if status != 400 {
		t.Fatalf("unknown locality accepted %d", status)
	}
}

func TestJobSearchCombinesCountyLocalityAndType(t *testing.T) {
	h := start(t)
	_, token := account(t, h, "filters@example.test", "+40700000003")
	body := cloneMap(t, "create-task-request.json")
	body["county"], body["city"], body["locality_id"], body["job_type"] = "Alba", "Alba Iulia", "1026", "long_term"
	status, raw := h.doBearer(http.MethodPost, "/v1/tasks", token, body)
	if status != 201 {
		t.Fatalf("create %d %s", status, raw)
	}
	id := asMap(t, asMap(t, decode(t, raw))["task"])["id"].(string)
	for _, tc := range []struct {
		query  string
		found  bool
		status int
	}{
		{"?county=Alba", true, 200},
		{"?county=Cluj", false, 200},
		{"?county=Alba&locality_id=1026&job_type=long_term", true, 200},
		{"?county=Alba&locality_id=1026&job_type=short_term", false, 200},
		{"?county=Alba&job_type=volunteer", false, 200},
		{"?county=Cluj&locality_id=1026", false, 400},
		{"?locality_id=unknown", false, 400},
		{"?job_type=unknown", false, 400},
		{"", true, 200},
	} {
		status, _, raw := h.do(http.MethodGet, "/v1/tasks"+tc.query, "", nil, false)
		if status != tc.status {
			t.Fatalf("%s status %d %s", tc.query, status, raw)
		}
		if status == 200 && contains(ids(t, raw), id) != tc.found {
			t.Fatalf("%s wrong results %s", tc.query, raw)
		}
	}
}
