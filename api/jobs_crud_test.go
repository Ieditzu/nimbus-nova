package main_test

import (
	"net/http"
	"strings"
	"testing"
)

func TestAccountJobCRUDAndPrivateContact(t *testing.T) {
	h := start(t)
	owner, token := account(t, h, "crud-owner@example.test", "+40712345678")
	peer, peerToken := account(t, h, "crud-peer@example.test", "+40723456789")
	_, strangerToken := account(t, h, "crud-stranger@example.test", "+40734567890")
	job := makeJob(t, h, token)
	path := "/v1/tasks/" + job
	body := cloneMap(t, "create-task-request.json")
	body["title"] = "Edited real account job"
	body["poster_id"] = "poster-1"
	for _, method := range []string{http.MethodPut, http.MethodDelete} {
		status, _ := h.doBearer(method, path, "", body)
		if status != 401 {
			t.Fatalf("anonymous %s: %d", method, status)
		}
		status, _ = h.doBearer(method, path, peerToken, body)
		if status != 403 {
			t.Fatalf("other owner %s: %d", method, status)
		}
	}
	status, raw := h.doBearer(http.MethodPut, path, token, body)
	if status != 200 {
		t.Fatalf("update %d %s", status, raw)
	}
	task := asMap(t, asMap(t, decode(t, raw))["task"])
	if task["title"] != body["title"] || task["poster_id"] != owner {
		t.Fatalf("update persisted wrong values %s", raw)
	}
	body["amount_bani"] = -1
	status, _ = h.doBearer(http.MethodPut, path, token, body)
	if status != 400 {
		t.Fatalf("invalid update %d", status)
	}
	body["amount_bani"] = 10000
	for _, state := range []string{"assigned", "completed"} {
		if _, err := h.DB.Exec(`UPDATE tasks SET status=? WHERE id=?`, state, job); err != nil {
			t.Fatal(err)
		}
		for _, method := range []string{http.MethodPut, http.MethodDelete} {
			status, _ = h.doBearer(method, path, token, body)
			if status != 409 {
				t.Fatalf("locked %s %s: %d", state, method, status)
			}
		}
	}
	if _, err := h.DB.Exec(`UPDATE tasks SET status='open',pay_status='held' WHERE id=?`, job); err != nil {
		t.Fatal(err)
	}
	status, _ = h.doBearer(http.MethodDelete, path, token, nil)
	if status != 409 {
		t.Fatalf("held payment delete: %d", status)
	}
	if _, err := h.DB.Exec(`UPDATE tasks SET pay_status='unpaid' WHERE id=?`, job); err != nil {
		t.Fatal(err)
	}
	status, raw = h.doBearer(http.MethodPost, path+"/conversations", peerToken, map[string]any{})
	if status != 200 {
		t.Fatalf("conversation %d %s", status, raw)
	}
	conversation := asMap(t, asMap(t, decode(t, raw))["conversation"])
	if asMap(t, conversation["other_user"])["phone_number"] != "+40712345678" {
		t.Fatalf("contact missing %s", raw)
	}
	chat := conversation["id"].(string)
	status, raw = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages", token, nil)
	if status != 200 || !strings.Contains(string(raw), "+40723456789") {
		t.Fatalf("owner contact %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages", strangerToken, nil)
	if status != 404 || strings.Contains(string(raw), "phone_number") {
		t.Fatalf("contact leak %d %s", status, raw)
	}
	if _, err := h.DB.Exec(`INSERT INTO applications(id,task_id,worker_id,message,status,created_at) VALUES('crud-pending',?,?, 'Interested', 'pending', '2026-10-04T12:00:00+03:00')`, job, peer); err != nil {
		t.Fatal(err)
	}
	status, raw = h.doBearer(http.MethodDelete, path, token, nil)
	if status != 200 {
		t.Fatalf("delete %d %s", status, raw)
	}
	var applicationStatus string
	if err := h.DB.QueryRow(`SELECT status FROM applications WHERE id='crud-pending'`).Scan(&applicationStatus); err != nil || applicationStatus != "rejected" {
		t.Fatalf("pending application was not closed: %v %s", err, applicationStatus)
	}
	status, _, raw = h.do(http.MethodGet, path, "", nil, false)
	if status != 404 {
		t.Fatalf("deleted task public %d %s", status, raw)
	}
	status, raw = h.doBearer(http.MethodGet, "/v1/me/tasks", token, nil)
	if status != 200 || strings.Contains(string(raw), job) {
		t.Fatalf("deleted task in owner list %d %s", status, raw)
	}
	status, _ = h.doBearer(http.MethodGet, "/v1/conversations/"+chat+"/messages", peerToken, nil)
	if status != 200 {
		t.Fatalf("deletion destroyed conversation %d", status)
	}
}
