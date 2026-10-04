package server

import (
	"database/sql"
	"net/http"
)

type contractView struct {
	ID       string  `json:"id"`
	WorkerID string  `json:"worker_id"`
	Kind     string  `json:"kind"`
	ParentID *string `json:"parent_id"`
	TaskID   *string `json:"task_id"`
	Status   string  `json:"status"`
	SignedAt *string `json:"signed_at"`
}

func (s *Server) handleFrameworkContract(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	contract, created, err := s.store.FrameworkContract(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, struct {
		Contract contractView `json:"contract"`
	}{Contract: contract})
}

func (s *Server) handleSignContract(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	contract, err := s.store.SignContract(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Contract contractView `json:"contract"`
	}{Contract: contract})
}

func (s *Store) FrameworkContract(workerID string) (contractView, bool, error) {
	existing, err := s.frameworkFor(workerID)
	if err == nil {
		return existing, false, nil
	}
	if ae, ok := asAppError(err); !ok || ae.Code != "not_found" {
		return contractView{}, false, err
	}
	id, err := NewID("con_")
	if err != nil {
		return contractView{}, false, errInternal
	}
	_, err = s.db.Exec(`INSERT INTO contracts (id, worker_id, kind, parent_id, task_id, version, status, signed_at) VALUES (?, ?, 'framework', NULL, NULL, 1, 'draft', NULL)`, id, workerID)
	if err != nil {
		return contractView{}, false, errInternal
	}
	view, err := s.contractByID(id)
	return view, true, err
}

func (s *Store) SignContract(id, workerID string) (contractView, error) {
	var owner, status string
	err := s.db.QueryRow(`SELECT worker_id, status FROM contracts WHERE id = ?`, id).Scan(&owner, &status)
	if err == sql.ErrNoRows {
		return contractView{}, errNotFound
	}
	if err != nil {
		return contractView{}, errInternal
	}
	if owner != workerID {
		return contractView{}, errForbidden
	}
	if status != "signed" {
		now := NowRFC3339()
		if _, err := s.db.Exec(`UPDATE contracts SET status = 'signed', signed_at = ? WHERE id = ?`, now, id); err != nil {
			return contractView{}, errInternal
		}
	}
	return s.contractByID(id)
}

func (s *Store) frameworkFor(workerID string) (contractView, error) {
	view, err := scanContract(s.db.QueryRow(`SELECT id, worker_id, kind, parent_id, task_id, status, signed_at FROM contracts WHERE worker_id = ? AND kind = 'framework' ORDER BY status = 'signed' DESC LIMIT 1`, workerID))
	if err == sql.ErrNoRows {
		return contractView{}, errNotFound
	}
	if err != nil {
		return contractView{}, errInternal
	}
	return view, nil
}

func (s *Store) contractByID(id string) (contractView, error) {
	row := s.db.QueryRow(`SELECT id, worker_id, kind, parent_id, task_id, status, signed_at FROM contracts WHERE id = ?`, id)
	view, err := scanContract(row)
	if err == sql.ErrNoRows {
		return contractView{}, errNotFound
	}
	return view, err
}

func scanContract(row interface{ Scan(...any) error }) (contractView, error) {
	var view contractView
	var parent, task, signed sql.NullString
	err := row.Scan(&view.ID, &view.WorkerID, &view.Kind, &parent, &task, &view.Status, &signed)
	if err != nil {
		return contractView{}, err
	}
	if parent.Valid {
		view.ParentID = &parent.String
	}
	if task.Valid {
		view.TaskID = &task.String
	}
	if signed.Valid {
		view.SignedAt = &signed.String
	}
	return view, nil
}
