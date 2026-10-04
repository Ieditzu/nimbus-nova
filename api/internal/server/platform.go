package server

import (
	"database/sql"
	"net/http"
	"strings"
)

func (s *Server) handleCancelTask(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requirePublisher(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	task, err := s.store.CancelTask(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleSearchTasks(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	tasks, err := s.store.SearchTasks(r.URL.Query().Get("kind"), r.URL.Query().Get("from"), r.URL.Query().Get("to"), r.URL.Query().Get("city"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Tasks []TaskPublic `json:"tasks"`
	}{Tasks: tasksOrEmpty(redactTasks(tasks, user.ID))})
}

func (s *Server) handleDispute(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	id, err := s.store.OpenDispute(r.PathValue("id"), user.ID, body.Reason)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	_ = s.store.Notify(user.ID, "dispute_opened", r.PathValue("id"))
	writeJSON(w, http.StatusCreated, map[string]any{"dispute": map[string]string{"id": id, "status": "open"}})
}

func (s *Server) handleMyLedger(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.Ledger(user.ID, user.Role, "")
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": rows})
}

func (s *Server) handleAdminLedger(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.Ledger("", "admin", r.URL.Query().Get("task_id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": rows})
}

func (s *Server) handleMyContracts(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.ListContracts(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"contracts": rows})
}

func (s *Server) handleCreateDocument(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Kind string `json:"kind"`
	}
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if body.Kind != "id_card" && body.Kind != "certificate" {
		writeAppError(w, invalidInput("Tipul documentului trebuie să fie id_card sau certificate."))
		return
	}
	id, err := s.store.AddDocument(user.ID, body.Kind)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"document": map[string]string{"id": id, "kind": body.Kind}})
}

func (s *Server) handlePartnerShifts(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if user.Role != "partner_user" {
		writeAppError(w, errForbidden)
		return
	}
	if r.Method == http.MethodGet {
		tasks, err := s.store.PartnerShifts(user.ID)
		if err != nil {
			s.writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, struct {
			Tasks []TaskPublic `json:"tasks"`
		}{Tasks: tasksOrEmpty(tasks)})
		return
	}
	var req CreateTaskRequest
	if ae = readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.CreatePartnerShift(user.ID, req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleAdminPartners(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.ListPartners()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"partners": rows})
}

func (s *Server) handleActivatePartner(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	if err := s.store.ActivatePartner(r.PathValue("id")); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(user.ID, "partner_activate", r.PathValue("id"), "")
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleAttend(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if user.Role == "guardian" {
		writeAppError(w, errForbidden)
		return
	}
	if err := s.store.Attend(r.PathValue("id"), user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleEventCheckIn(w http.ResponseWriter, r *http.Request) {
	if err := s.eventStaff(w, r, "checked_in"); err != nil {
		return
	}
}

func (s *Server) handleEventComplete(w http.ResponseWriter, r *http.Request) {
	if err := s.eventStaff(w, r, "completed"); err != nil {
		return
	}
}

func (s *Server) eventStaff(w http.ResponseWriter, r *http.Request, status string) error {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return ae
	}
	if user.Role != "organizer" && user.Role != "admin" {
		writeAppError(w, errForbidden)
		return errForbidden
	}
	var body struct {
		VolunteerID string `json:"volunteer_id"`
	}
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return ae
	}
	diploma, err := s.store.SetAttendance(r.PathValue("id"), body.VolunteerID, status)
	if err != nil {
		s.writeErr(w, err)
		return err
	}
	if status == "completed" {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "diploma": diploma})
		return nil
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
	return nil
}

func (s *Server) handleReputation(w http.ResponseWriter, r *http.Request) {
	count, average, err := s.store.Reputation(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"count": count, "average": average})
}

func (s *Server) handleResolveDispute(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Result     string `json:"result"`
		WorkerBani int64  `json:"worker_bani"`
		PosterBani int64  `json:"poster_bani"`
	}
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if err := s.store.ResolveDispute(r.PathValue("id"), body.Result, body.WorkerBani, body.PosterBani); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(user.ID, "dispute_resolve", r.PathValue("id"), body.Result)
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleNotifications(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.Notifications(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"notifications": rows})
}

