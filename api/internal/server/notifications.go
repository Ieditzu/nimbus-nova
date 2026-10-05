package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

const expoPushURL = "https://exp.host/--/api/v2/push/send"

func (s *Store) ensureNotificationTables() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS push_devices (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,token)
);
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 daily_nearby_enabled INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS daily_notification_runs (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 digest_date TEXT NOT NULL,
 PRIMARY KEY(user_id,digest_date)
);`)
	return err
}

func (s *Server) handleRegisterPushToken(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireMember(u); ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Token string `json:"expo_push_token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	token := strings.TrimSpace(body.Token)
	if len(token) > 512 || !(strings.HasPrefix(token, "ExponentPushToken[") || strings.HasPrefix(token, "ExpoPushToken[")) || !strings.HasSuffix(token, "]") {
		writeAppError(w, invalidInput("Tokenul de notificări nu este valid."))
		return
	}
	now := NowRFC3339()
	_, err := s.store.db.Exec(`INSERT INTO push_devices(user_id,token,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,updated_at=excluded.updated_at`, u.ID, token, now, now)
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeletePushToken(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Token string `json:"expo_push_token"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	_, err := s.store.db.Exec(`DELETE FROM push_devices WHERE user_id=? AND token=?`, u.ID, strings.TrimSpace(body.Token))
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleGetNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var enabled int
	err := s.store.db.QueryRow(`SELECT daily_nearby_enabled FROM notification_preferences WHERE user_id=?`, u.ID).Scan(&enabled)
	if err != nil && err != sql.ErrNoRows {
		s.writeErr(w, errInternal)
		return
	}
	var city string
	_ = s.store.db.QueryRow(`SELECT city FROM profiles WHERE user_id=?`, u.ID).Scan(&city)
	writeJSON(w, http.StatusOK, map[string]any{"daily_nearby_enabled": enabled == 1, "city": city})
}

func (s *Server) handlePutNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Enabled bool `json:"daily_nearby_enabled"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	var city string
	_ = s.store.db.QueryRow(`SELECT city FROM profiles WHERE user_id=?`, u.ID).Scan(&city)
	if body.Enabled && strings.TrimSpace(city) == "" {
		writeAppError(w, invalidInput("Adaugă orașul în profil ca să primești joburi din apropiere."))
		return
	}
	flag := 0
	if body.Enabled {
		flag = 1
	}
	_, err := s.store.db.Exec(`INSERT INTO notification_preferences(user_id,daily_nearby_enabled,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET daily_nearby_enabled=excluded.daily_nearby_enabled,updated_at=excluded.updated_at`, u.ID, flag, NowRFC3339())
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"daily_nearby_enabled": body.Enabled, "city": city})
}

type expoPushMessage struct {
	To        string            `json:"to"`
	Title     string            `json:"title"`
	Body      string            `json:"body"`
	Data      map[string]string `json:"data,omitempty"`
	Sound     string            `json:"sound,omitempty"`
	ChannelID string            `json:"channelId,omitempty"`
}

func (s *Server) pushUser(userID, title, body string, data map[string]string) {
	rows, err := s.store.db.Query(`SELECT token FROM push_devices WHERE user_id=?`, userID)
	if err != nil {
		return
	}
	tokens := []string{}
	for rows.Next() {
		var token string
		if rows.Scan(&token) == nil {
			tokens = append(tokens, token)
		}
	}
	rows.Close()
	if len(tokens) == 0 {
		return
	}
	messages := make([]expoPushMessage, 0, len(tokens))
	for _, token := range tokens {
		messages = append(messages, expoPushMessage{To: token, Title: title, Body: body, Data: data, Sound: "default", ChannelID: "nova"})
	}
	for start := 0; start < len(messages); start += 100 {
		end := start + 100
		if end > len(messages) {
			end = len(messages)
		}
		payload, err := json.Marshal(messages[start:end])
		if err != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, expoPushURL, bytes.NewReader(payload))
		if err == nil {
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")
			req.Header.Set("Accept-Encoding", "gzip, deflate")
			resp, callErr := http.DefaultClient.Do(req)
			if callErr == nil {
				resp.Body.Close()
			}
		}
		cancel()
	}
}

func (s *Server) sendNearbyDigests(ctx context.Context, now time.Time) {
	date := now.In(zoneEEST).Format("2006-01-02")
	users, err := s.store.db.QueryContext(ctx, `SELECT p.user_id,pr.city FROM notification_preferences p JOIN profiles pr ON pr.user_id=p.user_id WHERE p.daily_nearby_enabled=1 AND trim(pr.city)!=''`)
	if err != nil {
		return
	}
	type target struct{ id, city string }
	targets := []target{}
	for users.Next() {
		var item target
		if users.Scan(&item.id, &item.city) == nil {
			targets = append(targets, item)
		}
	}
	users.Close()
	for _, user := range targets {
		var count int
		var taskID string
		err := s.store.db.QueryRowContext(ctx, `SELECT COUNT(*),COALESCE((SELECT id FROM tasks WHERE status='open' AND julianday(created_at)>=julianday(?) AND city=? COLLATE NOCASE AND poster_id!=? ORDER BY julianday(created_at) DESC LIMIT 1),'') FROM tasks WHERE status='open' AND julianday(created_at)>=julianday(?) AND city=? COLLATE NOCASE AND poster_id!=?`, now.Add(-24*time.Hour).UTC().Format(time.RFC3339), user.city, user.id, now.Add(-24*time.Hour).UTC().Format(time.RFC3339), user.city, user.id).Scan(&count, &taskID)
		if err != nil || count == 0 {
			continue
		}
		result, err := s.store.db.ExecContext(ctx, `INSERT OR IGNORE INTO daily_notification_runs(user_id,digest_date) VALUES(?,?)`, user.id, date)
		if err != nil {
			continue
		}
		inserted, _ := result.RowsAffected()
		if inserted == 0 {
			continue
		}
		ntfID, err := NewID("ntf_")
		if err == nil {
			_, _ = s.store.db.ExecContext(ctx, `INSERT INTO notifications(id,user_id,kind,task_id,read_at,created_at) VALUES(?,?,?, ?,NULL,?)`, ntfID, user.id, "nearby_jobs", taskID, now.UTC().Format(time.RFC3339Nano))
		}
		text := ""
		if count == 1 {
			text = "A apărut un job nou în orașul tău."
		} else {
			text = "Au apărut joburi noi în orașul tău."
		}
		s.pushUser(user.id, "Joburi noi în apropiere", text, map[string]string{"task_id": taskID, "screen": "task"})
	}
}
