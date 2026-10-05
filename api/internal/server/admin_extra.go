package server

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"
)

// Admin-only read models and moderation actions used by the operations desk.
func (s *Server) adminExtraRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/admin/stats", s.handleAdminStats)
	mux.HandleFunc("GET /v1/admin/system", s.handleAdminSystem)
	mux.HandleFunc("GET /v1/admin/users/{id}", s.handleAdminUser)
	mux.HandleFunc("POST /v1/admin/users/{id}/revoke-sessions", s.handleRevokeSessions)
	mux.HandleFunc("PUT /v1/admin/users/{id}", s.handleAdminUpdateUser)
	mux.HandleFunc("PUT /v1/admin/users/{id}/profile", s.handleAdminUpdateProfile)
	mux.HandleFunc("POST /v1/admin/users/{id}/password", s.handleAdminSetPassword)
	mux.HandleFunc("POST /v1/admin/users", s.handleAdminCreateUser)
	mux.HandleFunc("POST /v1/admin/tasks", s.handleAdminCreateTask)
	mux.HandleFunc("PUT /v1/admin/tasks/{id}", s.handleAdminUpdateTask)
	mux.HandleFunc("POST /v1/admin/tasks/{id}/assign", s.handleAdminAssignTask)
	mux.HandleFunc("POST /v1/admin/applications/{id}/accept", s.handleAdminAcceptApplication)
	mux.HandleFunc("GET /v1/admin/tasks/{id}", s.handleAdminTask)
	mux.HandleFunc("GET /v1/admin/applications", s.handleAdminApplications)
	mux.HandleFunc("GET /v1/admin/reviews", s.handleAdminReviews)
	mux.HandleFunc("POST /v1/admin/reviews/{id}/remove", s.handleRemoveReview)
	mux.HandleFunc("POST /v1/admin/partners", s.handleCreatePartner)
	mux.HandleFunc("POST /v1/admin/partners/{id}/pause", s.handlePausePartner)
	mux.HandleFunc("GET /v1/admin/notes", s.handleAdminNotes)
	mux.HandleFunc("POST /v1/admin/notes", s.handleCreateNote)
	mux.HandleFunc("GET /v1/admin/identity", s.handleAdminIdentity)
	mux.HandleFunc("GET /v1/admin/events", s.handleAdminEvents)
	mux.HandleFunc("POST /v1/admin/events/{id}/delete", s.handleDeleteEvent)
}

