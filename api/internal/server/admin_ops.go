package server

import (
	"database/sql"
	"net/http"
	"os"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

func (s *Store) ensureAdminTables() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS admin_logs (
		id TEXT PRIMARY KEY,
		actor_id TEXT NOT NULL,
		action TEXT NOT NULL,
		target TEXT NOT NULL,
		detail TEXT NOT NULL,
		created_at TEXT NOT NULL
	)`)
	return err
}

func (s *Store) EnsureAdmin(email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || strings.TrimSpace(password) == "" {
		return nil
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	id, err := NewID("user_")
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO users (id, role, display_name, email, password_hash, birth_date, volunteer_only, status) VALUES (?, 'admin', 'Moderator Nova', ?, ?, '1990-01-01', 0, 'active')`, id, email, string(hash))
	return err
}

func (s *Server) audit(actorID, action, target, detail string) {
	_ = s.store.WriteAdminLog(actorID, action, target, detail)
}

func (s *Store) WriteAdminLog(actorID, action, target, detail string) error {
	id, err := NewID("log_")
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO admin_logs (id, actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, actorID, action, target, detail, NowRFC3339())
	return err
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (User, bool) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return User{}, false
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return User{}, false
	}
	return user, true
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.AdminUsers()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": rows})
}

func (s *Server) handleSuspendUser(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	id := r.PathValue("id")
	if id == user.ID {
		writeAppError(w, invalidInput("Nu te poți suspenda singur."))
		return
	}
	if err := s.store.SetUserStatus(id, "suspended"); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(user.ID, "user_suspend", id, "")
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleActivateUser(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	id := r.PathValue("id")
	if err := s.store.SetUserStatus(id, "active"); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(user.ID, "user_activate", id, "")
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.AdminLogs()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": rows})
}

func (s *Server) handleAdminDisputes(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.AdminDisputes()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"disputes": rows})
}

func (s *Server) handleUnhide(w http.ResponseWriter, r *http.Request) {
	user, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	task, err := s.store.Unhide(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(user.ID, "task_unhide", task.ID, task.Title)
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Store) AdminUsers() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, role, display_name, COALESCE(email, ''), COALESCE(status, 'active'), volunteer_only FROM users ORDER BY display_name, id`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, role, name, email, status string
		var volunteer int
		if err := rows.Scan(&id, &role, &name, &email, &status, &volunteer); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{
			"id": id, "role": role, "display_name": name, "email": email,
			"status": status, "volunteer_only": volunteer == 1,
		})
	}
	return out, rows.Err()
}

func (s *Store) SetUserStatus(id, status string) error {
	res, err := s.db.Exec(`UPDATE users SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return errInternal
	}
	n, err := res.RowsAffected()
	if err != nil {
		return errInternal
	}
	if n == 0 {
		return errNotFound
	}
	if status == "suspended" {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, id)
	}
	return nil
}

func (s *Store) AdminLogs() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, actor_id, action, target, detail, created_at FROM admin_logs ORDER BY created_at DESC, id DESC LIMIT 200`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, actor, action, target, detail, created string
		if err := rows.Scan(&id, &actor, &action, &target, &detail, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "actor_id": actor, "action": action, "target": target, "detail": detail, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Store) AdminDisputes() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, task_id, opener_id, reason, status, created_at FROM disputes ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, taskID, opener, reason, status, created string
		if err := rows.Scan(&id, &taskID, &opener, &reason, &status, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "task_id": taskID, "opener_id": opener, "reason": reason, "status": status, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Store) Unhide(id string) (TaskPublic, error) {
	current, err := s.taskByID(id)
	if err != nil {
		return TaskPublic{}, err
	}
	if current.Status != "hidden" {
		return TaskPublic{}, appErr(409, "task_not_hidden", "Sarcina nu este ascunsă.")
	}
	if _, err := s.db.Exec(`UPDATE tasks SET status = 'open' WHERE id = ?`, id); err != nil {
		return TaskPublic{}, errInternal
	}
	return s.taskByID(id)
}

func adminEmailFromEnv() (string, string) {
	return os.Getenv("ADMIN_EMAIL"), os.Getenv("ADMIN_PASSWORD")
}

func (s *Store) dbOrEmpty(err error) error {
	if err == sql.ErrNoRows {
		return errNotFound
	}
	return err
}
