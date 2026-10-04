package server

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
)

func (s *Server) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	user, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requirePublisher(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	var req CreateTaskRequest
	r.Body = http.MaxBytesReader(w, r.Body, 16384)
	if ae = readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = ValidateCreateTask(req); ae != nil {
		writeAppError(w, ae)
		return
	}
	err := s.store.mutateOwnedOpenTask(r.PathValue("id"), user.ID, &req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	task, err := s.store.taskByID(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, 200, struct {
		Task TaskPublic `json:"task"`
	}{task})
}
func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	user, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requirePublisher(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	if err := s.store.mutateOwnedOpenTask(r.PathValue("id"), user.ID, nil); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, 200, okBody{OK: true})
}
func (s *Store) mutateOwnedOpenTask(id, owner string, req *CreateTaskRequest) error {
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var poster, status, pay string
		err := conn.QueryRowContext(ctx, `SELECT poster_id,status,pay_status FROM tasks WHERE id=?`, id).Scan(&poster, &status, &pay)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if poster != owner {
			return errForbidden
		}
		if status != "open" || pay == "held" {
			return appErr(409, "task_locked", "Poți modifica sau șterge doar un anunț deschis, fără persoană acceptată sau plată blocată.")
		}
		if req == nil {
			if _, err = conn.ExecContext(ctx, `UPDATE applications SET status='rejected' WHERE task_id=? AND status='pending'`, id); err != nil {
				return err
			}
			_, err = conn.ExecContext(ctx, `UPDATE tasks SET status='hidden' WHERE id=?`, id)
			return err
		}
		_, err = conn.ExecContext(ctx, `UPDATE tasks SET title=?,category=?,city=?,photo_url=?,sector=?,lat=?,lng=?,starts_at=?,ends_at=?,amount_bani=?,description=?,safety_note=?,kind=CASE WHEN ?=0 THEN 'volunteer' ELSE 'paid' END,county=?,locality_id=?,job_type=? WHERE id=?`, strings.TrimSpace(req.Title), strings.TrimSpace(req.Category), strings.TrimSpace(req.City), strings.TrimSpace(req.PhotoURL), strings.TrimSpace(req.Sector), coordOrZero(req.Lat), coordOrZero(req.Lng), strings.TrimSpace(req.StartsAt), strings.TrimSpace(req.EndsAt), req.AmountBani, strings.TrimSpace(req.Description), strings.TrimSpace(req.SafetyNote), req.AmountBani, strings.TrimSpace(req.County), strings.TrimSpace(req.LocalityID), strings.TrimSpace(req.JobType), id)
		return err
	})
}
