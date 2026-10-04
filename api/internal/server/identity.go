package server

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/http"
	"strings"
	"time"
	"unicode"
)

const identityTTL = 15 * time.Minute

var identityRequired = map[string][]string{
	"ci":  {"ci_front", "selfie"},
	"cei": {"cei_front", "cei_back", "cei_pdf", "selfie"},
}

var identityOptional = map[string][]string{
	"ci":  {"ci_back", "ci_scan_text", "selfie_video"},
	"cei": {"selfie_video"},
}

func (s *Server) handleStartIdentity(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	var body struct {
		Email string `json:"email"`
		Kind  string `json:"kind"`
	}
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	view, err := s.store.StartIdentity(body.Email, body.Kind)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"verification": view})
}

func (s *Server) handleIdentityFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 11_000_000)
	var body struct {
		Slot        string `json:"slot"`
		ContentType string `json:"content_type"`
		ContentB64  string `json:"content_base64"`
	}
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	file, err := s.store.AddIdentityFile(r.PathValue("id"), body.Slot, body.ContentType, body.ContentB64)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"file": file})
}

func (s *Server) handleCompleteIdentity(w http.ResponseWriter, r *http.Request) {
	if !s.readEmptyObject(w, r) {
		return
	}
	view, proof, err := s.store.CompleteIdentity(r.PathValue("id"))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"verification": view, "proof": proof})
}

func (s *Store) StartIdentity(email, kind string) (map[string]any, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	kind = strings.TrimSpace(kind)
	if !strings.Contains(email, "@") || len(email) > 200 {
		return nil, invalidInput("Emailul nu este valid.")
	}
	if kind != "ci" && kind != "cei" {
		return nil, invalidInput("Tipul trebuie să fie ci sau cei.")
	}
	if err := s.identity.ready(context.Background()); err != nil {
		return nil, err
	}
	if err := s.pruneIdentityFiles(); err != nil {
		return nil, errInternal
	}
	var recent int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM identity_sessions WHERE email=? AND created_at>?`, email, time.Now().Add(-time.Hour).In(zoneEEST).Format(time.RFC3339)).Scan(&recent); err != nil {
		return nil, errInternal
	}
	if recent >= 10 {
		return nil, appErr(429, "identity_rate_limit", "Prea multe încercări de verificare. Reîncearcă peste o oră.")
	}
	id, err := NewID("idn_")
	if err != nil {
		return nil, errInternal
	}
	created := time.Now().In(zoneEEST)
	expires := created.Add(identityTTL).Format(time.RFC3339)
	_, err = s.db.Exec(`INSERT INTO identity_sessions (id, email, kind, status, birth_date, proof_hash, expires_at, created_at) VALUES (?, ?, ?, 'collecting', NULL, NULL, ?, ?)`, id, email, kind, expires, created.Format(time.RFC3339))
	if err != nil {
		return nil, errInternal
	}
	checks := map[string]string{"files": "pending", "cnp": "pending", "selfie": "pending", "face_match": "pending", "document": "pending"}
	return identityView(id, email, kind, "collecting", expires, checks), nil
}

func (s *Store) AddIdentityFile(sessionID, slot, contentType, encoded string) (map[string]any, error) {
	session, err := s.identitySession(sessionID)
	if err != nil {
		return nil, err
	}
	if session.expires.Before(time.Now()) {
		return nil, appErr(409, "proof_expired", "Verificarea a expirat.")
	}
	if session.status != "collecting" {
		return nil, appErr(409, "identity_closed", "Verificarea nu mai acceptă fișiere.")
	}
	if !validSlot(session.kind, slot) {
		return nil, invalidInput("Slotul nu este valid pentru acest document.")
	}
	if !validIdentityType(slot, contentType) {
		return nil, invalidInput("Tipul fișierului nu este acceptat pentru acest slot.")
	}
	limit := 2_000_000
	if slot == "selfie_video" {
		limit = 8_000_000
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(encoded))
	if err != nil || len(raw) < 8 || len(raw) > limit {
		return nil, invalidInput("Fișierul nu este un base64 valid sau este prea mare.")
	}
	if !magicOK(slot, raw) {
		return nil, invalidInput("Fișierul nu are formatul așteptat.")
	}
	sum := sha256.Sum256(raw)
	digest := hex.EncodeToString(sum[:])
	id, err := NewID("idf_")
	if err != nil {
		return nil, errInternal
	}
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var collecting int
		if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM identity_sessions WHERE id=? AND status='collecting' AND expires_at>?`, sessionID, time.Now().In(zoneEEST).Format(time.RFC3339)).Scan(&collecting); err != nil {
			return err
		}
		if collecting != 1 {
			return appErr(409, "identity_closed", "Verificarea nu mai acceptă fișiere.")
		}
		_, err = conn.ExecContext(ctx, `INSERT INTO identity_files (id, session_id, slot, content_type, size, sha256, body) VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id, slot) DO UPDATE SET id = excluded.id, content_type = excluded.content_type, size = excluded.size, sha256 = excluded.sha256, body = excluded.body`,
			id, sessionID, slot, contentType, len(raw), digest, raw)
		return err
	})
	if err != nil {
		return nil, errInternal
	}
	return map[string]any{"id": id, "slot": slot, "sha256": digest}, nil
}