func (s *Store) ensureAdminExtras() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS admin_notes (
		id TEXT PRIMARY KEY,
		target TEXT NOT NULL,
		author_id TEXT NOT NULL,
		text TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS admin_notes_target ON admin_notes(target, created_at);`)
	return err
}

// statsReader keeps the first error so the stats query reads as a flat list.
type statsReader struct {
	s   *Store
	err error
}

func (r *statsReader) counts(q string, args ...any) map[string]int {
	out := map[string]int{}
	if r.err != nil {
		return out
	}
	rows, err := r.s.db.Query(q, args...)
	if err != nil {
		r.err = errInternal
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var key sql.NullString
		var n int
		if err := rows.Scan(&key, &n); err != nil {
			r.err = errInternal
			return out
		}
		out[key.String] += n
	}
	if rows.Err() != nil {
		r.err = errInternal
	}
	return out
}

func (r *statsReader) number(q string, args ...any) int64 {
	if r.err != nil {
		return 0
	}
	var n sql.NullInt64
	if err := r.s.db.QueryRow(q, args...).Scan(&n); err != nil {
		r.err = errInternal
		return 0
	}
	return n.Int64
}

func (r *statsReader) float(q string, args ...any) float64 {
	if r.err != nil {
		return 0
	}
	var n sql.NullFloat64
	if err := r.s.db.QueryRow(q, args...).Scan(&n); err != nil {
		r.err = errInternal
		return 0
	}
	return n.Float64
}

func (r *statsReader) daily(q, cutoff string) map[string][2]int64 {
	out := map[string][2]int64{}
	if r.err != nil {
		return out
	}
	rows, err := r.s.db.Query(q, cutoff)
	if err != nil {
		r.err = errInternal
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var day string
		var n, sum int64
		if err := rows.Scan(&day, &n, &sum); err != nil {
			r.err = errInternal
			return out
		}
		out[day] = [2]int64{n, sum}
	}
	return out
}

type dailyPoint struct {
	Date         string `json:"date"`
	Tasks        int64  `json:"tasks"`
	VolumeBani   int64  `json:"volume_bani"`
	Applications int64  `json:"applications"`
	Signups      int64  `json:"signups"`
	Messages     int64  `json:"messages"`
}

func (s *Store) AdminStats(days int) (map[string]any, error) {
	r := &statsReader{s: s}
	now := time.Now().In(zoneEEST)
	cutoff := now.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	nowText := NowRFC3339()

	tasks := r.daily(`SELECT substr(created_at,1,10), COUNT(*), COALESCE(SUM(amount_bani),0) FROM tasks WHERE created_at >= ? GROUP BY 1`, cutoff)
	apps := r.daily(`SELECT substr(created_at,1,10), COUNT(*), 0 FROM applications WHERE created_at >= ? GROUP BY 1`, cutoff)
	signups := r.daily(`SELECT substr(created_at,1,10), COUNT(*), 0 FROM users WHERE created_at != '' AND created_at >= ? GROUP BY 1`, cutoff)
	messages := r.daily(`SELECT substr(created_at,1,10), COUNT(*), 0 FROM chat_messages WHERE created_at >= ? GROUP BY 1`, cutoff)
	series := make([]dailyPoint, 0, days)
	for i := days - 1; i >= 0; i-- {
		day := now.AddDate(0, 0, -i).Format("2006-01-02")
		series = append(series, dailyPoint{
			Date: day, Tasks: tasks[day][0], VolumeBani: tasks[day][1],
			Applications: apps[day][0], Signups: signups[day][0], Messages: messages[day][0],
		})
	}

	cities := []map[string]any{}
	if r.err == nil {
		rows, err := s.db.Query(`SELECT city, COUNT(*), COALESCE(SUM(amount_bani),0) FROM tasks WHERE status != 'hidden' GROUP BY city ORDER BY 2 DESC, city LIMIT 8`)
		if err != nil {
			return nil, errInternal
		}
		for rows.Next() {
			var city string
			var n, sum int64
			if err := rows.Scan(&city, &n, &sum); err != nil {
				rows.Close()
				return nil, errInternal
			}
			cities = append(cities, map[string]any{"city": city, "tasks": n, "volume_bani": sum})
		}
		rows.Close()
	}

	out := map[string]any{
		"users_by_role":          r.counts(`SELECT role, COUNT(*) FROM users GROUP BY role`),
		"users_by_status":        r.counts(`SELECT COALESCE(status,'active'), COUNT(*) FROM users GROUP BY 1`),
		"tasks_by_status":        r.counts(`SELECT status, COUNT(*) FROM tasks GROUP BY status`),
		"tasks_by_category":      r.counts(`SELECT category, COUNT(*) FROM tasks WHERE status != 'hidden' GROUP BY category`),
		"tasks_by_pay_status":    r.counts(`SELECT pay_status, COUNT(*) FROM tasks GROUP BY pay_status`),
		"applications_by_status": r.counts(`SELECT status, COUNT(*) FROM applications GROUP BY status`),
		"disputes_by_status":     r.counts(`SELECT status, COUNT(*) FROM disputes GROUP BY status`),
		"identity_by_status":     r.counts(`SELECT status, COUNT(*) FROM identity_sessions GROUP BY status`),
		"money": map[string]int64{
			"listed_bani":   r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM tasks WHERE status != 'hidden'`),
			"escrow_bani":   r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM payment_intents WHERE status = 'held'`),
			"released_bani": r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM payment_intents WHERE status = 'released'`),
			"refunded_bani": r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM payment_intents WHERE status = 'refunded'`),
			"platform_bani": r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM ledger_entries WHERE account = 'platform' AND direction = 'credit'`),
			"worker_bani":   r.number(`SELECT COALESCE(SUM(amount_bani),0) FROM ledger_entries WHERE account = 'worker' AND direction = 'credit'`),
		},
		"reviews": map[string]any{
			"count":   r.number(`SELECT COUNT(*) FROM reviews`),
			"average": r.float(`SELECT AVG(stars) FROM reviews`),
			"stars":   r.counts(`SELECT CAST(stars AS TEXT), COUNT(*) FROM reviews GROUP BY stars`),
		},
		"chat": map[string]int64{
			"conversations": r.number(`SELECT COUNT(*) FROM conversations`),
			"messages":      r.number(`SELECT COUNT(*) FROM chat_messages`),
		},
		"events":          r.number(`SELECT COUNT(*) FROM events`),
		"attendances":     r.number(`SELECT COUNT(*) FROM attendances`),
		"active_sessions": r.number(`SELECT COUNT(*) FROM sessions WHERE expires_at > ?`, nowText),
		"cities":          cities,
		"daily":           series,
	}
	if r.err != nil {
		return nil, r.err
	}
	return out, nil
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	days := 14
	if r.URL.Query().Get("days") == "30" {
		days = 30
	}
	stats, err := s.store.AdminStats(days)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"stats": stats})
}