func (s *Store) Notify(userID, kind, taskID string) error {
	id, err := NewID("ntf_")
	if err != nil {
		return errInternal
	}
	_, err = s.db.Exec(`INSERT INTO notifications (id, user_id, kind, task_id, read_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)`, id, userID, kind, taskID, NowRFC3339())
	if err != nil {
		return errInternal
	}
	return nil
}

func (s *Store) CancelTask(id, posterID string) (TaskPublic, error) {
	var owner, status, starts, payStatus string
	err := s.db.QueryRow(`SELECT poster_id, status, starts_at, pay_status FROM tasks WHERE id = ?`, id).Scan(&owner, &status, &starts, &payStatus)
	if err == sql.ErrNoRows {
		return TaskPublic{}, errNotFound
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	if owner != posterID {
		return TaskPublic{}, errForbidden
	}
	if starts <= NowRFC3339() {
		return TaskPublic{}, appErr(409, "already_started", "Sarcina a început deja.")
	}
	if status != "open" && status != "assigned" {
		return TaskPublic{}, appErr(409, "already_started", "Sarcina a început deja.")
	}
	if _, err := s.db.Exec(`UPDATE tasks SET status = 'hidden', pay_status = CASE WHEN pay_status = 'held' THEN 'refunded' ELSE pay_status END WHERE id = ?`, id); err != nil {
		return TaskPublic{}, errInternal
	}
	if payStatus == "held" {
		_, _ = s.db.Exec(`UPDATE payment_intents SET status = 'refunded' WHERE task_id = ?`, id)
	}
	return s.taskByID(id)
}

func (s *Store) SearchTasks(kind, from, to, city string) ([]TaskPublic, error) {
	q := taskSelect + ` WHERE t.status = 'open'`
	var args []any
	if strings.TrimSpace(kind) != "" {
		q += ` AND t.kind = ?`
		args = append(args, strings.TrimSpace(kind))
	}
	if strings.TrimSpace(from) != "" {
		q += ` AND t.starts_at >= ?`
		args = append(args, strings.TrimSpace(from))
	}
	if strings.TrimSpace(to) != "" {
		q += ` AND t.ends_at <= ?`
		args = append(args, strings.TrimSpace(to))
	}
	q += ` ORDER BY t.starts_at ASC, t.id ASC`
	tasks, err := s.queryTasks(q, args...)
	if err != nil {
		return nil, err
	}
	want := strings.TrimSpace(city)
	if want == "" {
		return tasks, nil
	}
	out := []TaskPublic{}
	for _, task := range tasks {
		if strings.EqualFold(strings.TrimSpace(task.City), want) {
			out = append(out, task)
		}
	}
	return out, nil
}

func (s *Store) OpenDispute(taskID, openerID, reason string) (string, error) {
	if strings.TrimSpace(reason) == "" {
		return "", invalidInput("Motivul disputei este obligatoriu.")
	}
	var posterID, status string
	var assignee sql.NullString
	err := s.db.QueryRow(`SELECT poster_id, status, assignee_id FROM tasks WHERE id = ?`, taskID).Scan(&posterID, &status, &assignee)
	if err == sql.ErrNoRows {
		return "", errNotFound
	}
	if err != nil {
		return "", errInternal
	}
	if openerID != posterID && (!assignee.Valid || openerID != assignee.String) {
		return "", errForbidden
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM disputes WHERE task_id = ? AND status = 'open'`, taskID).Scan(&n); err != nil {
		return "", errInternal
	}
	if n > 0 {
		return "", appErr(409, "dispute_exists", "Există deja o dispută deschisă.")
	}
	id, err := NewID("dis_")
	if err != nil {
		return "", errInternal
	}
	_, err = s.db.Exec(`INSERT INTO disputes (id, task_id, opener_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)`, id, taskID, openerID, strings.TrimSpace(reason), NowRFC3339())
	if err != nil {
		return "", errInternal
	}
	_ = status
	return id, nil
}

func (s *Store) hasOpenDispute(taskID string) (bool, error) {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM disputes WHERE task_id = ? AND status = 'open'`, taskID).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

func (s *Store) Ledger(userID, role, taskID string) ([]map[string]any, error) {
	q := `SELECT id, task_id, account, direction, amount_bani, created_at FROM ledger_entries WHERE 1=1`
	var args []any
	if taskID != "" {
		q += ` AND task_id = ?`
		args = append(args, taskID)
	}
	if role == "poster" {
		q += ` AND task_id IN (SELECT id FROM tasks WHERE poster_id = ?)`
		args = append(args, userID)
	}
	if role == "worker" {
		q += ` AND task_id IN (SELECT id FROM tasks WHERE assignee_id = ?)`
		args = append(args, userID)
	}
	q += ` ORDER BY created_at ASC, id ASC`
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, task, account, direction, created string
		var amount int64
		if err := rows.Scan(&id, &task, &account, &direction, &amount, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "task_id": task, "account": account, "direction": direction, "amount_bani": amount, "created_at": created})
	}
	return out, rows.Err()
}