func (s *Store) CompleteIdentity(sessionID string) (map[string]any, map[string]any, error) {
	session, err := s.identitySession(sessionID)
	if err != nil {
		return nil, nil, err
	}
	if session.expires.Before(time.Now()) {
		return nil, nil, appErr(409, "proof_expired", "Verificarea a expirat.")
	}
	if session.status != "collecting" {
		return nil, nil, appErr(409, "identity_closed", "Verificarea nu mai acceptă fișiere.")
	}
	if err := s.identity.ready(context.Background()); err != nil {
		return nil, nil, err
	}
	claimed, err := s.db.Exec(`UPDATE identity_sessions SET status='processing' WHERE id=? AND status='collecting'`, sessionID)
	if err != nil {
		return nil, nil, errInternal
	}
	count, _ := claimed.RowsAffected()
	if count != 1 {
		return nil, nil, appErr(409, "identity_closed", "Verificarea nu mai acceptă fișiere.")
	}
	files, err := s.identityBodies(sessionID)
	if err != nil {
		s.closeIdentity(sessionID, "rejected", nil)
		return nil, nil, err
	}
	for _, slot := range identityRequired[session.kind] {
		if _, ok := files[slot]; !ok && !(slot == "selfie" && len(files["selfie_video"]) > 0) {
			s.db.Exec(`UPDATE identity_sessions SET status='collecting' WHERE id=? AND status='processing'`, sessionID)
			return nil, nil, appErr(409, "files_missing", "Lipsesc fișierele necesare pentru verificare.")
		}
	}
	checks := map[string]string{"files": "passed", "cnp": "pending", "selfie": "pending", "face_match": "pending", "document": "pending"}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	scan, err := s.identity.scan(ctx, session.kind, files)
	if err != nil {
		s.closeIdentity(sessionID, "rejected", checks)
		return nil, nil, err
	}
	birth, ae := validateScannedIdentity(ctx, session.kind, files, scan, checks)
	if ae != nil {
		status := "rejected"
		if scan.Decision == "review" {
			status = "review"
		}
		if err := s.closeIdentity(sessionID, status, checks); err != nil {
			return nil, nil, errInternal
		}
		view := identityView(session.id, session.email, session.kind, status, session.expires.Format(time.RFC3339), checks)
		view["message"] = ae.Message
		return view, nil, nil
	}
	if time.Now().After(session.expires) {
		s.closeIdentity(sessionID, "rejected", checks)
		return nil, nil, appErr(409, "proof_expired", "Verificarea a expirat.")
	}
	token, hash, err := newProofToken()
	if err != nil {
		s.closeIdentity(sessionID, "rejected", checks)
		return nil, nil, errInternal
	}
	encoded, _ := json.Marshal(checks)
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		result, err := conn.ExecContext(ctx, `UPDATE identity_sessions SET status='verified',birth_date=?,proof_hash=?,checks_json=?,verified_provider=? WHERE id=? AND status='processing'`, birth.Format("2006-01-02"), hash, string(encoded), verifiedIdentityProvider, sessionID)
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		if count != 1 {
			return errInternal
		}
		_, err = conn.ExecContext(ctx, `DELETE FROM identity_files WHERE session_id=?`, sessionID)
		return err
	})
	if err != nil {
		s.closeIdentity(sessionID, "rejected", checks)
		return nil, nil, errInternal
	}
	return identityView(session.id, session.email, session.kind, "verified", session.expires.Format(time.RFC3339), checks), map[string]any{"token": token, "expires_at": session.expires.Format(time.RFC3339), "email": session.email}, nil
}
func (s *Store) closeIdentity(id, status string, checks map[string]string) error {
	encoded, _ := json.Marshal(checks)
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		_, err := conn.ExecContext(ctx, `UPDATE identity_sessions SET status=?,proof_hash=NULL,checks_json=?,verified_provider='' WHERE id=? AND status='processing'`, status, string(encoded), id)
		if err != nil {
			return err
		}
		_, err = conn.ExecContext(ctx, `DELETE FROM identity_files WHERE session_id=?`, id)
		return err
	})
}
func (s *Store) pruneIdentityFiles() error {
	_, err := s.db.Exec(`DELETE FROM identity_files WHERE session_id IN (SELECT id FROM identity_sessions WHERE expires_at<? OR status NOT IN ('collecting','processing'))`, time.Now().In(zoneEEST).Format(time.RFC3339))
	return err
}

