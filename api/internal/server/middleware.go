package server

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		g := &guardWriter{ResponseWriter: w}
		defer func() {
			if rec := recover(); rec != nil && !g.decided {
				log.Printf("api panic: %v\n%s", rec, debug.Stack())
				writeAppError(w, errInternal)
				g.decided = true
			}
			g.finish()
		}()
		origin := r.Header.Get("Origin")
		if AllowedOrigin(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Demo-Actor, Authorization, X-Support-Key")
			w.WriteHeader(http.StatusNoContent)
			g.decided = true
			return
		}
		next.ServeHTTP(g, r)
	})
}

// guardWriter turns panics and plain-text error pages into the JSON error envelope
// the website and phone parse. A text/plain 500 is what shows up as
// "Răspuns neașteptat de la server."
type guardWriter struct {
	http.ResponseWriter
	code    int
	decided bool
}

func (g *guardWriter) Unwrap() http.ResponseWriter { return g.ResponseWriter }

func (g *guardWriter) WriteHeader(code int) {
	if g.decided {
		return
	}
	g.code = code
	if code < 400 {
		g.ResponseWriter.WriteHeader(code)
		g.decided = true
	}
}

func (g *guardWriter) Write(p []byte) (int, error) {
	if g.decided {
		return g.ResponseWriter.Write(p)
	}
	if g.code >= 400 && !jsonObject(p) {
		g.ResponseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
		writeAppError(g.ResponseWriter, plainStatusError(g.code))
		g.decided = true
		return len(p), nil
	}
	if g.code != 0 {
		g.ResponseWriter.WriteHeader(g.code)
	}
	g.decided = true
	return g.ResponseWriter.Write(p)
}

func (g *guardWriter) finish() {
	if g.decided || g.code < 400 {
		return
	}
	g.ResponseWriter.Header().Set("Content-Type", "application/json; charset=utf-8")
	writeAppError(g.ResponseWriter, plainStatusError(g.code))
	g.decided = true
}

func jsonObject(p []byte) bool {
	text := strings.TrimSpace(string(p))
	return strings.HasPrefix(text, "{") || strings.HasPrefix(text, "[")
}

func plainStatusError(code int) *AppError {
	switch code {
	case http.StatusNotFound:
		return errNotFound
	case http.StatusMethodNotAllowed:
		return appErr(code, "method_not_allowed", "Metoda nu este permisă.")
	case http.StatusRequestEntityTooLarge:
		return appErr(code, "body_too_large", "Cererea este prea mare.")
	case http.StatusUnauthorized:
		return appErr(code, "unauthorized", "Autentificare necesară.")
	case http.StatusForbidden:
		return errForbidden
	default:
		if code >= 500 {
			return appErr(code, "internal", "Eroare internă.")
		}
		return appErr(code, "bad_response", "Cererea nu a putut fi procesată.")
	}
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
		if (u.Role == "worker" || u.Role == "poster") && u.PhoneNumber == "" {
			return User{}, errPhoneRequired
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