func (s *Server) handleAdminSystem(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	var pages, size int64
	_ = s.store.db.QueryRow(`PRAGMA page_count`).Scan(&pages)
	_ = s.store.db.QueryRow(`PRAGMA page_size`).Scan(&size)
	tables := map[string]int64{}
	// Constant table names only; never user input.
	for _, name := range []string{"users", "tasks", "applications", "reviews", "sessions", "disputes", "ledger_entries", "payment_intents", "conversations", "chat_messages", "events", "partners", "notifications", "identity_sessions", "admin_logs", "admin_notes"} {
		var n int64
		if err := s.store.db.QueryRow(`SELECT COUNT(*) FROM ` + name).Scan(&n); err == nil {
			tables[name] = n
		}
	}
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	writeJSON(w, http.StatusOK, map[string]any{"system": map[string]any{
		"go_version":        runtime.Version(),
		"started_at":        s.started.In(zoneEEST).Format(time.RFC3339),
		"uptime_seconds":    int64(time.Since(s.started).Seconds()),
		"demo_mode":         os.Getenv("NOVA_DEMO") == "1",
		"identity_provider": strings.TrimSpace(os.Getenv("IDANALYZER_KEY")) != "",
		"db_bytes":          pages * size,
		"goroutines":        runtime.NumGoroutine(),
		"memory_bytes":      mem.Alloc,
		"tables":            tables,
		"server_time":       NowRFC3339(),
	}})
}

func (s *Store) queryApps(q string, args ...any) ([]ApplicationView, error) {
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []ApplicationView{}
	for rows.Next() {
		a, err := scanApp(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) queryReviews(q string, args ...any) ([]Review, error) {
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []Review{}
	for rows.Next() {
		rv, err := scanReview(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, rv)
	}
	return out, rows.Err()
}

func (s *Store) logsFor(target string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, actor_id, action, target, detail, created_at FROM admin_logs WHERE target = ? ORDER BY created_at DESC LIMIT 50`, target)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, actor, action, tgt, detail, created string
		if err := rows.Scan(&id, &actor, &action, &tgt, &detail, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "actor_id": actor, "action": action, "target": tgt, "detail": detail, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Store) AdminUserDetail(id string) (map[string]any, error) {
	var role, name, email, status, phone, birth, guardian, created string
	var volunteer, verified int
	err := s.db.QueryRow(`SELECT role, display_name, COALESCE(email,''), COALESCE(status,'active'), phone_number, COALESCE(birth_date,''), COALESCE(guardian_email,''), created_at, volunteer_only, identity_verified FROM users WHERE id = ?`, id).
		Scan(&role, &name, &email, &status, &phone, &birth, &guardian, &created, &volunteer, &verified)
	if err == sql.ErrNoRows {
		return nil, errNotFound
	}
	if err != nil {
		return nil, errInternal
	}
	posted, err := s.queryTasks(taskSelect+` WHERE t.poster_id = ? ORDER BY t.created_at DESC, t.id DESC`, id)
	if err != nil {
		return nil, err
	}
	assigned, err := s.queryTasks(taskSelect+` WHERE t.assignee_id = ? ORDER BY t.created_at DESC, t.id DESC`, id)
	if err != nil {
		return nil, err
	}
	apps, err := s.queryApps(appSelect+` WHERE a.worker_id = ? ORDER BY a.created_at DESC, a.id DESC`, id)
	if err != nil {
		return nil, err
	}
	about, err := s.queryReviews(reviewSelect+` WHERE r.subject_id = ? ORDER BY r.created_at DESC`, id)
	if err != nil {
		return nil, err
	}
	by, err := s.queryReviews(reviewSelect+` WHERE r.author_id = ? ORDER BY r.created_at DESC`, id)
	if err != nil {
		return nil, err
	}
	count, average, err := s.Reputation(id)
	if err != nil {
		return nil, err
	}
	var profile any
	if p, err := s.Profile(id); err == nil {
		profile = p
	}
	var sessions int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > ?`, id, NowRFC3339()).Scan(&sessions)
	notes, err := s.AdminNotes(id)
	if err != nil {
		return nil, err
	}
	logs, err := s.logsFor(id)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"user": map[string]any{
			"id": id, "role": role, "display_name": name, "email": email, "status": status,
			"phone_number": phone, "birth_date": birth, "guardian_email": guardian,
			"created_at": created, "volunteer_only": volunteer == 1, "identity_verified": verified == 1,
		},
		"profile": profile, "tasks_posted": posted, "tasks_assigned": assigned,
		"applications": apps, "reviews_about": about, "reviews_by": by,
		"reputation":      map[string]any{"count": count, "average": average},
		"active_sessions": sessions, "notes": notes, "logs": logs,
	}, nil
}

