package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPanicAndPlainTextBecomeJSON(t *testing.T) {
	h := withCORS(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/panic":
			panic("boom")
		case "/plain":
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		case "/empty":
			w.WriteHeader(http.StatusBadGateway)
		default:
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		}
	}))

	for _, tc := range []struct {
		path   string
		status int
		code   string
	}{
		{"/panic", 500, "internal"},
		{"/plain", 500, "internal"},
		{"/empty", 502, "internal"},
	} {
		req := httptest.NewRequest(http.MethodGet, tc.path, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != tc.status {
			t.Fatalf("%s status %d body %s", tc.path, rec.Code, rec.Body.Bytes())
		}
		var body struct {
			Error struct {
				Code    string `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Error.Code != tc.code || body.Error.Message == "" {
			t.Fatalf("%s envelope %s err %v", tc.path, rec.Body.Bytes(), err)
		}
		if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
			t.Fatalf("%s content-type %q", tc.path, ct)
		}
	}

	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Body.String() == "" || rec.Body.String()[0] != '{' {
		t.Fatalf("success %d %s", rec.Code, rec.Body.Bytes())
	}
}