func (s *Store) ListContracts(workerID string) ([]contractView, error) {
	rows, err := s.db.Query(`SELECT id, worker_id, kind, parent_id, task_id, status, signed_at FROM contracts WHERE worker_id = ? ORDER BY kind, id`, workerID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []contractView{}
	for rows.Next() {
		view, err := scanContract(rows)
		if err != nil {
			return nil, errInternal
		}
		out = append(out, view)
	}
	return out, rows.Err()
}

func (s *Store) AddDocument(userID, kind string) (string, error) {
	id, err := NewID("doc_")
	if err != nil {
		return "", errInternal
	}
	_, err = s.db.Exec(`INSERT INTO documents (id, user_id, kind, storage_key) VALUES (?, ?, ?, ?)`, id, userID, kind, "private/"+id)
	if err != nil {
		return "", errInternal
	}
	return id, nil
}

func (s *Store) ListPartners() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, name, status FROM partners ORDER BY name`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, name, status string
		if err := rows.Scan(&id, &name, &status); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "name": name, "status": status})
	}
	return out, rows.Err()
}

func (s *Store) ActivatePartner(id string) error {
	res, err := s.db.Exec(`UPDATE partners SET status = 'active' WHERE id = ?`, id)
	if err != nil {
		return errInternal
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errNotFound
	}
	return nil
}

func (s *Store) PartnerShifts(userID string) ([]TaskPublic, error) {
	var partnerID, status string
	err := s.db.QueryRow(`SELECT id, status FROM partners WHERE user_id = ?`, userID).Scan(&partnerID, &status)
	if err == sql.ErrNoRows {
		return nil, errForbidden
	}
	if err != nil {
		return nil, errInternal
	}
	return s.queryTasks(taskSelect+` WHERE t.partner_id = ? ORDER BY t.starts_at ASC, t.id ASC`, partnerID)
}

func (s *Store) CreatePartnerShift(userID string, req CreateTaskRequest) (TaskPublic, error) {
	var partnerID, status string
	err := s.db.QueryRow(`SELECT id, status FROM partners WHERE user_id = ?`, userID).Scan(&partnerID, &status)
	if err == sql.ErrNoRows || status != "active" {
		return TaskPublic{}, appErr(403, "partner_inactive", "Partenerul nu este activ.")
	}
	if err != nil {
		return TaskPublic{}, errInternal
	}
	if ae := ValidateCreateTask(req); ae != nil {
		return TaskPublic{}, ae
	}
	task, err := s.CreateTask(User{ID: userID, Role: "partner_user"}, req)
	if err != nil {
		return TaskPublic{}, err
	}
	_, err = s.db.Exec(`UPDATE tasks SET kind = 'partner_shift', partner_id = ? WHERE id = ?`, partnerID, task.ID)
	if err != nil {
		return TaskPublic{}, errInternal
	}
	return s.taskByID(task.ID)
}

func (s *Store) Attend(eventID, userID string) error {
	var minAge int
	err := s.db.QueryRow(`SELECT min_age FROM events WHERE id = ?`, eventID).Scan(&minAge)
	if err == sql.ErrNoRows {
		return errNotFound
	}
	if err != nil {
		return errInternal
	}
	var birth sql.NullString
	var volunteer int
	_ = s.db.QueryRow(`SELECT birth_date, volunteer_only FROM users WHERE id = ?`, userID).Scan(&birth, &volunteer)
	if volunteer == 1 && minAge > 16 {
		return appErr(403, "underage", "Vârsta nu este suficientă pentru acest eveniment.")
	}
	id, err := NewID("att_")
	if err != nil {
		return errInternal
	}
	_, err = s.db.Exec(`INSERT INTO attendances (id, event_id, volunteer_id, status) VALUES (?, ?, ?, 'going')`, id, eventID, userID)
	if err != nil {
		return errInternal
	}
	return nil
}

func (s *Store) SetAttendance(eventID, volunteerID, status string) (map[string]string, error) {
	res, err := s.db.Exec(`UPDATE attendances SET status = ? WHERE event_id = ? AND volunteer_id = ?`, status, eventID, volunteerID)
	if err != nil {
		return nil, errInternal
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, errNotFound
	}
	if status != "completed" {
		return nil, nil
	}
	id, err := NewID("dip_")
	if err != nil {
		return nil, errInternal
	}
	issued := NowRFC3339()
	_, err = s.db.Exec(`INSERT INTO diplomas (id, event_id, volunteer_id, code, issued_at) VALUES (?, ?, ?, ?, ?)`, id, eventID, volunteerID, id, issued)
	if err != nil {
		return nil, errInternal
	}
	return map[string]string{"id": id, "code": id, "issued_at": issued}, nil
}

func (s *Store) Reputation(userID string) (int, float64, error) {
	var count int
	var average sql.NullFloat64
	err := s.db.QueryRow(`SELECT COUNT(*), AVG(stars) FROM reviews WHERE subject_id = ?`, userID).Scan(&count, &average)
	if err != nil {
		return 0, 0, errInternal
	}
	if !average.Valid {
		return count, 0, nil
	}
	return count, average.Float64, nil
}

func (s *Store) ResolveDispute(id, result string, workerBani, posterBani int64) error {
	var taskID, status string
	err := s.db.QueryRow(`SELECT task_id, status FROM disputes WHERE id = ?`, id).Scan(&taskID, &status)
	if err == sql.ErrNoRows {
		return errNotFound
	}
	if err != nil {
		return errInternal
	}
	if status != "open" {
		return appErr(409, "dispute_exists", "Disputa nu mai este deschisă.")
	}
	if result != "release" && result != "refund" && result != "split" {
		return invalidInput("Rezultatul trebuie să fie release, refund sau split.")
	}
	if result == "split" && workerBani+posterBani <= 0 {
		return invalidInput("Împărțirea trebuie să aibă sume pozitive.")
	}
	if _, err := s.db.Exec(`UPDATE disputes SET status = 'resolved' WHERE id = ?`, id); err != nil {
		return errInternal
	}
	next := "released"
	if result == "refund" {
		next = "refunded"
	}
	_, _ = s.db.Exec(`UPDATE tasks SET pay_status = ? WHERE id = ?`, next, taskID)
	return nil
}

func (s *Store) Notifications(userID string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, kind, COALESCE(task_id, ''), COALESCE(read_at, ''), created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC`, userID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id, kind, taskID, readAt, created string
		if err := rows.Scan(&id, &kind, &taskID, &readAt, &created); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "kind": kind, "task_id": taskID, "read_at": readAt, "created_at": created})
	}
	return out, rows.Err()
}