func (s *Server) handleAdminUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	detail, err := s.store.AdminUserDetail(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleRevokeSessions(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	id := r.PathValue("id")
	if id == user.ID {
		writeAppError(w, invalidInput("Folosește „Ieși” pentru propria sesiune."))
		return
	}
	var exists int
	if err := s.store.db.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, id).Scan(&exists); err != nil || exists == 0 {
		writeAppError(w, errNotFound)
		return
	}
	res, err := s.store.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, id)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	n, _ := res.RowsAffected()
	s.audit(user.ID, "user_revoke_sessions", id, "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "revoked": n})
}

func (s *Store) AdminTaskDetail(id string) (map[string]any, error) {
	task, err := s.taskByID(id)
	if err != nil {
		return nil, err
	}
	var kind, pay string
	if err := s.db.QueryRow(`SELECT kind, pay_status FROM tasks WHERE id = ?`, id).Scan(&kind, &pay); err != nil {
		return nil, errInternal
	}
	apps, err := s.queryApps(appSelect+` WHERE a.task_id = ? ORDER BY a.created_at ASC, a.id ASC`, id)
	if err != nil {
		return nil, err
	}
	reviews, err := s.queryReviews(reviewSelect+` WHERE r.task_id = ? ORDER BY r.created_at ASC`, id)
	if err != nil {
		return nil, err
	}
	ledger, err := s.Ledger("", "admin", id)
	if err != nil {
		return nil, err
	}
	rows, err := s.db.Query(`SELECT id, opener_id, reason, status, created_at FROM disputes WHERE task_id = ? ORDER BY created_at DESC`, id)
	if err != nil {
		return nil, errInternal
	}
	disputes := []map[string]any{}
	for rows.Next() {
		var did, opener, reason, status, created string
		if err := rows.Scan(&did, &opener, &reason, &status, &created); err != nil {
			rows.Close()
			return nil, errInternal
		}
		disputes = append(disputes, map[string]any{"id": did, "task_id": id, "opener_id": opener, "reason": reason, "status": status, "created_at": created})
	}
	rows.Close()
	var payment any
	var provider, pstatus string
	var amount, feePolicy int64
	if err := s.db.QueryRow(`SELECT provider, status, amount_bani, fee_policy FROM payment_intents WHERE task_id = ?`, id).Scan(&provider, &pstatus, &amount, &feePolicy); err == nil {
		fee, payout := paymentBreakdown(task.AmountBani, amount, feePolicy)
		payment = map[string]any{"provider": provider, "status": pstatus, "amount_bani": amount, "platform_fee_bani": fee, "worker_payout_bani": payout}
	}
	var conversations int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM conversations WHERE task_id = ?`, id).Scan(&conversations)
	notes, err := s.AdminNotes(id)
	if err != nil {
		return nil, err
	}
	logs, err := s.logsFor(id)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"task": task, "kind": kind, "pay_status": pay, "applications": apps, "reviews": reviews,
		"ledger": ledger, "disputes": disputes, "payment": payment, "conversations": conversations,
		"notes": notes, "logs": logs,
	}, nil
}

func (s *Server) handleAdminTask(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	detail, err := s.store.AdminTaskDetail(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleAdminApplications(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.db.Query(`SELECT a.id, a.task_id, t.title, a.worker_id, u.display_name, a.message, a.status, a.created_at
		FROM applications a JOIN tasks t ON t.id = a.task_id JOIN users u ON u.id = a.worker_id
		ORDER BY a.created_at DESC, a.id DESC LIMIT 500`)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, taskID, title, workerID, worker, message, status, created string
		if err := rows.Scan(&id, &taskID, &title, &workerID, &worker, &message, &status, &created); err != nil {
			writeAppError(w, errInternal)
			return
		}
		out = append(out, map[string]any{"id": id, "task_id": taskID, "task_title": title, "worker_id": workerID, "worker_name": worker, "message": message, "status": status, "created_at": created})
	}
	writeJSON(w, http.StatusOK, map[string]any{"applications": out})
}

func (s *Server) handleAdminReviews(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.db.Query(`SELECT r.id, r.task_id, COALESCE(t.title,''), r.author_id, au.display_name, r.subject_id, su.display_name, r.stars, r.text, r.created_at
		FROM reviews r JOIN users au ON au.id = r.author_id JOIN users su ON su.id = r.subject_id LEFT JOIN tasks t ON t.id = r.task_id
		ORDER BY r.created_at DESC, r.id DESC LIMIT 500`)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, taskID, title, authorID, author, subjectID, subject, text, created string
		var stars int
		if err := rows.Scan(&id, &taskID, &title, &authorID, &author, &subjectID, &subject, &stars, &text, &created); err != nil {
			writeAppError(w, errInternal)
			return
		}
		out = append(out, map[string]any{"id": id, "task_id": taskID, "task_title": title, "author_id": authorID, "author_name": author, "subject_id": subjectID, "subject_name": subject, "stars": stars, "text": text, "created_at": created})
	}
	writeJSON(w, http.StatusOK, map[string]any{"reviews": out})
}

func (s *Server) handleRemoveReview(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	id := r.PathValue("id")
	var text string
	if err := s.store.db.QueryRow(`SELECT text FROM reviews WHERE id = ?`, id).Scan(&text); err != nil {
		if err == sql.ErrNoRows {
			writeAppError(w, errNotFound)
			return
		}
		writeAppError(w, errInternal)
		return
	}
	if _, err := s.store.db.Exec(`DELETE FROM reviews WHERE id = ?`, id); err != nil {
		writeAppError(w, errInternal)
		return
	}
	s.audit(user.ID, "review_remove", id, truncateRunes(text, 120))
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func truncateRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit]) + "…"
}

func (s *Server) handleCreatePartner(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	name := strings.TrimSpace(body.Name)
	if n := utf8.RuneCountInString(name); n < 2 || n > 80 {
		writeAppError(w, invalidInput("Numele partenerului trebuie să aibă între 2 și 80 de caractere."))
		return
	}
	id, err := NewID("par_")
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	if _, err := s.store.db.Exec(`INSERT INTO partners (id, name, status, user_id) VALUES (?, ?, 'prospect', NULL)`, id, name); err != nil {
		writeAppError(w, errInternal)
		return
	}
	s.audit(user.ID, "partner_create", id, name)
	writeJSON(w, http.StatusCreated, map[string]any{"partner": map[string]any{"id": id, "name": name, "status": "prospect"}})
}

func (s *Server) handlePausePartner(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	res, err := s.store.db.Exec(`UPDATE partners SET status = 'paused' WHERE id = ?`, r.PathValue("id"))
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeAppError(w, errNotFound)
		return
	}
	s.audit(user.ID, "partner_pause", r.PathValue("id"), "")
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Store) AdminNotes(target string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT n.id, n.target, n.author_id, COALESCE(u.display_name,''), n.text, n.created_at
		FROM admin_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.target = ? ORDER BY n.created_at DESC, n.id DESC`, target)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, tgt, author, authorName, text, created string
		if err := rows.Scan(&id, &tgt, &author, &authorName, &text, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "target": tgt, "author_id": author, "author_name": authorName, "text": text, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Server) handleAdminNotes(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	target := strings.TrimSpace(r.URL.Query().Get("target"))
	if target == "" {
		writeAppError(w, invalidInput("Lipsește ținta notei."))
		return
	}
	notes, err := s.store.AdminNotes(target)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notes": notes})
}

