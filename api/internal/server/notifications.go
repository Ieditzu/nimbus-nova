package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
)

const expoPushURL = "https://exp.host/--/api/v2/push/send"

func (s *Server) notifyUser(userID, kind, taskID string) error {
	if err := s.store.Notify(userID, kind, taskID); err != nil {
		return err
	}
	titles := map[string]string{
		"application_received": "Candidatură nouă",
		"application_accepted": "Candidatura ta a fost acceptată",
		"application_rejected": "Jobul a fost atribuit",
		"task_completed":       "Job finalizat",
		"task_cancelled":       "Job anulat",
		"job_deleted":          "Anunț șters",
		"dispute_opened":       "Dispută deschisă",
	}
	bodies := map[string]string{
		"application_received": "Ai primit o candidatură nouă. Deschide anunțul ca să o vezi.",
		"application_accepted": "Ai fost ales pentru acest job. Deschide anunțul pentru detalii.",
		"application_rejected": "Autorul a ales o altă persoană pentru acest job.",
		"task_completed":       "Autorul a marcat jobul ca finalizat.",
		"task_cancelled":       "Autorul a anulat jobul la care participai.",
		"job_deleted":          "Anunțul pentru care ai aplicat a fost șters.",
		"dispute_opened":       "A fost deschisă o dispută legată de acest job.",
	}
	title, ok := titles[kind]
	if !ok {
		return nil
	}
	screen := "task"
	if kind == "application_received" {
		screen = "job_applications"
	}
	go s.pushUser(userID, title, bodies[kind], map[string]string{"task_id": taskID, "screen": screen})
	return nil
}

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
);
CREATE TABLE IF NOT EXISTS web_push_devices (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,endpoint)
);
CREATE TABLE IF NOT EXISTS web_push_vapid_keys (
 id INTEGER PRIMARY KEY CHECK (id=1),
 public_key TEXT NOT NULL,
 private_key TEXT NOT NULL
);`)
	if err != nil {
		return err
	}
	_, _, err = s.webPushKeys()
	return err
}

type webPushSubscription struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

func (s *Server) handleWebPushConfig(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireMember(u); ae != nil {
		writeAppError(w, ae)
		return
	}
	publicKey, _, err := s.store.webPushKeys()
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "public_key": publicKey})
}

func (s *Server) handleRegisterWebPushSubscription(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireMember(u); ae != nil {
		writeAppError(w, ae)
		return
	}
	var body webPushSubscription
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if len(body.Endpoint) > 4096 || !validWebPushEndpoint(body.Endpoint) || !validWebPushKey(body.Keys.P256dh, 65) || !validWebPushKey(body.Keys.Auth, 16) {
		writeAppError(w, invalidInput("Abonamentul de notificări web nu este valid."))
		return
	}
	now := NowRFC3339()
	_, err := s.store.db.Exec(`INSERT INTO web_push_devices(user_id,endpoint,p256dh,auth,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=excluded.updated_at`, u.ID, body.Endpoint, body.Keys.P256dh, body.Keys.Auth, now, now)
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleDeleteWebPushSubscription(w http.ResponseWriter, r *http.Request) {
	u, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	_, err := s.store.db.Exec(`DELETE FROM web_push_devices WHERE user_id=? AND endpoint=?`, u.ID, body.Endpoint)
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

// A delivery probe is deliberately limited to a subscription owned by the caller.
// A provider acceptance means the push service queued it, not that the OS displayed it.
func (s *Server) handleWebPushTest(w http.ResponseWriter, r *http.Request) {
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
		Endpoint string `json:"endpoint"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	var device webPushTarget
	err := s.store.db.QueryRow(`SELECT endpoint,p256dh,auth FROM web_push_devices WHERE user_id=? AND endpoint=?`, u.ID, body.Endpoint).Scan(&device.endpoint, &device.p256dh, &device.auth)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusOK, map[string]any{"accepted": false, "reason": "subscription_missing"})
		return
	}
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	publicKey, privateKey, err := s.store.webPushKeys()
	if err != nil {
		s.writeErr(w, errInternal)
		return
	}
	status, err := s.sendWebPush(device, publicKey, privateKey, "Test notificări Nova", "Dacă vezi acest mesaj, notificările push funcționează pe acest dispozitiv.", nil)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"accepted": false, "reason": "connection_failed"})
		return
	}
	if status == http.StatusGone || status == http.StatusNotFound {
		_, _ = s.store.db.Exec(`DELETE FROM web_push_devices WHERE endpoint=?`, device.endpoint)
	}
	writeJSON(w, http.StatusOK, map[string]any{"accepted": status >= 200 && status < 300, "reason": "provider_response", "provider_status": status})
}

