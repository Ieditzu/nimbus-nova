package server

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"unicode/utf8"
)

const supportMap = `Ești Nova, asistentul de suport. Răspunzi în română, scurt, și indici butoanele reale. Nu inventa plăți, parteneri sau verificări. Nu ceri acte, CNP sau parole. Dacă nu poți rezolva din explicație, setează needs_human true.

Hartă:
- Site, Explorează: câmpul "Caută sarcini sau orașe" și butonul cu steluță "Înțelege". Filtrele sunt sub el.
- Site, Postează / Sarcinile mele: formularul "O sarcină nouă". "Schițează anunțul" și "Verifică siguranța" au steluță. Publicarea e butonul negru "Publică sarcina". Ora o alege omul.
- Site, Suport: acest chat. Un tichet ajunge la birou doar dacă needs_human este true.
- Telefon, Joburi: "Înțelege căutarea" și "Unde cauți?".
- Telefon, Publică un job: "Schițează anunțul" și "Verifică siguranța".
- Telefon, Profil: "Completează profilul", telefon, "Aplicările mele".
- Telefon, o sarcină deschisă: "Schițează" lângă mesajul de aplicare, apoi "Aplică".
- Telefon, Mesaje: conversația despre o sarcină. Telefonul, adresa și numerarul sunt semnalate, dar mesajul tot pleacă.
- Birou, /admin: Oameni, Sarcini, Candidaturi, Dispute, Tichete. "Rezumat" la o dispută nu mută banii. "Cont nou" și "Sarcină nouă" sunt în liste.
Reguli: munca plătită de la 16 ani. Sub 16 ani doar voluntariat, fără plată. Nova își ia 15% din suma propusă și restul ajunge la lucrător. Nu ține banii. Fără numerar, fără domiciliu, fără condus. Identitatea se verifică cu CI sau CEI și un selfie, nu în acest chat.
JSON: {"reply","needs_human","subject"}. subject are cel mult 80 de caractere și se completează doar la primul mesaj.`

