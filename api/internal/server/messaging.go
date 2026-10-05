package server

import (
	"context"
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type ChatMessage struct {
	ID             string `json:"id"`
	Sequence       int64  `json:"sequence"`
	ConversationID string `json:"conversation_id"`
	SenderID       string `json:"sender_id"`
	Text           string `json:"text"`
	CreatedAt      string `json:"created_at"`
}
type ChatParticipant struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	PhoneNumber string `json:"phone_number"`
}
type Conversation struct {
	ID          string          `json:"id"`
	TaskID      string          `json:"task_id"`
	TaskTitle   string          `json:"task_title"`
	OtherUser   ChatParticipant `json:"other_user"`
	LastMessage *ChatMessage    `json:"last_message"`
	UpdatedAt   string          `json:"updated_at"`
}

func (s *Store) ensureChatTables() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS conversations (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id),
 owner_id TEXT NOT NULL REFERENCES users(id), peer_id TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL, CHECK(owner_id != peer_id), UNIQUE(task_id,peer_id)
 );
 CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(owner_id,updated_at);
 CREATE INDEX IF NOT EXISTS conversations_peer ON conversations(peer_id,updated_at);
 CREATE TABLE IF NOT EXISTS chat_messages (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 conversation_id TEXT NOT NULL REFERENCES conversations(id), sender_id TEXT NOT NULL REFERENCES users(id),
 text TEXT NOT NULL, created_at TEXT NOT NULL
 );
 CREATE INDEX IF NOT EXISTS chat_messages_thread ON chat_messages(conversation_id,sequence);`)
	return err
}
func (s *Server) chatUser(r *http.Request) (User, *AppError) {
	// Chat accepts real sessions only; a demo actor header cannot impersonate a member.
	token, ae := bearerToken(r)
	if ae != nil {
		return User{}, ae
	}
	u, err := s.store.UserByToken(token)
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return User{}, ae
		}
		return User{}, errInternal
	}
	if ae = requireMember(*u); ae != nil {
		return User{}, ae
	}
	if u.PhoneNumber == "" {
		return User{}, errPhoneRequired
	}
	return *u, nil
}
func (s *Store) conversationFor(id, userID string) (Conversation, error) {
	var c Conversation
	err := s.db.QueryRow(`SELECT c.id,c.task_id,t.title,u.id,u.display_name,u.phone_number,c.updated_at
 FROM conversations c JOIN tasks t ON t.id=c.task_id
 JOIN users u ON u.id=CASE WHEN c.owner_id=? THEN c.peer_id ELSE c.owner_id END
 WHERE c.id=? AND (c.owner_id=? OR c.peer_id=?)`, userID, id, userID, userID).
		Scan(&c.ID, &c.TaskID, &c.TaskTitle, &c.OtherUser.ID, &c.OtherUser.DisplayName, &c.OtherUser.PhoneNumber, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return c, errNotFound
	}
	if err != nil {
		return c, errInternal
	}
	var m ChatMessage
	err = s.db.QueryRow(`SELECT id,sequence,conversation_id,sender_id,text,created_at FROM chat_messages WHERE conversation_id=? ORDER BY sequence DESC LIMIT 1`, id).
		Scan(&m.ID, &m.Sequence, &m.ConversationID, &m.SenderID, &m.Text, &m.CreatedAt)
	if err == nil {
		c.LastMessage = &m
	} else if err != sql.ErrNoRows {
		return c, errInternal
	}
	return c, nil
}
func (s *Server) handleStartConversation(w http.ResponseWriter, r *http.Request) {
	u, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		ParticipantID string `json:"participant_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae = readJSON(r, &body, true); ae != nil {
		writeAppError(w, ae)
		return
	}
	var id string
	err := s.store.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var owner, status string
		if err := conn.QueryRowContext(ctx, `SELECT poster_id,status FROM tasks WHERE id=?`, r.PathValue("id")).Scan(&owner, &status); err != nil {
			if err == sql.ErrNoRows {
				return errNotFound
			}
			return errInternal
		}
		if status == "hidden" {
			return errNotFound
		}
		peer := u.ID
		if u.ID == owner {
			peer = strings.TrimSpace(body.ParticipantID)
			if peer == "" || peer == owner {
				return invalidInput("Alege persoana cu care vrei să discuți.")
			}
		} else if strings.TrimSpace(body.ParticipantID) != "" {
			return errForbidden
		}
		// A repeated tap opens the same thread, including after the job closes.
		err := conn.QueryRowContext(ctx, `SELECT id FROM conversations WHERE task_id=? AND peer_id=?`, r.PathValue("id"), peer).Scan(&id)
		if err == nil {
			return nil
		}
		if err != sql.ErrNoRows {
			return errInternal
		}
		if status != "open" {
			return errTaskNotOpen
		}
		if u.ID == owner {
			var count int
			if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM applications WHERE task_id=? AND worker_id=?`, r.PathValue("id"), peer).Scan(&count); err != nil {
				return errInternal
			}
			if count == 0 {
				return errForbidden
			}
		}
		var active int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE id IN (?,?) AND status='active' AND role IN ('worker','poster')`, owner, peer).Scan(&active); err != nil {
			return errInternal
		}
		if active != 2 {
			return errForbidden
		}
		newID, err := NewID("chat_")
		if err != nil {
			return errInternal
		}
		id = newID
		_, err = conn.ExecContext(ctx, `INSERT INTO conversations(id,task_id,owner_id,peer_id,updated_at) VALUES(?,?,?,?,?)`, id, r.PathValue("id"), owner, peer, time.Now().UTC().Format(time.RFC3339Nano))
		return err
	})
	if err != nil {
		s.writeErr(w, err)
		return
	}
	c, err := s.store.conversationFor(id, u.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Conversation Conversation `json:"conversation"`
	}{c})
}
func (s *Server) handleConversations(w http.ResponseWriter, r *http.Request) {
	u, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	rows, err := s.store.db.Query(`SELECT id FROM conversations WHERE owner_id=? OR peer_id=? ORDER BY updated_at DESC,id DESC LIMIT 100`, u.ID, u.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			break
		}
		ids = append(ids, id)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	list := []Conversation{}
	for _, id := range ids {
		c, err := s.store.conversationFor(id, u.ID)
		if err != nil {
			s.writeErr(w, err)
			return
		}
		list = append(list, c)
	}
	writeJSON(w, http.StatusOK, struct {
		Conversations []Conversation `json:"conversations"`
	}{list})
}
func (s *Server) handleMessages(w http.ResponseWriter, r *http.Request) {
	u, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	c, err := s.store.conversationFor(r.PathValue("id"), u.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	after := int64(0)
	reverse := r.URL.Query().Get("after") == ""
	bound := int64(9223372036854775807)
	if value := r.URL.Query().Get("after"); value != "" {
		after, err = strconv.ParseInt(value, 10, 64)
		if err != nil || after < 0 {
			writeAppError(w, invalidInput("Cursor invalid."))
			return
		}
	}
	if value := r.URL.Query().Get("before"); value != "" {
		if !reverse {
			writeAppError(w, invalidInput("Folosește un singur cursor."))
			return
		}
		bound, err = strconv.ParseInt(value, 10, 64)
		if err != nil || bound < 1 {
			writeAppError(w, invalidInput("Cursor invalid."))
			return
		}
	}
	query := `SELECT id,sequence,conversation_id,sender_id,text,created_at FROM chat_messages WHERE conversation_id=? AND sequence>? ORDER BY sequence ASC LIMIT 101`
	cursor := after
	if reverse {
		query = `SELECT id,sequence,conversation_id,sender_id,text,created_at FROM chat_messages WHERE conversation_id=? AND sequence<? ORDER BY sequence DESC LIMIT 101`
		cursor = bound
	}
	rows, err := s.store.db.Query(query, c.ID, cursor)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	defer rows.Close()
	messages := []ChatMessage{}
	for rows.Next() {
		var m ChatMessage
		if err = rows.Scan(&m.ID, &m.Sequence, &m.ConversationID, &m.SenderID, &m.Text, &m.CreatedAt); err != nil {
			s.writeErr(w, err)
			return
		}
		messages = append(messages, m)
	}
	if err = rows.Err(); err != nil {
		s.writeErr(w, err)
		return
	}
	more := len(messages) > 100
	if more {
		messages = messages[:100]
	}
	if reverse {
		for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
			messages[i], messages[j] = messages[j], messages[i]
		}
	}
	previous := int64(0)
	if len(messages) > 0 {
		previous = messages[0].Sequence
	}
	next := after
	if len(messages) > 0 {
		next = messages[len(messages)-1].Sequence
	}
	writeJSON(w, http.StatusOK, struct {
		Conversation   Conversation  `json:"conversation"`
		Messages       []ChatMessage `json:"messages"`
		NextCursor     int64         `json:"next_cursor"`
		HasMore        bool          `json:"has_more"`
		PreviousCursor int64         `json:"previous_cursor"`
	}{c, messages, next, more, previous})
}
func (s *Server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	u, ae := s.chatUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	text := strings.TrimSpace(body.Text)
	if n := utf8.RuneCountInString(text); n < 1 || n > 2000 {
		writeAppError(w, invalidInput("Mesajul trebuie să aibă între 1 și 2000 de caractere."))
		return
	}
	id, err := NewID("msg_")
	if err != nil {
		s.writeErr(w, err)
		return
	}
	message := ChatMessage{ID: id, ConversationID: r.PathValue("id"), SenderID: u.ID, Text: text, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
	err = s.store.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var owner, peer, status string
		err := conn.QueryRowContext(ctx, `SELECT c.owner_id,c.peer_id,t.status FROM conversations c JOIN tasks t ON t.id=c.task_id WHERE c.id=? AND (c.owner_id=? OR c.peer_id=?)`, message.ConversationID, u.ID, u.ID).Scan(&owner, &peer, &status)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if status == "hidden" {
			return appErr(409, "conversation_closed", "Nu poți trimite mesaje pentru un anunț ascuns.")
		}
		var active int
		if err = conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE id IN (?,?) AND status='active'`, owner, peer).Scan(&active); err != nil {
			return errInternal
		}
		if active != 2 {
			return errForbidden
		}
		result, err := conn.ExecContext(ctx, `INSERT INTO chat_messages(id,conversation_id,sender_id,text,created_at) VALUES(?,?,?,?,?)`, message.ID, message.ConversationID, message.SenderID, message.Text, message.CreatedAt)
		if err != nil {
			return errInternal
		}
		message.Sequence, err = result.LastInsertId()
		if err != nil {
			return errInternal
		}
		_, err = conn.ExecContext(ctx, `UPDATE conversations SET updated_at=? WHERE id=?`, message.CreatedAt, message.ConversationID)
		return err
	})
	if err != nil {
		s.writeErr(w, err)
		return
	}
	warning := s.flagOutgoing(u.ID, text)
	writeJSON(w, http.StatusCreated, struct {
		Message ChatMessage `json:"message"`
		Warning string      `json:"warning,omitempty"`
	}{message, warning})
}