func validWebPushKey(value string, wantLength int) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == wantLength
}

func validWebPushEndpoint(raw string) bool {
	endpoint, err := url.Parse(raw)
	if err != nil || endpoint.Scheme != "https" || endpoint.User != nil || endpoint.Hostname() == "" {
		return false
	}
	if port := endpoint.Port(); port != "" && port != "443" {
		return false
	}
	host := strings.ToLower(endpoint.Hostname())
	return host == "fcm.googleapis.com" || strings.HasSuffix(host, ".push.apple.com") || strings.HasSuffix(host, ".push.services.mozilla.com")
}

func (s *Store) webPushKeys() (string, string, error) {
	var publicKey, privateKey string
	err := s.db.QueryRow(`SELECT public_key,private_key FROM web_push_vapid_keys WHERE id=1`).Scan(&publicKey, &privateKey)
	if err == nil {
		return publicKey, privateKey, nil
	}
	if err != sql.ErrNoRows {
		return "", "", err
	}
	privateKey, publicKey, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", err
	}
	if _, err = s.db.Exec(`INSERT OR IGNORE INTO web_push_vapid_keys(id,public_key,private_key) VALUES(1,?,?)`, publicKey, privateKey); err != nil {
		return "", "", err
	}
	err = s.db.QueryRow(`SELECT public_key,private_key FROM web_push_vapid_keys WHERE id=1`).Scan(&publicKey, &privateKey)
	return publicKey, privateKey, err
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
	go s.pushWebUser(userID, title, body, data)
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

type webPushTarget struct{ endpoint, p256dh, auth string }

func (s *Server) sendWebPush(device webPushTarget, publicKey, privateKey, title, body string, data map[string]string) (int, error) {
	payload, err := json.Marshal(map[string]any{"title": title, "body": body, "data": data})
	if err != nil {
		return 0, err
	}
	subscription := &webpush.Subscription{Endpoint: device.endpoint, Keys: webpush.Keys{P256dh: device.p256dh, Auth: device.auth}}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	resp, err := webpush.SendNotificationWithContext(ctx, payload, subscription, &webpush.Options{
		HTTPClient: &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }},
		Subscriber: "support@nimbusnova.cc", VAPIDPublicKey: publicKey, VAPIDPrivateKey: privateKey, TTL: 86400, Urgency: webpush.UrgencyNormal,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

func (s *Server) pushWebUser(userID, title, body string, data map[string]string) {
	publicKey, privateKey, err := s.store.webPushKeys()
	if err != nil {
		return
	}
	rows, err := s.store.db.Query(`SELECT endpoint,p256dh,auth FROM web_push_devices WHERE user_id=?`, userID)
	if err != nil {
		return
	}
	devices := []webPushTarget{}
	for rows.Next() {
		var device webPushTarget
		if rows.Scan(&device.endpoint, &device.p256dh, &device.auth) == nil {
			devices = append(devices, device)
		}
	}
	rows.Close()
	if len(devices) == 0 {
		return
	}
	for _, device := range devices {
		status, sendErr := s.sendWebPush(device, publicKey, privateKey, title, body, data)
		if sendErr != nil {
			log.Printf("web push request failed host=%q", endpointHost(device.endpoint))
			continue
		}
		if status < http.StatusOK || status >= http.StatusMultipleChoices {
			log.Printf("web push provider responded status=%d host=%q", status, endpointHost(device.endpoint))
		}
		if status == http.StatusGone || status == http.StatusNotFound {
			_, _ = s.store.db.Exec(`DELETE FROM web_push_devices WHERE endpoint=?`, device.endpoint)
		}
	}
}

func endpointHost(raw string) string {
	endpoint, err := url.Parse(raw)
	if err != nil {
		return "invalid"
	}
	return endpoint.Hostname()
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