func (s *Store) ensureSupport() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS support_tickets (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		subject TEXT NOT NULL,
		status TEXT NOT NULL,
		needs_human INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL,
		updated_at TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS support_messages (
		id TEXT PRIMARY KEY,
		ticket_id TEXT NOT NULL,
		author TEXT NOT NULL,
		text TEXT NOT NULL,
		created_at TEXT NOT NULL
	);
	CREATE INDEX IF NOT EXISTS support_tickets_user ON support_tickets(user_id, updated_at);
	CREATE INDEX IF NOT EXISTS support_messages_ticket ON support_messages(ticket_id, created_at);`)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`ALTER TABLE support_tickets ADD COLUMN guest_key TEXT NOT NULL DEFAULT ''`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return err
	}
	return nil
}

func (s *Server) supportRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/support/tickets", s.handleOpenTicket)
	mux.HandleFunc("GET /v1/support/tickets", s.handleMyTickets)
	mux.HandleFunc("GET /v1/support/tickets/{id}", s.handleTicket)
	mux.HandleFunc("POST /v1/support/tickets/{id}/messages", s.handleTicketMessage)
	mux.HandleFunc("GET /v1/admin/tickets", s.handleAdminTickets)
	mux.HandleFunc("POST /v1/admin/tickets/{id}/reply", s.handleAdminTicketReply)
	mux.HandleFunc("POST /v1/admin/tickets/{id}/close", s.handleAdminTicketClose)
}

type supportReply struct {
	Reply      string `json:"reply"`
	NeedsHuman bool   `json:"needs_human"`
	Subject    string `json:"subject"`
}

func (s *Server) askSupport(r *http.Request, history string) supportReply {
	var out supportReply
	err := askJSON(r.Context(), supportMap, history, false, &out)
	if err != nil || strings.TrimSpace(out.Reply) == "" {
		return supportReply{Reply: "Nu pot răspunde singur la asta. Am lăsat tichetul pentru echipă.", NeedsHuman: true, Subject: "Ajutor"}
	}
	out.Reply = clip(out.Reply, 1200)
	out.Subject = clip(out.Subject, 80)
	if out.Subject == "" {
		out.Subject = "Ajutor"
	}
	return out
}

func (s *Server) supportCaller(r *http.Request) (string, string, bool, *AppError) {
	key := strings.TrimSpace(r.Header.Get("X-Support-Key"))
	if r.Header.Get("Authorization") == "" && strings.TrimSpace(r.Header.Get("X-Demo-Actor")) == "" {
		return "", key, false, nil
	}
	user, ae := s.currentUser(r)
	if ae != nil {
		return "", key, false, ae
	}
	return user.ID, key, user.Role == "admin", nil
}

func (s *Server) handleOpenTicket(w http.ResponseWriter, r *http.Request) {
	userID, _, _, ae := s.supportCaller(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	text, ae := readSupportText(w, r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	reply := s.askSupport(r, "Primul mesaj: "+redactPrivate(text))
	id, key, err := s.store.openTicket(userID, reply.Subject, text, reply.Reply, reply.NeedsHuman)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	detail, err := s.store.ticketDetail(id, userID, key, userID != "")
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if key != "" {
		detail["guest_key"] = key
	}
	writeJSON(w, http.StatusCreated, detail)
}

func (s *Server) handleMyTickets(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.ticketsFor(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tickets": rows})
}

func (s *Server) handleTicket(w http.ResponseWriter, r *http.Request) {
	userID, key, admin, ae := s.supportCaller(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	detail, err := s.store.ticketDetail(r.PathValue("id"), userID, key, admin)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleTicketMessage(w http.ResponseWriter, r *http.Request) {
	userID, key, _, ae := s.supportCaller(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	text, ae := readSupportText(w, r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	ticketID := r.PathValue("id")
	waiting, err := s.store.ticketWaiting(ticketID, userID, key)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	reply := "Am primit mesajul. Echipa îl vede în tichete."
	needs := true
	if !waiting {
		history, err := s.store.ticketHistory(ticketID)
		if err != nil {
			s.writeErr(w, err)
			return
		}
		answer := s.askSupport(r, history+"\nUtilizator: "+redactPrivate(text))
		reply = answer.Reply
		needs = answer.NeedsHuman
	}
	if err := s.store.addTicketMessage(ticketID, userID, key, text, reply, needs, waiting); err != nil {
		s.writeErr(w, err)
		return
	}
	detail, err := s.store.ticketDetail(ticketID, userID, key, false)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleAdminTickets(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	rows, err := s.store.adminTickets()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tickets": rows})
}

func (s *Server) handleAdminTicketReply(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	text, ae := readSupportText(w, r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if err := s.store.adminReply(r.PathValue("id"), admin.ID, text); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "ticket_reply", r.PathValue("id"), clip(text, 80))
	detail, err := s.store.ticketDetail(r.PathValue("id"), admin.ID, "", true)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Server) handleAdminTicketClose(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok || !s.readEmptyObject(w, r) {
		return
	}
	if err := s.store.closeTicket(r.PathValue("id")); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "ticket_close", r.PathValue("id"), "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func readSupportText(w http.ResponseWriter, r *http.Request) (string, *AppError) {
	var body struct {
		Text string `json:"text"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		return "", ae
	}
	text := strings.TrimSpace(body.Text)
	if n := utf8.RuneCountInString(text); n < 2 || n > 2000 {
		return "", invalidInput("Mesajul trebuie să aibă între 2 și 2000 de caractere.")
	}
	return text, nil
}