func (s *Server) handleCreateNote(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct {
		Target string `json:"target"`
		Text   string `json:"text"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	target, text := strings.TrimSpace(body.Target), strings.TrimSpace(body.Text)
	if target == "" || len(target) > 64 {
		writeAppError(w, invalidInput("Ținta notei nu este validă."))
		return
	}
	if n := utf8.RuneCountInString(text); n < 1 || n > 1000 {
		writeAppError(w, invalidInput("Nota trebuie să aibă între 1 și 1000 de caractere."))
		return
	}
	id, err := NewID("note_")
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	created := NowRFC3339()
	if _, err := s.store.db.Exec(`INSERT INTO admin_notes (id, target, author_id, text, created_at) VALUES (?, ?, ?, ?, ?)`, id, target, user.ID, text, created); err != nil {
		writeAppError(w, errInternal)
		return
	}
	s.audit(user.ID, "note_create", target, truncateRunes(text, 120))
	writeJSON(w, http.StatusCreated, map[string]any{"note": map[string]any{"id": id, "target": target, "author_id": user.ID, "author_name": user.DisplayName, "text": text, "created_at": created}})
}

func (s *Server) handleAdminIdentity(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.db.Query(`SELECT id, email, kind, status, created_at, expires_at, checks_json, verified_provider FROM identity_sessions ORDER BY created_at DESC LIMIT 300`)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, email, kind, status, created, expires, checksRaw, provider string
		if err := rows.Scan(&id, &email, &kind, &status, &created, &expires, &checksRaw, &provider); err != nil {
			writeAppError(w, errInternal)
			return
		}
		checks := map[string]any{}
		_ = json.Unmarshal([]byte(checksRaw), &checks)
		out = append(out, map[string]any{"id": id, "email": email, "kind": kind, "status": status, "created_at": created, "expires_at": expires, "checks": checks, "provider": provider})
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": out})
}

func (s *Server) handleAdminEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.db.Query(`SELECT e.id, e.title, e.city, e.starts_at, e.ends_at, e.slots, e.min_age, e.description,
		(SELECT COUNT(*) FROM attendances a WHERE a.event_id = e.id),
		(SELECT COUNT(*) FROM attendances a WHERE a.event_id = e.id AND a.status = 'checked_in'),
		(SELECT COUNT(*) FROM attendances a WHERE a.event_id = e.id AND a.status = 'completed')
		FROM events e ORDER BY e.starts_at ASC, e.id ASC`)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var e eventView
		var going, checked, completed int
		if err := rows.Scan(&e.ID, &e.Title, &e.City, &e.StartsAt, &e.EndsAt, &e.Slots, &e.MinAge, &e.Description, &going, &checked, &completed); err != nil {
			writeAppError(w, errInternal)
			return
		}
		out = append(out, map[string]any{"id": e.ID, "title": e.Title, "city": e.City, "starts_at": e.StartsAt, "ends_at": e.EndsAt, "slots": e.Slots, "min_age": e.MinAge, "description": e.Description, "attendees": going, "checked_in": checked, "completed": completed})
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": out})
}

func (s *Server) handleDeleteEvent(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	id := r.PathValue("id")
	var title string
	if err := s.store.db.QueryRow(`SELECT title FROM events WHERE id = ?`, id).Scan(&title); err != nil {
		if err == sql.ErrNoRows {
			writeAppError(w, errNotFound)
			return
		}
		writeAppError(w, errInternal)
		return
	}
	if _, err := s.store.db.Exec(`DELETE FROM attendances WHERE event_id = ?`, id); err != nil {
		writeAppError(w, errInternal)
		return
	}
	if _, err := s.store.db.Exec(`DELETE FROM events WHERE id = ?`, id); err != nil {
		writeAppError(w, errInternal)
		return
	}
	s.audit(user.ID, "event_delete", id, title)
	writeJSON(w, http.StatusOK, okBody{OK: true})
}
