package server

import (
	"net/http"
	"strings"
)

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/tasks", s.handleListTasks)
	mux.HandleFunc("POST /v1/tasks", s.handleCreateTask)
	mux.HandleFunc("GET /v1/tasks/{id}", s.handleGetTask)
	mux.HandleFunc("GET /v1/tasks/{id}/applications", s.handleListApplications)
	mux.HandleFunc("POST /v1/tasks/{id}/applications", s.handleApply)
	mux.HandleFunc("POST /v1/tasks/{id}/complete", s.handleComplete)
	mux.HandleFunc("GET /v1/tasks/{id}/reviews", s.handleListReviews)
	mux.HandleFunc("POST /v1/tasks/{id}/reviews", s.handleCreateReview)
	mux.HandleFunc("GET /v1/me/tasks", s.handleMyTasks)
	mux.HandleFunc("GET /v1/me/applications", s.handleMyApplications)
	mux.HandleFunc("GET /v1/profiles/me", s.handleGetProfile)
	mux.HandleFunc("PUT /v1/profiles/me", s.handlePutProfile)
	mux.HandleFunc("POST /v1/applications/{id}/accept", s.handleAccept)
	mux.HandleFunc("GET /v1/admin/tasks", s.handleAdminTasks)
	mux.HandleFunc("POST /v1/admin/tasks/{id}/hide", s.handleHide)
	mux.HandleFunc("POST /v1/demo/reset", s.handleReset)
	mux.HandleFunc("POST /v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /v1/auth/identity", s.handleStartIdentity)
	mux.HandleFunc("POST /v1/auth/identity/{id}/files", s.handleIdentityFile)
	mux.HandleFunc("POST /v1/auth/identity/{id}/complete", s.handleCompleteIdentity)
	mux.HandleFunc("POST /v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /v1/me", s.handleMe)
	mux.HandleFunc("POST /v1/tasks/{id}/pay", s.handlePay)
	mux.HandleFunc("POST /v1/contracts/framework", s.handleFrameworkContract)
	mux.HandleFunc("POST /v1/contracts/{id}/sign", s.handleSignContract)
	mux.HandleFunc("GET /v1/events", s.handleListEvents)
	mux.HandleFunc("POST /v1/events", s.handleCreateEvent)
	mux.HandleFunc("GET /v1/tasks/search", s.handleSearchTasks)
	mux.HandleFunc("POST /v1/tasks/{id}/cancel", s.handleCancelTask)
	mux.HandleFunc("POST /v1/tasks/{id}/dispute", s.handleDispute)
	mux.HandleFunc("GET /v1/me/ledger", s.handleMyLedger)
	mux.HandleFunc("GET /v1/admin/ledger", s.handleAdminLedger)
	mux.HandleFunc("GET /v1/me/contracts", s.handleMyContracts)
	mux.HandleFunc("GET /v1/me/notifications", s.handleNotifications)
	mux.HandleFunc("POST /v1/profiles/me/documents", s.handleCreateDocument)
	mux.HandleFunc("GET /v1/partner/shifts", s.handlePartnerShifts)
	mux.HandleFunc("POST /v1/partner/shifts", s.handlePartnerShifts)
	mux.HandleFunc("GET /v1/admin/partners", s.handleAdminPartners)
	mux.HandleFunc("POST /v1/admin/partners/{id}/activate", s.handleActivatePartner)
	mux.HandleFunc("POST /v1/events/{id}/attend", s.handleAttend)
	mux.HandleFunc("POST /v1/events/{id}/check-in", s.handleEventCheckIn)
	mux.HandleFunc("POST /v1/events/{id}/complete", s.handleEventComplete)
	mux.HandleFunc("GET /v1/users/{id}/reputation", s.handleReputation)
	mux.HandleFunc("POST /v1/admin/disputes/{id}/resolve", s.handleResolveDispute)
	return mux
}

func (s *Server) writeErr(w http.ResponseWriter, err error) {
	if ae, ok := asAppError(err); ok {
		writeAppError(w, ae)
		return
	}
	writeAppError(w, errInternal)
}

func requireRole(u User, role string) *AppError {
	if u.Role != role {
		return errForbidden
	}
	return nil
}

func tasksOrEmpty(in []TaskPublic) []TaskPublic {
	if in == nil {
		return []TaskPublic{}
	}
	return in
}

func appsOrEmpty(in []ApplicationView) []ApplicationView {
	if in == nil {
		return []ApplicationView{}
	}
	return in
}

