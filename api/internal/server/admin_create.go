package server

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type adminCreateUser struct {
	Role             string `json:"role"`
	Email            string `json:"email"`
	Password         string `json:"password"`
	DisplayName      string `json:"display_name"`
	PhoneNumber      string `json:"phone_number"`
	BirthDate        string `json:"birth_date"`
	GuardianEmail    string `json:"guardian_email"`
	IdentityVerified *bool  `json:"identity_verified"`
}

type adminCreateTask struct {
	PosterID string `json:"poster_id"`
	CreateTaskRequest
}

func (s *Server) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var req adminCreateUser
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	id, err := s.store.AdminCreateUser(req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "user_create", id, strings.TrimSpace(req.Role))
	detail, err := s.store.AdminUserDetail(id)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, detail)
}

func (s *Server) handleAdminCreateTask(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var req adminCreateTask
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if ae := readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	poster, err := s.store.posterForDesk(strings.TrimSpace(req.PosterID), req.AmountBani)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if ae := ValidateCreateTask(req.CreateTaskRequest); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.CreateTask(poster, req.CreateTaskRequest)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "task_create", task.ID, poster.ID)
	writeJSON(w, http.StatusCreated, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleAdminUpdateTask(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var req CreateTaskRequest
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if ae := readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae := ValidateCreateTask(req); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.AdminUpdateTask(r.PathValue("id"), req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "task_edit", task.ID, task.Title)
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleAdminAssignTask(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct {
		WorkerID string `json:"worker_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.AdminAssign(r.PathValue("id"), strings.TrimSpace(body.WorkerID))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "task_assign", task.ID, strings.TrimSpace(body.WorkerID))
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleAdminAcceptApplication(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	task, workerID, err := s.store.AdminAcceptApplication(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "application_accept", task.ID, workerID)
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Store) AdminCreateUser(req adminCreateUser) (string, error) {
	role := strings.TrimSpace(req.Role)
	if role != "worker" && role != "poster" && role != "admin" {
		return "", invalidInput("Rolul trebuie să fie lucrător, poster sau admin.")
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !strings.Contains(email, "@") || len(email) > 200 {
		return "", invalidInput("Emailul nu este valid.")
	}
	if len(req.Password) < 8 {
		return "", invalidInput("Parola trebuie să aibă cel puțin 8 caractere.")
	}
	name := strings.TrimSpace(req.DisplayName)
	if n := len([]rune(name)); n < 2 || n > 80 {
		return "", invalidInput("Numele trebuie să aibă între 2 și 80 de caractere.")
	}
	birthText := strings.TrimSpace(req.BirthDate)
	birth, err := time.Parse("2006-01-02", birthText)
	if err != nil || birth.After(time.Now()) || birth.Year() < 1900 {
		return "", invalidInput("Data nașterii trebuie să fie în formatul AAAA-LL-ZZ, în trecut.")
	}
	phone := ""
	if strings.TrimSpace(req.PhoneNumber) != "" {
		parsed, ae := normalizePhone(req.PhoneNumber)
		if ae != nil {
			return "", ae
		}
		phone = parsed
	}
	guardian := strings.TrimSpace(req.GuardianEmail)
	if guardian != "" && !strings.Contains(guardian, "@") {
		return "", invalidInput("Emailul tutorelui nu este valid.")
	}
	volunteer := 0
	if accountVolunteerOnly(birthText, false) {
		volunteer = 1
	}
	if volunteer == 1 && role != "worker" {
		return "", invalidInput("Sub 16 ani contul este doar pentru voluntariat.")
	}
	if volunteer == 1 && !strings.Contains(guardian, "@") {
		return "", invalidInput("Sub 16 ani ai nevoie de emailul tutorelui.")
	}
	verified := 1
	if req.IdentityVerified != nil && !*req.IdentityVerified {
		verified = 0
	}
	var existing int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&existing); err != nil {
		return "", errInternal
	}
	if existing > 0 {
		return "", appErr(409, "duplicate_email", "Există deja un cont cu acest email.")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", errInternal
	}
	id, err := NewID("user_")
	if err != nil {
		return "", errInternal
	}
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		_, err := conn.ExecContext(ctx, `INSERT INTO users (id,role,display_name,email,password_hash,birth_date,volunteer_only,guardian_email,status,phone_number,created_at,identity_verified) VALUES(?,?,?,?,?,?,?,?,'active',?,?,?)`,
			id, role, name, email, string(hash), birthText, volunteer, guardian, phone, NowRFC3339(), verified)
		if err != nil {
			return err
		}
		_, err = conn.ExecContext(ctx, `INSERT INTO profiles (user_id, skills_json, city, availability, bio) VALUES (?, '[]', '', '', '')`, id)
		return err
	})
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return "", ae
		}
		return "", errInternal
	}
	return id, nil
}

func (s *Store) AdminUpdateTask(id string, req CreateTaskRequest) (TaskPublic, error) {
	var poster, status, pay string
	err := s.db.QueryRow(`SELECT poster_id, status, pay_status FROM tasks WHERE id = ?`, id).Scan(&poster, &status, &pay)
	if err == sql.ErrNoRows {
		return TaskPublic{}, errNotFound
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	if status != "open" || pay == "held" {
		return TaskPublic{}, appErr(409, "task_locked", "Poți modifica doar un anunț deschis, fără persoană acceptată sau plată blocată.")
	}
	if _, err = s.posterForDesk(poster, req.AmountBani); err != nil {
		return TaskPublic{}, err
	}
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var current, currentPay string
		err := conn.QueryRowContext(ctx, `SELECT status, pay_status FROM tasks WHERE id = ?`, id).Scan(&current, &currentPay)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if current != "open" || currentPay == "held" {
			return appErr(409, "task_locked", "Poți modifica doar un anunț deschis, fără persoană acceptată sau plată blocată.")
		}
		_, err = conn.ExecContext(ctx, `UPDATE tasks SET title=?,category=?,city=?,photo_url=?,sector=?,lat=?,lng=?,starts_at=?,ends_at=?,amount_bani=?,description=?,safety_note=?,kind=CASE WHEN ?=0 THEN 'volunteer' ELSE 'paid' END,county=?,locality_id=?,job_type=? WHERE id=?`,
			strings.TrimSpace(req.Title), strings.TrimSpace(req.Category), strings.TrimSpace(req.City), strings.TrimSpace(req.PhotoURL), strings.TrimSpace(req.Sector), coordOrZero(req.Lat), coordOrZero(req.Lng), strings.TrimSpace(req.StartsAt), strings.TrimSpace(req.EndsAt), req.AmountBani, strings.TrimSpace(req.Description), strings.TrimSpace(req.SafetyNote), req.AmountBani, strings.TrimSpace(req.County), strings.TrimSpace(req.LocalityID), strings.TrimSpace(req.JobType), id)
		return err
	})
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return TaskPublic{}, ae
		}
		return TaskPublic{}, errInternal
	}
	return s.taskByID(id)
}

func (s *Store) posterForDesk(id string, amount int64) (User, error) {
	var poster User
	var status, birth string
	var volunteer int
	err := s.db.QueryRow(`SELECT id, role, display_name, COALESCE(status,'active'), volunteer_only, COALESCE(birth_date,'') FROM users WHERE id = ?`, id).
		Scan(&poster.ID, &poster.Role, &poster.DisplayName, &status, &volunteer, &birth)
	if err == sql.ErrNoRows {
		return User{}, errNotFound
	}
	if err != nil {
		return User{}, errInternal
	}
	if poster.Role != "poster" {
		return User{}, invalidInput("Alege un cont de poster.")
	}
	if status != "active" {
		return User{}, invalidInput("Posterul este suspendat.")
	}
	poster.VolunteerOnly = accountVolunteerOnly(birth, volunteer == 1)
	if amount > 0 && poster.VolunteerOnly {
		return User{}, appErr(403, "publishing_age_required", "Publicarea joburilor plătite este disponibilă de la 16 ani.")
	}
	return poster, nil
}

func (s *Store) AdminAssign(taskID, workerID string) (TaskPublic, error) {
	if workerID == "" {
		return TaskPublic{}, invalidInput("Alege un lucrător.")
	}
	err := s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		return assignOnConn(ctx, conn, taskID, workerID)
	})
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return TaskPublic{}, ae
		}
		return TaskPublic{}, errInternal
	}
	return s.taskByID(taskID)
}

func (s *Store) AdminAcceptApplication(applicationID string) (TaskPublic, string, error) {
	var taskID, workerID, status string
	err := s.db.QueryRow(`SELECT task_id, worker_id, status FROM applications WHERE id = ?`, applicationID).Scan(&taskID, &workerID, &status)
	if err == sql.ErrNoRows {
		return TaskPublic{}, "", errNotFound
	}
	if err != nil {
		return TaskPublic{}, "", errInternal
	}
	if status == "rejected" {
		return TaskPublic{}, "", invalidInput("Candidatura a fost respinsă. Atribuie lucrătorul direct din sarcină.")
	}
	task, err := s.AdminAssign(taskID, workerID)
	return task, workerID, err
}

func assignOnConn(ctx context.Context, conn *sql.Conn, taskID, workerID string) error {
	var poster, taskStatus string
	var amount int64
	err := conn.QueryRowContext(ctx, `SELECT poster_id, status, amount_bani FROM tasks WHERE id = ?`, taskID).Scan(&poster, &taskStatus, &amount)
	if err == sql.ErrNoRows {
		return errNotFound
	}
	if err != nil {
		return errInternal
	}
	if taskStatus != "open" {
		return errTaskAlreadyAssigned
	}
	if workerID == poster {
		return invalidInput("Posterul nu poate fi și lucrătorul.")
	}
	var role, status, birth string
	var volunteer int
	err = conn.QueryRowContext(ctx, `SELECT role, COALESCE(status,'active'), COALESCE(birth_date,''), volunteer_only FROM users WHERE id = ?`, workerID).Scan(&role, &status, &birth, &volunteer)
	if err == sql.ErrNoRows {
		return errNotFound
	}
	if err != nil {
		return errInternal
	}
	if role != "worker" || status != "active" {
		return invalidInput("Alege un lucrător activ.")
	}
	if amount > 0 && accountVolunteerOnly(birth, volunteer == 1) {
		return errVolunteerOnly
	}
	var appID, appStatus string
	err = conn.QueryRowContext(ctx, `SELECT id, status FROM applications WHERE task_id = ? AND worker_id = ?`, taskID, workerID).Scan(&appID, &appStatus)
	if err == sql.ErrNoRows {
		appID, err = NewID("app_")
		if err != nil {
			return errInternal
		}
		if _, err = conn.ExecContext(ctx, `INSERT INTO applications (id, task_id, worker_id, message, status, created_at) VALUES (?, ?, ?, 'Atribuită din birou.', 'accepted', ?)`, appID, taskID, workerID, NowRFC3339()); err != nil {
			return errInternal
		}
	} else if err != nil {
		return errInternal
	} else if _, err = conn.ExecContext(ctx, `UPDATE applications SET status = 'accepted' WHERE id = ?`, appID); err != nil {
		return errInternal
	}
	if _, err = conn.ExecContext(ctx, `UPDATE applications SET status = 'rejected' WHERE task_id = ? AND status = 'pending' AND id != ?`, taskID, appID); err != nil {
		return errInternal
	}
	if _, err = conn.ExecContext(ctx, `UPDATE tasks SET status = 'assigned', assignee_id = ? WHERE id = ?`, workerID, taskID); err != nil {
		return errInternal
	}
	// Desk assignment is a marketplace match too; it cannot sign on behalf of a worker.
	return nil
}