func (s *Store) lookupIdentityProof(email, token string) (string, time.Time, bool, error) {
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	var id, status, birthText, expiresText, checksText string
	err := s.db.QueryRow(`SELECT id, status, COALESCE(birth_date, ''), expires_at,checks_json FROM identity_sessions WHERE email = ? AND proof_hash = ? AND verified_provider = ?`, email, hash, verifiedIdentityProvider).Scan(&id, &status, &birthText, &expiresText, &checksText)
	if err == sql.ErrNoRows {
		return "", time.Time{}, false, appErr(409, "identity_required", "Verifică identitatea înainte de cont.")
	}
	if err != nil {
		return "", time.Time{}, false, errInternal
	}
	expires, err := time.Parse(time.RFC3339, expiresText)
	if err != nil || expires.Before(time.Now()) {
		return "", time.Time{}, false, appErr(409, "proof_expired", "Dovada de identitate a expirat.")
	}
	if status == "consumed" {
		return "", time.Time{}, false, appErr(409, "proof_used", "Dovada de identitate a fost folosită.")
	}
	if status != "verified" {
		return "", time.Time{}, false, appErr(409, "identity_required", "Verifică identitatea înainte de cont.")
	}
	var checks map[string]string
	if json.Unmarshal([]byte(checksText), &checks) != nil {
		return "", time.Time{}, false, errInternal
	}
	for _, check := range []string{"files", "cnp", "selfie", "face_match", "document"} {
		if checks[check] != "passed" {
			return "", time.Time{}, false, appErr(409, "identity_required", "Verifică identitatea înainte de cont.")
		}
	}
	birth, err := time.Parse("2006-01-02", birthText)
	if err != nil {
		return "", time.Time{}, false, errInternal
	}
	volunteer := volunteerOnlyAt(birth, time.Now())
	return id, birth, volunteer, nil
}

func (s *Store) markIdentityConsumed(id string) error {
	res, err := s.db.Exec(`UPDATE identity_sessions SET status = 'consumed' WHERE id = ? AND status = 'verified'`, id)
	if err != nil {
		return errInternal
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return appErr(409, "proof_used", "Dovada de identitate a fost folosită.")
	}
	return nil
}

type identityRow struct {
	id, email, kind, status string
	expires                 time.Time
}

func (s *Store) identitySession(id string) (identityRow, error) {
	var row identityRow
	var expires string
	err := s.db.QueryRow(`SELECT id, email, kind, status, expires_at FROM identity_sessions WHERE id = ?`, id).Scan(&row.id, &row.email, &row.kind, &row.status, &expires)
	if err == sql.ErrNoRows {
		return row, errNotFound
	}
	if err != nil {
		return row, errInternal
	}
	row.expires, err = time.Parse(time.RFC3339, expires)
	if err != nil {
		return row, errInternal
	}
	return row, nil
}

