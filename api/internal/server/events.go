package server

import "net/http"

type eventView struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	City        string `json:"city"`
	StartsAt    string `json:"starts_at"`
	EndsAt      string `json:"ends_at"`
	Slots       int    `json:"slots"`
	MinAge      int    `json:"min_age"`
	Description string `json:"description"`
}

func (s *Server) handleListEvents(w http.ResponseWriter, r *http.Request) {
	events, err := s.store.ListEvents()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if events == nil {
		events = []eventView{}
	}
	writeJSON(w, http.StatusOK, struct {
		Events []eventView `json:"events"`
	}{Events: events})
}

func (s *Server) handleCreateEvent(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "admin"); ae != nil {
		writeAppError(w, ae)
		return
	}
	var req eventView
	if ae = readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if len([]rune(req.Title)) < 3 || len([]rune(req.City)) < 2 || req.Slots < 1 || req.MinAge < 0 {
		writeAppError(w, invalidInput("Evenimentul nu este valid."))
		return
	}
	created, err := s.store.CreateEvent(user.ID, req)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		Event eventView `json:"event"`
	}{Event: created})
}

func (s *Store) ListEvents() ([]eventView, error) {
	rows, err := s.db.Query(`SELECT id, title, city, starts_at, ends_at, slots, min_age, description FROM events ORDER BY starts_at ASC, id ASC`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := []eventView{}
	for rows.Next() {
		var event eventView
		if err := rows.Scan(&event.ID, &event.Title, &event.City, &event.StartsAt, &event.EndsAt, &event.Slots, &event.MinAge, &event.Description); err != nil {
			return nil, errInternal
		}
		out = append(out, event)
	}
	if err := rows.Err(); err != nil {
		return nil, errInternal
	}
	return out, nil
}

func (s *Store) CreateEvent(organizerID string, req eventView) (eventView, error) {
	id, err := NewID("evt_")
	if err != nil {
		return eventView{}, errInternal
	}
	_, err = s.db.Exec(`INSERT INTO events (id, organizer_id, title, city, starts_at, ends_at, slots, min_age, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, organizerID, req.Title, req.City, req.StartsAt, req.EndsAt, req.Slots, req.MinAge, req.Description)
	if err != nil {
		return eventView{}, errInternal
	}
	req.ID = id
	return req, nil
}
