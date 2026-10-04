package server

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if AllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Demo-Actor, Authorization")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(body)
}

func writeAppError(w http.ResponseWriter, err *AppError) {
	if err == nil {
		err = errInternal
	}
	writeJSON(w, err.Status, struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{
		Error: struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}{Code: err.Code, Message: err.Message},
	})
}

func readJSON(r *http.Request, dest any, emptyAsObject bool) *AppError {
	invalid := errInvalidJSON
	var raw []byte
	if r.Body != nil {
		var err error
		raw, err = io.ReadAll(r.Body)
		if err != nil {
			return invalid
		}
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		if !emptyAsObject {
			return invalid
		}
		raw = []byte("{}")
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return invalid
	}
	return nil
}

func (s *Server) currentUser(r *http.Request) (User, *AppError) {
	if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
		token, ae := bearerToken(r)
		if ae != nil {
			return User{}, ae
		}
		u, err := s.store.UserByToken(token)
		if err != nil {
			if ae, ok := asAppError(err); ok {
				return User{}, ae
			}
			return User{}, errInternal
		}
		return *u, nil
	}
	id := strings.TrimSpace(r.Header.Get("X-Demo-Actor"))
	if os.Getenv("NOVA_DEMO") != "1" {
		if id != "" {
			return User{}, errDemoDisabled
		}
		return User{}, errMissingActor
	}
	if id == "" {
		return User{}, errMissingActor
	}
	u, err := s.store.FindUser(id)
	if err != nil {
		if ae, ok := asAppError(err); ok {
			if ae.Code == "not_found" {
				return User{}, errUnknownActor
			}
			return User{}, ae
		}
		return User{}, errInternal
	}
	if u == nil {
		return User{}, errUnknownActor
	}
	return *u, nil
}