func newGuestKey() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func (s *Store) openTicket(userID, subject, text, reply string, needs bool) (string, string, error) {
	id, err := NewID("tck_")
	if err != nil {
		return "", "", errInternal
	}
	key := ""
	if userID == "" {
		userID = "guest"
		key, err = newGuestKey()
		if err != nil {
			return "", "", errInternal
		}
	}
	status := "open"
	flag := 0
	if needs {
		status = "waiting"
		flag = 1
	}
	now := NowRFC3339()
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		if _, err := conn.ExecContext(ctx, `INSERT INTO support_tickets (id, user_id, subject, status, needs_human, created_at, updated_at, guest_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, userID, subject, status, flag, now, now, key); err != nil {
			return err
		}
		return insertSupportPair(ctx, conn, id, text, reply, now)
	})
	if err != nil {
		return "", "", errInternal
	}
	return id, key, nil
}

func insertSupportPair(ctx context.Context, conn *sql.Conn, ticketID, userText, reply, now string) error {
	userMsg, err := NewID("stm_")
	if err != nil {
		return err
	}
	botMsg, err := NewID("stm_")
	if err != nil {
		return err
	}
	if _, err = conn.ExecContext(ctx, `INSERT INTO support_messages (id, ticket_id, author, text, created_at) VALUES (?, ?, 'user', ?, ?)`, userMsg, ticketID, userText, now); err != nil {
		return err
	}
	_, err = conn.ExecContext(ctx, `INSERT INTO support_messages (id, ticket_id, author, text, created_at) VALUES (?, ?, 'assistant', ?, ?)`, botMsg, ticketID, reply, now)
	return err
}

func (s *Store) ticketsFor(userID string) ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT id, subject, status, needs_human, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC, id DESC`, userID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	return scanTickets(rows, false)
}

func (s *Store) adminTickets() ([]map[string]any, error) {
	rows, err := s.db.Query(`SELECT t.id, t.subject, t.status, t.needs_human, t.updated_at, t.user_id, COALESCE(u.display_name, '') FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.needs_human DESC, t.updated_at DESC, t.id DESC`)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id, subject, status, updated, userID, name string
		var needs int
		if err := rows.Scan(&id, &subject, &status, &needs, &updated, &userID, &name); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "subject": subject, "status": status, "needs_human": needs == 1, "updated_at": updated, "user_id": userID, "user_name": name})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, rows.Err()
}

