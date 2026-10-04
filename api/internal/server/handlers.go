package server

import (
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"
)

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /v1/tasks", s.handleListTasks)
	mux.HandleFunc("POST /v1/tasks", s.handleCreateTask)
	mux.HandleFunc("GET /v1/tasks/{id}", s.handleGetTask)
	mux.HandleFunc("PUT /v1/tasks/{id}", s.handleUpdateTask)
	mux.HandleFunc("DELETE /v1/tasks/{id}", s.handleDeleteTask)
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
	mux.HandleFunc("POST /v1/admin/tasks/{id}/unhide", s.handleUnhide)
	mux.HandleFunc("GET /v1/admin/users", s.handleAdminUsers)
	mux.HandleFunc("POST /v1/admin/users/{id}/suspend", s.handleSuspendUser)
	mux.HandleFunc("POST /v1/admin/users/{id}/activate", s.handleActivateUser)
	mux.HandleFunc("GET /v1/admin/logs", s.handleAdminLogs)
	mux.HandleFunc("GET /v1/admin/disputes", s.handleAdminDisputes)
	mux.HandleFunc("POST /v1/demo/reset", s.handleReset)
	mux.HandleFunc("POST /v1/auth/register", s.handleRegister)
	mux.HandleFunc("POST /v1/auth/identity", s.handleStartIdentity)
	mux.HandleFunc("POST /v1/auth/identity/{id}/files", s.handleIdentityFile)
	mux.HandleFunc("POST /v1/auth/identity/{id}/complete", s.handleCompleteIdentity)
	mux.HandleFunc("POST /v1/auth/login", s.handleLogin)
	mux.HandleFunc("POST /v1/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /v1/me", s.handleMe)
	mux.HandleFunc("PUT /v1/me/phone", s.handlePhone)
	mux.HandleFunc("POST /v1/tasks/{id}/conversations", s.handleStartConversation)
	mux.HandleFunc("GET /v1/me/conversations", s.handleConversations)
	mux.HandleFunc("GET /v1/conversations/{id}/messages", s.handleMessages)
	mux.HandleFunc("POST /v1/conversations/{id}/messages", s.handleSendMessage)
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
	s.adminExtraRoutes(mux)
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
	sector := strings.TrimSpace(r.URL.Query().Get("sector"))
	if category != "" && !knownCategory(category) {
		writeAppError(w, invalidInput(msgCategory))
		return
	}
	if utf8.RuneCountInString(sector) > 40 {
		writeAppError(w, invalidInput(msgSector))
		return
	}
	near, ae := parseNear(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	tasks, err := s.store.ListOpen(category, city, sector, near)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Tasks []TaskPublic `json:"tasks"`
	}{Tasks: tasksOrEmpty(redactTasks(tasks, s.optionalViewerID(r)))})
}

func parseNear(r *http.Request) (*nearQuery, *AppError) {
	latSet, lat, latBad := parseQueryFloat(r.URL.Query().Get("lat"))
	lngSet, lng, lngBad := parseQueryFloat(r.URL.Query().Get("lng"))
	radiusSet, radius, radiusBad := parseQueryFloat(r.URL.Query().Get("radius_km"))
	if latBad || lngBad || radiusBad {
		return nil, invalidInput(msgNear)
	}
	if !latSet && !lngSet && !radiusSet {
		return nil, nil
	}
	if !latSet || !lngSet || !radiusSet {
		return nil, invalidInput(msgNear)
	}
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return nil, invalidInput(msgCoords)
	}
	if radius <= 0 || radius > 100 {
		return nil, invalidInput(msgRadius)
	}
	return &nearQuery{Lat: lat, Lng: lng, RadiusKm: radius}, nil
}

func parseQueryFloat(raw string) (bool, float64, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false, 0, false
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return false, 0, true
	}
	return true, value, false
}

func (s *Server) handleGetTask(w http.ResponseWriter, r *http.Request) {
	task, err := s.store.PublicTask(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Task TaskPublic `json:"task"`
	}{Task: redactTask(task, s.optionalViewerID(r))})
}

func (s *Server) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requirePublisher(user); ae != nil {
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
	if ae = requireMember(user); ae != nil {
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
	if ae = requireMember(user); ae != nil {
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
	if ae = requireMember(user); ae != nil {
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
	for i := range apps {
		apps[i].Task = redactTask(apps[i].Task, user.ID)
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
	if ae = requirePublisher(user); ae != nil {
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
	if ae = requirePublisher(user); ae != nil {
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
	s.audit(user.ID, "task_hide", task.ID, task.Title)
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
	if os.Getenv("NOVA_DEMO") != "1" {
		writeAppError(w, errNotFound)
		return
	}
	if err := s.store.Reset(); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}
