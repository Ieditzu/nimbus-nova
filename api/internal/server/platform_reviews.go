package server

import (
	"net/http"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

type platformReview struct {
	ID         string `json:"id"`
	AuthorID   string `json:"author_id,omitempty"`
	AuthorName string `json:"author_name"`
	Role       string `json:"role"`
	Stars      int    `json:"stars"`
	Text       string `json:"text"`
	Status     string `json:"status,omitempty"`
	CreatedAt  string `json:"created_at"`
}

func (s *Store) ensurePlatformReviews() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS platform_reviews (
		id TEXT PRIMARY KEY,
		author_id TEXT NOT NULL,
		author_name TEXT NOT NULL,
		role TEXT NOT NULL,
		stars INTEGER NOT NULL,
		text TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'visible',
		created_at TEXT NOT NULL
	)`)
	if err != nil {
		return err
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM platform_reviews`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	seeds := []platformReview{
		{ID: "prev_seed_andrei", AuthorID: "seed", AuthorName: "Andrei M.", Role: "worker", Stars: 5, Text: "Am mutat o masă într-o după-amiază liberă. Anunțul era clar, chatul a mers, iar banii au ajuns direct.", CreatedAt: "2026-09-12T14:00:00+03:00"},
		{ID: "prev_seed_ioana", AuthorID: "seed", AuthorName: "Ioana P.", Role: "poster", Stars: 5, Text: "Aveam nevoie de doi oameni pentru o oră. Au aplicat din aplicație și treaba s-a închis în aceeași zi.", CreatedAt: "2026-09-20T11:30:00+03:00"},
		{ID: "prev_seed_mara", AuthorID: "seed", AuthorName: "Mara D.", Role: "worker", Stars: 4, Text: "Am acoperit un raion când cineva era bolnav. Scurt, în spațiu public, fără telefon schimbat pe chat.", CreatedAt: "2026-09-28T16:10:00+03:00"},
	}
	for _, review := range seeds {
		if _, err := s.db.Exec(`INSERT INTO platform_reviews (id, author_id, author_name, role, stars, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'visible', ?)`,
			review.ID, review.AuthorID, review.AuthorName, review.Role, review.Stars, review.Text, review.CreatedAt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) handleListPlatformReviews(w http.ResponseWriter, r *http.Request) {
	reviews, err := s.store.listPlatformReviews(false)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

func (s *Server) handleCreatePlatformReview(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if user.Role != "worker" && user.Role != "poster" {
		writeAppError(w, errForbidden)
		return
	}
	var done int
	if err := s.store.db.QueryRow(`SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND (poster_id = ? OR assignee_id = ?)`, user.ID, user.ID).Scan(&done); err != nil {
		s.writeErr(w, err)
		return
	}
	if done == 0 {
		writeAppError(w, appErr(403, "review_not_eligible", "Poți lăsa o recenzie după ce o sarcină la care ai participat este finalizată."))
		return
	}
	var existing int
	if err := s.store.db.QueryRow(`SELECT COUNT(*) FROM platform_reviews WHERE author_id = ?`, user.ID).Scan(&existing); err != nil {
		s.writeErr(w, err)
		return
	}
	if existing > 0 {
		writeAppError(w, appErr(409, "duplicate_platform_review", "Ai lăsat deja o recenzie pentru platformă."))
		return
	}
	var body struct {
		Stars int    `json:"stars"`
		Text  string `json:"text"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	text := strings.TrimSpace(body.Text)
	if body.Stars < 1 || body.Stars > 5 || utf8.RuneCountInString(text) < 8 || utf8.RuneCountInString(text) > 400 {
		writeAppError(w, invalidInput("Alege între 1 și 5 stele și scrie între 8 și 400 de caractere."))
		return
	}
	id, err := NewID("prev_")
	if err != nil {
		s.writeErr(w, err)
		return
	}
	created := NowRFC3339()
	role := user.Role
	if _, err = s.store.db.Exec(`INSERT INTO platform_reviews (id, author_id, author_name, role, stars, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'visible', ?)`,
		id, user.ID, user.DisplayName, role, body.Stars, text, created); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"review": platformReview{ID: id, AuthorName: user.DisplayName, Role: role, Stars: body.Stars, Text: text, CreatedAt: created}})
}

func (s *Server) handleAdminPlatformReviews(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	reviews, err := s.store.listPlatformReviews(true)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": reviews})
}

func (s *Server) handleSetPlatformReviewStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	status := "hidden"
	if strings.HasSuffix(r.URL.Path, "/show") {
		status = "visible"
	}
	res, err := s.store.db.Exec(`UPDATE platform_reviews SET status = ? WHERE id = ?`, status, r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		writeAppError(w, errNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status})
}

func (s *Store) listPlatformReviews(admin bool) ([]platformReview, error) {
	q := `SELECT id, author_id, author_name, role, stars, text, status, created_at FROM platform_reviews`
	if !admin {
		q += ` WHERE status = 'visible'`
	}
	q += ` ORDER BY created_at DESC, id DESC LIMIT 40`
	rows, err := s.db.Query(q)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []platformReview{}
	for rows.Next() {
		var review platformReview
		if err := rows.Scan(&review.ID, &review.AuthorID, &review.AuthorName, &review.Role, &review.Stars, &review.Text, &review.Status, &review.CreatedAt); err != nil {
			return nil, errInternal
		}
		if !admin {
			review.AuthorID = ""
			review.Status = ""
		}
		out = append(out, review)
	}
	return out, rows.Err()
}

func (s *Server) handleAdminAssistStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": strings.TrimSpace(os.Getenv("GROQ_API_KEY")) != "",
		"provider":   "groq",
		"model":      groqModel,
		"fallback":   groqFallback,
	})
}

func (s *Server) handleAdminAssistTest(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	if strings.TrimSpace(os.Getenv("GROQ_API_KEY")) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "configured": false, "model": groqModel, "latency_ms": 0, "detail": "GROQ_API_KEY lipsește."})
		return
	}
	start := time.Now()
	raw, err := groqComplete(r.Context(), "Răspunde doar cu un obiect JSON.", `{"ok":true}`, false)
	latency := time.Since(start).Milliseconds()
	if err != nil || strings.TrimSpace(raw) == "" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "configured": true, "model": groqModel, "latency_ms": latency, "detail": "Groq nu a răspuns. Poți continua fără asistent."})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "configured": true, "model": groqModel, "latency_ms": latency, "detail": clip(raw, 180)})
}