func scanTickets(rows *sql.Rows, _ bool) ([]map[string]any, error) {
	var out []map[string]any
	for rows.Next() {
		var id, subject, status, updated string
		var needs int
		if err := rows.Scan(&id, &subject, &status, &needs, &updated); err != nil {
			return nil, errInternal
		}
		out = append(out, map[string]any{"id": id, "subject": subject, "status": status, "needs_human": needs == 1, "updated_at": updated})
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, rows.Err()
}

func ticketAllowed(owner, guestKey, userID, key string, admin bool) bool {
	if admin || (userID != "" && owner == userID) {
		return true
	}
	return guestKey != "" && key != "" && guestKey == key
}

func (s *Store) ticketDetail(id, userID, key string, admin bool) (map[string]any, error) {
	var owner, subject, status, updated, name, guestKey string
	var needs int
	err := s.db.QueryRow(`SELECT t.user_id, t.subject, t.status, t.needs_human, t.updated_at, COALESCE(u.display_name, ''), COALESCE(t.guest_key, '') FROM support_tickets t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?`, id).Scan(&owner, &subject, &status, &needs, &updated, &name, &guestKey)
	if err == sql.ErrNoRows {
		return nil, errNotFound
	}
	if err != nil {
		return nil, errInternal
	}
	if !ticketAllowed(owner, guestKey, userID, key, admin) {
		return nil, errForbidden
	}
	rows, err := s.db.Query(`SELECT id, author, text, created_at FROM support_messages WHERE ticket_id = ? ORDER BY rowid ASC`, id)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	var messages []map[string]any
	for rows.Next() {
		var mid, author, text, created string
		if err := rows.Scan(&mid, &author, &text, &created); err != nil {
			return nil, errInternal
		}
		messages = append(messages, map[string]any{"id": mid, "author": author, "text": text, "created_at": created})
	}
	if messages == nil {
		messages = []map[string]any{}
	}
	return map[string]any{"ticket": map[string]any{"id": id, "user_id": owner, "user_name": name, "subject": subject, "status": status, "needs_human": needs == 1, "updated_at": updated}, "messages": messages}, rows.Err()
}

func (s *Store) ticketWaiting(id, userID, key string) (bool, error) {
	var owner, status, guestKey string
	var needs int
	err := s.db.QueryRow(`SELECT user_id, status, needs_human, COALESCE(guest_key, '') FROM support_tickets WHERE id = ?`, id).Scan(&owner, &status, &needs, &guestKey)
	if err == sql.ErrNoRows {
		return false, errNotFound
	}
	if err != nil {
		return false, errInternal
	}
	if !ticketAllowed(owner, guestKey, userID, key, false) {
		return false, errForbidden
	}
	if status == "closed" {
		return false, appErr(409, "ticket_closed", "Tichetul este închis.")
	}
	return needs == 1 || status == "waiting", nil
}

func (s *Store) ticketHistory(id string) (string, error) {
	rows, err := s.db.Query(`SELECT author, text FROM support_messages WHERE ticket_id = ? ORDER BY rowid ASC`, id)
	if err != nil {
		return "", errInternal
	}
	defer rows.Close()
	var b strings.Builder
	for rows.Next() {
		var author, text string
		if err := rows.Scan(&author, &text); err != nil {
			return "", errInternal
		}
		b.WriteString(author)
		b.WriteString(": ")
		b.WriteString(redactPrivate(text))
		b.WriteByte('\n')
	}
	return b.String(), rows.Err()
}

func (s *Store) addTicketMessage(id, userID, key, text, reply string, needs, alreadyWaiting bool) error {
	now := NowRFC3339()
	status := "open"
	flag := 0
	if needs || alreadyWaiting {
		status = "waiting"
		flag = 1
	}
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var owner, guestKey string
		err := conn.QueryRowContext(ctx, `SELECT user_id, COALESCE(guest_key, '') FROM support_tickets WHERE id = ?`, id).Scan(&owner, &guestKey)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if !ticketAllowed(owner, guestKey, userID, key, false) {
			return errForbidden
		}
		if _, err = conn.ExecContext(ctx, `UPDATE support_tickets SET status = ?, needs_human = ?, updated_at = ? WHERE id = ?`, status, flag, now, id); err != nil {
			return err
		}
		if alreadyWaiting {
			msg, err := NewID("stm_")
			if err != nil {
				return err
			}
			_, err = conn.ExecContext(ctx, `INSERT INTO support_messages (id, ticket_id, author, text, created_at) VALUES (?, ?, 'user', ?, ?)`, msg, id, text, now)
			return err
		}
		return insertSupportPair(ctx, conn, id, text, reply, now)
	})
}

func (s *Store) adminReply(id, adminID, text string) error {
	now := NowRFC3339()
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		res, err := conn.ExecContext(ctx, `UPDATE support_tickets SET status = 'open', needs_human = 0, updated_at = ? WHERE id = ? AND status != 'closed'`, now, id)
		if err != nil {
			return errInternal
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			return errNotFound
		}
		msg, err := NewID("stm_")
		if err != nil {
			return err
		}
		_, err = conn.ExecContext(ctx, `INSERT INTO support_messages (id, ticket_id, author, text, created_at) VALUES (?, ?, 'admin', ?, ?)`, msg, id, text, now)
		_ = adminID
		return err
	})
}

func (s *Store) closeTicket(id string) error {
	res, err := s.db.Exec(`UPDATE support_tickets SET status = 'closed', needs_human = 0, updated_at = ? WHERE id = ? AND status != 'closed'`, NowRFC3339(), id)
	if err != nil {
		return errInternal
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errNotFound
	}
	return nil
}