func identityView(id, email, kind, status, expires string, checks map[string]string) map[string]any {
	view := map[string]any{"id": id, "email": email, "kind": kind, "status": status, "expires_at": expires}
	if checks != nil {
		view["checks"] = checks
	}
	return view
}

func (s *Store) identityBodies(sessionID string) (map[string][]byte, error) {
	rows, err := s.db.Query(`SELECT slot, body FROM identity_files WHERE session_id = ?`, sessionID)
	if err != nil {
		return nil, errInternal
	}
	defer rows.Close()
	out := map[string][]byte{}
	for rows.Next() {
		var slot string
		var body []byte
		if err := rows.Scan(&slot, &body); err != nil {
			return nil, errInternal
		}
		out[slot] = body
	}
	return out, rows.Err()
}

func validSlot(kind, slot string) bool {
	for _, item := range identityRequired[kind] {
		if item == slot {
			return true
		}
	}
	for _, item := range identityOptional[kind] {
		if item == slot {
			return true
		}
	}
	return false
}

func validIdentityType(slot, contentType string) bool {
	switch slot {
	case "selfie_video":
		return contentType == "video/mp4" || contentType == "video/webm" || contentType == "video/quicktime"
	case "cei_pdf":
		return contentType == "application/pdf"
	case "ci_scan_text":
		return contentType == "text/plain"
	default:
		return contentType == "image/jpeg" || contentType == "image/png"
	}
}

func magicOK(slot string, raw []byte) bool {
	switch slot {
	case "selfie_video":
		return (len(raw) >= 12 && string(raw[4:8]) == "ftyp") || (len(raw) >= 4 && bytes.Equal(raw[:4], []byte{0x1a, 0x45, 0xdf, 0xa3}))
	case "cei_pdf":
		return strings.HasPrefix(string(raw), "%PDF")
	case "ci_scan_text":
		return len(strings.TrimSpace(string(raw))) >= 13
	default:
		config, format, err := image.DecodeConfig(bytes.NewReader(raw))
		return err == nil && (format == "jpeg" || format == "png") && config.Width > 0 && config.Height > 0 && config.Width <= 12000 && config.Height <= 12000 && config.Width*config.Height <= 40_000_000
	}
}

func newProofToken() (string, string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	token := hex.EncodeToString(buf)
	sum := sha256.Sum256([]byte(token))
	return token, hex.EncodeToString(sum[:]), nil
}

func firstValidCNP(raw []byte) (time.Time, bool) {
	digits := make([]rune, 0, 16)
	try := func() (time.Time, bool) {
		if len(digits) < 13 {
			digits = digits[:0]
			return time.Time{}, false
		}
		for i := 0; i+13 <= len(digits); i++ {
			if birth, ok := parseCNP(string(digits[i : i+13])); ok {
				return birth, true
			}
		}
		digits = digits[:0]
		return time.Time{}, false
	}
	for _, r := range string(raw) {
		if unicode.IsDigit(r) {
			digits = append(digits, r)
			continue
		}
		if birth, ok := try(); ok {
			return birth, true
		}
	}
	return try()
}

func parseCNP(raw string) (time.Time, bool) {
	if len(raw) != 13 {
		return time.Time{}, false
	}
	weights := []int{2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9}
	sum := 0
	for i := 0; i < 12; i++ {
		if raw[i] < '0' || raw[i] > '9' {
			return time.Time{}, false
		}
		sum += int(raw[i]-'0') * weights[i]
	}
	control := sum % 11
	if control == 10 {
		control = 1
	}
	if raw[12] < '0' || raw[12] > '9' || int(raw[12]-'0') != control {
		return time.Time{}, false
	}
	year := 10*int(raw[1]-'0') + int(raw[2]-'0')
	switch raw[0] {
	case '1', '2':
		year += 1900
	case '3', '4':
		year += 1800
	case '5', '6', '7', '8':
		year += 2000
	default:
		return time.Time{}, false
	}
	month := time.Month(10*int(raw[3]-'0') + int(raw[4]-'0'))
	day := 10*int(raw[5]-'0') + int(raw[6]-'0')
	birth := time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	if birth.Year() != year || birth.Month() != month || birth.Day() != day {
		return time.Time{}, false
	}
	return birth, true
}
