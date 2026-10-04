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
