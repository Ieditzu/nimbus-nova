package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var stripeClient = &http.Client{Timeout: 12 * time.Second}

func SetStripeClientForTest(client *http.Client) func() {
	previous := stripeClient
	if client == nil {
		client = &http.Client{Timeout: 12 * time.Second}
	}
	stripeClient = client
	return func() { stripeClient = previous }
}

func (s *Store) ensureStripe() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS stripe_config (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		secret_key TEXT NOT NULL DEFAULT '',
		publishable_key TEXT NOT NULL DEFAULT '',
		webhook_secret TEXT NOT NULL DEFAULT '',
		enabled INTEGER NOT NULL DEFAULT 0
	)`)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(`INSERT OR IGNORE INTO stripe_config (id) VALUES (1)`)
	_, err = s.db.Exec(`ALTER TABLE payment_intents ADD COLUMN stripe_session TEXT NOT NULL DEFAULT ''`)
	if err != nil && !strings.Contains(strings.ToLower(err.Error()), "duplicate column") {
		return err
	}
	return nil
}

type stripePublic struct {
	Mode           string `json:"mode"`
	Enabled        bool   `json:"enabled"`
	SecretSet      bool   `json:"secret_set"`
	PublishableSet bool   `json:"publishable_set"`
	WebhookSet     bool   `json:"webhook_set"`
	PublishableKey string `json:"publishable_key"`
	SecretHint     string `json:"secret_hint"`
}

func stripeMode(secret string, enabled bool) string {
	if !enabled || strings.TrimSpace(secret) == "" {
		return "simulated"
	}
	if strings.HasPrefix(secret, "sk_live_") {
		return "stripe_live"
	}
	return "stripe_test"
}

func maskSecret(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if len(value) <= 8 {
		return "••••"
	}
	return value[:7] + "…" + value[len(value)-4:]
}

func (s *Store) stripeConfig() (secret, publishable, webhook string, enabled bool, err error) {
	var flag int
	err = s.db.QueryRow(`SELECT secret_key, publishable_key, webhook_secret, enabled FROM stripe_config WHERE id = 1`).Scan(&secret, &publishable, &webhook, &flag)
	if err == sql.ErrNoRows {
		return "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", false, errInternal
	}
	return secret, publishable, webhook, flag == 1 && strings.TrimSpace(secret) != "", nil
}

func (s *Store) stripePublic() (stripePublic, error) {
	secret, publishable, webhook, enabled, err := s.stripeConfig()
	if err != nil {
		return stripePublic{}, err
	}
	return stripePublic{
		Mode: stripeMode(secret, enabled), Enabled: enabled,
		SecretSet: secret != "", PublishableSet: publishable != "", WebhookSet: webhook != "",
		PublishableKey: publishable, SecretHint: maskSecret(secret),
	}, nil
}

func (s *Store) stripeReady() bool {
	_, _, _, enabled, err := s.stripeConfig()
	return err == nil && enabled
}

func validStripeKey(value, prefix string) bool {
	value = strings.TrimSpace(value)
	return strings.HasPrefix(value, prefix+"test_") || strings.HasPrefix(value, prefix+"live_")
}

func (s *Server) handleAdminStripe(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	view, err := s.store.stripePublic()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Server) handleAdminStripeSave(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct {
		SecretKey      string `json:"secret_key"`
		PublishableKey string `json:"publishable_key"`
		WebhookSecret  string `json:"webhook_secret"`
		Enabled        bool   `json:"enabled"`
		Clear          bool   `json:"clear"`
	}
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	secret, publishable, webhook, _, err := s.store.stripeConfig()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if body.Clear {
		if err := s.store.saveStripe("", "", "", false); err != nil {
			s.writeErr(w, err)
			return
		}
		s.audit(admin.ID, "stripe_save", "stripe", "cleared")
		view, err := s.store.stripePublic()
		if err != nil {
			s.writeErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, view)
		return
	}
	if strings.TrimSpace(body.SecretKey) != "" {
		if !validStripeKey(body.SecretKey, "sk_") {
			writeAppError(w, invalidInput("Cheia secretă Stripe trebuie să înceapă cu sk_test_ sau sk_live_."))
			return
		}
		secret = strings.TrimSpace(body.SecretKey)
	}
	if strings.TrimSpace(body.PublishableKey) != "" {
		if !validStripeKey(body.PublishableKey, "pk_") {
			writeAppError(w, invalidInput("Cheia publică Stripe trebuie să înceapă cu pk_test_ sau pk_live_."))
			return
		}
		publishable = strings.TrimSpace(body.PublishableKey)
	}
	if strings.TrimSpace(body.WebhookSecret) != "" {
		if !strings.HasPrefix(strings.TrimSpace(body.WebhookSecret), "whsec_") {
			writeAppError(w, invalidInput("Secretul de webhook trebuie să înceapă cu whsec_."))
			return
		}
		webhook = strings.TrimSpace(body.WebhookSecret)
	}
	if body.Enabled && secret == "" {
		writeAppError(w, invalidInput("Lipsește cheia Stripe. Plățile rămân simulate."))
		return
	}
	if err := s.store.saveStripe(secret, publishable, webhook, body.Enabled && secret != ""); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "stripe_save", "stripe", stripeMode(secret, body.Enabled && secret != ""))
	view, err := s.store.stripePublic()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, view)
}

func (s *Store) saveStripe(secret, publishable, webhook string, enabled bool) error {
	flag := 0
	if enabled {
		flag = 1
	}
	_, err := s.db.Exec(`INSERT INTO stripe_config (id, secret_key, publishable_key, webhook_secret, enabled) VALUES (1, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET secret_key = excluded.secret_key, publishable_key = excluded.publishable_key, webhook_secret = excluded.webhook_secret, enabled = excluded.enabled`, secret, publishable, webhook, flag)
	if err != nil {
		return errInternal
	}
	return nil
}

func (s *Server) beginStripePay(r *http.Request, taskID, posterID string) (paymentView, error) {
	var owner, status, kind, title string
	var amount int64
	err := s.store.db.QueryRow(`SELECT poster_id, status, kind, amount_bani, title FROM tasks WHERE id = ?`, taskID).Scan(&owner, &status, &kind, &amount, &title)
	if err == sql.ErrNoRows {
		return paymentView{}, errNotFound
	}
	if err != nil {
		return paymentView{}, errInternal
	}
	if owner != posterID {
		return paymentView{}, errForbidden
	}
	if kind == "volunteer" || amount <= 0 {
		return paymentView{}, errVolunteerUnpaid
	}
	if status != "assigned" {
		return paymentView{}, errTaskNotAssigned
	}
	var intentID, intentStatus string
	err = s.store.db.QueryRow(`SELECT id, status FROM payment_intents WHERE task_id = ?`, taskID).Scan(&intentID, &intentStatus)
	if err == nil && intentStatus == "held" {
		return paymentView{}, errAlreadyPaid
	}
	if err != nil && err != sql.ErrNoRows {
		return paymentView{}, errInternal
	}
	if intentID == "" {
		intentID, err = NewID("pay_")
		if err != nil {
			return paymentView{}, errInternal
		}
	}
	secret, _, _, _, err := s.store.stripeConfig()
	if err != nil || secret == "" {
		return paymentView{}, errInternal
	}
	sessionID, checkoutURL, err := createStripeCheckout(r, secret, taskID, intentID, title, amount)
	if err != nil {
		return paymentView{}, err
	}
	fee := platformFee(amount)
	if intentStatus == "" {
		_, err = s.store.db.Exec(`INSERT INTO payment_intents (id, task_id, provider, status, amount_bani, stripe_session) VALUES (?, ?, 'stripe', 'requires_payment', ?, ?)`, intentID, taskID, amount, sessionID)
	} else {
		_, err = s.store.db.Exec(`UPDATE payment_intents SET provider = 'stripe', status = 'requires_payment', stripe_session = ? WHERE id = ?`, sessionID, intentID)
	}
	if err != nil {
		return paymentView{}, errInternal
	}
	return paymentView{
		TaskID: taskID, PayStatus: "requires_payment", AmountBani: amount,
		PlatformFeeBani: fee, WorkerPayoutBani: amount - fee, Provider: "stripe", CheckoutURL: checkoutURL,
	}, nil
}

func createStripeCheckout(r *http.Request, secret, taskID, paymentID, title string, amount int64) (string, string, error) {
	origin := "https://nimbusnova.cc"
	if AllowedOrigin(r.Header.Get("Origin")) {
		origin = r.Header.Get("Origin")
	}
	form := url.Values{}
	form.Set("mode", "payment")
	form.Set("success_url", origin+"/poster?stripe=success")
	form.Set("cancel_url", origin+"/poster?stripe=cancel")
	form.Set("client_reference_id", paymentID)
	form.Set("metadata[task_id]", taskID)
	form.Set("metadata[payment_id]", paymentID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("line_items[0][price_data][currency]", "ron")
	form.Set("line_items[0][price_data][unit_amount]", strconv.FormatInt(amount, 10))
	form.Set("line_items[0][price_data][product_data][name]", clip(title, 80))
	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", errInternal
	}
	req.SetBasicAuth(secret, "")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := stripeClient.Do(req)
	if err != nil {
		return "", "", appErr(503, "stripe_unavailable", "Stripe nu a răspuns. Plata simulată nu a fost folosită.")
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return "", "", appErr(503, "stripe_unavailable", "Stripe nu a acceptat sesiunea. Plata simulată nu a fost folosită.")
	}
	var parsed struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil || parsed.URL == "" {
		return "", "", appErr(503, "stripe_unavailable", "Stripe nu a întors o pagină de plată.")
	}
	return parsed.ID, parsed.URL, nil
}

func (s *Server) handleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	secret, _, webhook, enabled, err := s.store.stripeConfig()
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if !enabled || secret == "" || webhook == "" {
		writeAppError(w, appErr(404, "stripe_off", "Stripe nu este pornit. Plățile rămân simulate."))
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeAppError(w, invalidInput("Corp invalid."))
		return
	}
	if !stripeSignatureOK(webhook, r.Header.Get("Stripe-Signature"), body, time.Now()) {
		writeAppError(w, appErr(400, "bad_signature", "Semnătura Stripe nu este validă."))
		return
	}
	var event struct {
		Type string `json:"type"`
		Data struct {
			Object struct {
				Metadata map[string]string `json:"metadata"`
			} `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		writeAppError(w, invalidInput("Eveniment invalid."))
		return
	}
	if event.Type == "checkout.session.completed" {
		if err := s.store.holdStripePayment(event.Data.Object.Metadata["task_id"], event.Data.Object.Metadata["payment_id"]); err != nil {
			s.writeErr(w, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func stripeSignatureOK(secret, header string, body []byte, now time.Time) bool {
	var timestamp string
	var signatures []string
	for _, part := range strings.Split(header, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		if key == "t" {
			timestamp = value
		}
		if key == "v1" {
			signatures = append(signatures, value)
		}
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || timestamp == "" || len(signatures) == 0 {
		return false
	}
	if delta := now.Unix() - seconds; delta > 300 || delta < -300 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "." + string(body)))
	expected := hex.EncodeToString(mac.Sum(nil))
	for _, signature := range signatures {
		if hmac.Equal([]byte(expected), []byte(signature)) {
			return true
		}
	}
	return false
}

func (s *Store) holdStripePayment(taskID, paymentID string) error {
	if taskID == "" || paymentID == "" {
		return invalidInput("Evenimentul nu are sarcina.")
	}
	var amount int64
	var status string
	err := s.db.QueryRow(`SELECT amount_bani, status FROM payment_intents WHERE id = ? AND task_id = ?`, paymentID, taskID).Scan(&amount, &status)
	if err == sql.ErrNoRows {
		return errNotFound
	}
	if err != nil {
		return errInternal
	}
	if status == "held" {
		return nil
	}
	if _, err := s.db.Exec(`UPDATE payment_intents SET status = 'held', provider = 'stripe' WHERE id = ?`, paymentID); err != nil {
		return errInternal
	}
	if _, err := s.db.Exec(`UPDATE tasks SET pay_status = 'held' WHERE id = ?`, taskID); err != nil {
		return errInternal
	}
	now := NowRFC3339()
	for _, row := range []struct {
		account, direction string
	}{{"poster", "debit"}, {"escrow", "credit"}} {
		id, err := NewID("led_")
		if err != nil {
			return errInternal
		}
		if _, err := s.db.Exec(`INSERT INTO ledger_entries (id, task_id, account, direction, amount_bani, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, taskID, row.account, row.direction, amount, now); err != nil {
			return errInternal
		}
	}
	return nil
}

func stripeSign(secret string, body []byte, when time.Time) string {
	timestamp := fmt.Sprintf("%d", when.Unix())
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "." + string(body)))
	return "t=" + timestamp + ",v1=" + hex.EncodeToString(mac.Sum(nil))
}

func StripeSignForTest(secret string, body []byte, when time.Time) string {
	return stripeSign(secret, body, when)
}