func appsWithTaskOrEmpty(in []ApplicationWithTask) []ApplicationWithTask {
	if in == nil {
		return []ApplicationWithTask{}
	}
	return in
}

func reviewsOrEmpty(in []Review) []Review {
	if in == nil {
		return []Review{}
	}
	return in
}

type okBody struct {
	OK bool `json:"ok"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleListTasks(w http.ResponseWriter, r *http.Request) {
	category := strings.TrimSpace(r.URL.Query().Get("category"))
	city := strings.TrimSpace(r.URL.Query().Get("city"))
	if category != "" && !knownCategory(category) {
		writeAppError(w, invalidInput(msgCategory))
		return
	}
	tasks, err := s.store.ListOpen(category, city)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Tasks []TaskPublic `json:"tasks"`
	}{Tasks: tasksOrEmpty(tasks)})
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	task, err := s.store.PublicTask(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "poster"); ae != nil {
		writeAppError(w, ae)
		return
	}
	var req CreateTaskRequest
	if ae = readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = ValidateCreateTask(req); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.CreateTask(user, req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleMyTasks(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "poster"); ae != nil {
		writeAppError(w, ae)
		return
	}
	tasks, err := s.store.MyTasks(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Tasks []TaskPublic `json:"tasks"`
	}{Tasks: tasksOrEmpty(tasks)})
}

func (s *Server) handleGetProfile(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	profile, err := s.store.Profile(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Profile Profile `json:"profile"`
	}{Profile: profile})
}

func (s *Server) handlePutProfile(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	var in ProfileWrite
	if ae = readJSON(r, &in, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = ValidateProfile(in); ae != nil {
		writeAppError(w, ae)
		return
	}
	profile, err := s.store.SaveProfile(user, in)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Profile Profile `json:"profile"`
	}{Profile: profile})
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = ValidateMessage(body.Message); ae != nil {
		writeAppError(w, ae)
		return
	}
	app, err := s.store.Apply(user, r.PathValue("id"), body.Message)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	var posterID string
	_ = s.store.db.QueryRow(`SELECT poster_id FROM tasks WHERE id = ?`, r.PathValue("id")).Scan(&posterID)
	_ = s.store.Notify(posterID, "application_received", r.PathValue("id"))
	writeJSON(w, http.StatusCreated, struct {
		Application ApplicationView `json:"application"`
	}{Application: app})
}

func (s *Server) handleListApplications(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	apps, err := s.store.Applications(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Applications []ApplicationView `json:"applications"`
	}{Applications: appsOrEmpty(apps)})
}

func (s *Server) handleMyApplications(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "worker"); ae != nil {
		writeAppError(w, ae)
		return
	}
	apps, err := s.store.MyApplications(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Applications []ApplicationWithTask `json:"applications"`
	}{Applications: appsWithTaskOrEmpty(apps)})
}

func (s *Server) readEmptyObject(w http.ResponseWriter, r *http.Request) bool {
	var discard map[string]any
	if ae := readJSON(r, &discard, true); ae != nil {
		writeAppError(w, ae)
		return false
	}
	return true
}

func (s *Server) handleAccept(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "poster"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	task, err := s.store.Accept(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if task.AssigneeID != nil {
		_ = s.store.Notify(*task.AssigneeID, "application_accepted", task.ID)
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleComplete(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "poster"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	task, err := s.store.Complete(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if task.AssigneeID != nil {
		_ = s.store.Notify(*task.AssigneeID, "task_completed", task.ID)
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleCreateReview(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var in ReviewRequest
	if ae = readJSON(r, &in, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = ValidateReview(in); ae != nil {
		writeAppError(w, ae)
		return
	}
	review, err := s.store.AddReview(user, r.PathValue("id"), in.Stars, in.Text)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Review Review `json:"review"`
	}{Review: review})
}

func (s *Server) handleListReviews(w http.ResponseWriter, r *http.Request) {
	reviews, err := s.store.Reviews(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Reviews []Review `json:"reviews"`
	}{Reviews: reviewsOrEmpty(reviews)})
}

func (s *Server) handleAdminTasks(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	tasks, err := s.store.AdminTasks()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Tasks []TaskPublic `json:"tasks"`
	}{Tasks: tasksOrEmpty(tasks)})
}

func (s *Server) handleHide(w http.ResponseWriter, r *http.Request) {
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
	task, err := s.store.Hide(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: task})
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
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
	if err := s.store.Reset(); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}
