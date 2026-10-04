package main_test

import (
	"net/http"
	"testing"
)

func TestJobCategoriesAndLongTermPeriod(t *testing.T) {
	h := start(t)
	_, token := account(t, h, "categories@example.test", "+40700000003")
	for _, category := range []string{"short_term", "long_term", "volunteer"} {
		body := cloneMap(t, "create-task-request.json")
		body["job_type"] = category
		if category == "volunteer" {
			body["amount_bani"] = 0
		}
		if category == "long_term" {
			body["ends_at"] = "2026-12-05T16:00:00+02:00"
		}
		status, raw := h.doBearer(http.MethodPost, "/v1/tasks", token, body)
		if status != 201 {
			t.Fatalf("create %s %d %s", category, status, raw)
		}
		task := asMap(t, asMap(t, decode(t, raw))["task"])
		if task["job_type"] != category {
			t.Fatalf("category lost %s", raw)
		}
		id := task["id"].(string)
		status, raw = h.doBearer(http.MethodPut, "/v1/tasks/"+id, token, body)
		if status != 200 {
			t.Fatalf("edit %s %d %s", category, status, raw)
		}
		status, _, raw = h.do(http.MethodGet, "/v1/tasks?category=other", "", nil, false)
		if status != 200 {
			t.Fatalf("filter %s %d %s", category, status, raw)
		}
		var kind string
		if err := h.DB.QueryRow(`SELECT kind FROM tasks WHERE id=?`, id).Scan(&kind); err != nil {
			t.Fatal(err)
		}
		if category == "volunteer" && kind != "volunteer" {
			t.Fatal("volunteer task stored as paid")
		}
	}
	for _, tc := range []struct {
		category string
		amount   int
		end      string
	}{{"volunteer", 10000, "2026-10-05T16:00:00+03:00"}, {"short_term", 0, "2026-10-05T16:00:00+03:00"}, {"long_term", 0, "2026-12-05T16:00:00+02:00"}, {"short_term", 10000, "2026-12-05T16:00:00+02:00"}, {"long_term", 10000, "2028-12-05T16:00:00+02:00"}} {
		body := cloneMap(t, "create-task-request.json")
		body["job_type"] = tc.category
		body["amount_bani"] = tc.amount
		body["ends_at"] = tc.end
		status, raw := h.doBearer(http.MethodPost, "/v1/tasks", token, body)
		if status != 400 {
			t.Fatalf("invalid category/price/period accepted %d %s", status, raw)
		}
	}
}
