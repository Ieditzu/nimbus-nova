package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var (
	errInvalidToken       = appErr(401, "invalid_token", "Token invalid.")
	errInvalidCredentials = appErr(401, "invalid_credentials", "Email sau parolă incorectă.")
	errDemoDisabled       = appErr(401, "demo_disabled", "Modul demo este oprit.")
	errVolunteerUnpaid    = appErr(409, "volunteer_unpaid", "Sarcina de voluntariat nu se plătește.")
	errAlreadyPaid        = appErr(409, "already_paid", "Sarcina este deja plătită.")
)

type publicUser struct {
	PhoneNumber   string `json:"phone_number"`
	ID            string `json:"id"`
	Role          string `json:"role"`
	DisplayName   string `json:"display_name"`
	VolunteerOnly bool   `json:"volunteer_only"`
}

type registerRequest struct {
	PhoneNumber   string `json:"phone_number"`
	Role          string `json:"role"`
	Email         string `json:"email"`
	Password      string `json:"password"`
	DisplayName   string `json:"display_name"`
	BirthDate     string `json:"birth_date"`
	GuardianEmail string `json:"guardian_email"`
	IdentityProof string `json:"identity_proof"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if ae := readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	user, ae := s.store.Register(req)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		User publicUser `json:"user"`
	}{User: user})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if ae := readJSON(r, &req, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	token, user, ae := s.store.Login(req.Email, req.Password)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if err := s.store.TouchGameDay(user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Token string     `json:"token"`
		User  publicUser `json:"user"`
	}{Token: token, User: user})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	token, ae := bearerToken(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = s.store.Logout(token); ae != nil {
		writeAppError(w, ae)
		return
	}
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	token, ae := bearerToken(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	user, err := s.store.UserByToken(token)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if err := s.store.TouchGameDay(user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		User publicUser `json:"user"`
	}{User: publicFrom(user)})
}

func bearerToken(r *http.Request) (string, *AppError) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", errInvalidToken
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	if token == "" {
		return "", errInvalidToken
	}
	return token, nil
}

func publicFrom(u *User) publicUser {
	return publicUser{ID: u.ID, Role: u.Role, DisplayName: u.DisplayName, VolunteerOnly: u.VolunteerOnly, PhoneNumber: u.PhoneNumber}
}

func (s *Store) Register(req registerRequest) (publicUser, *AppError) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
	phone := ""
	if strings.TrimSpace(req.PhoneNumber) != "" {
		parsed, ae := normalizePhone(req.PhoneNumber)
		if ae != nil {
			return publicUser{}, ae
		}
		phone = parsed
	}
	role := strings.TrimSpace(req.Role)
	name := strings.TrimSpace(req.DisplayName)
	if role != "worker" && role != "poster" {
		return publicUser{}, invalidInput("Rolul trebuie să fie worker sau poster.")
	}
	if !strings.Contains(email, "@") || len(email) > 200 {
		return publicUser{}, invalidInput("Emailul nu este valid.")
	}
	if len(req.Password) < 8 {
		return publicUser{}, invalidInput("Parola trebuie să aibă cel puțin 8 caractere.")
	}
	if n := len([]rune(name)); n < 2 || n > 80 {
		return publicUser{}, invalidInput("Numele trebuie să aibă între 2 și 80 de caractere.")
	}
	if strings.TrimSpace(req.IdentityProof) == "" {
		return publicUser{}, appErr(409, "identity_required", "Verifică identitatea înainte de cont.")
	}
	proofID, birth, volunteer, err := s.lookupIdentityProof(email, strings.TrimSpace(req.IdentityProof))
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return publicUser{}, ae
		}
		return publicUser{}, errInternal
	}
	req.IdentityProof = proofID

	if volunteer {
		if role != "worker" {
			return publicUser{}, invalidInput("Sub 16 ani contul este doar pentru voluntariat.")
		}
		if !strings.Contains(req.GuardianEmail, "@") {
			return publicUser{}, invalidInput("Sub 16 ani ai nevoie de emailul tutorelui.")
		}
	}
	var existing int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&existing); err != nil {
		return publicUser{}, errInternal
	}
	if existing > 0 {
		return publicUser{}, appErr(409, "duplicate_email", "Există deja un cont cu acest email.")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return publicUser{}, errInternal
	}
	id, err := NewID("user_")
	if err != nil {
		return publicUser{}, errInternal
	}
	flag := 0
	if volunteer {
		flag = 1
	}
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		result, err := conn.ExecContext(ctx, `UPDATE identity_sessions SET status='consumed' WHERE id=? AND email=? AND status='verified' AND verified_provider=? AND expires_at>?`, req.IdentityProof, email, verifiedIdentityProvider, time.Now().In(zoneEEST).Format(time.RFC3339))
		if err != nil {
			return err
		}
		count, _ := result.RowsAffected()
		if count != 1 {
			return appErr(409, "proof_used", "Dovada de identitate a fost folosită.")
		}
		_, err = conn.ExecContext(ctx, `INSERT INTO users (id,role,display_name,email,password_hash,birth_date,volunteer_only,guardian_email,status,phone_number,created_at,identity_verified) VALUES(?,?,?,?,?,?,?,?,'active',?,?,1)`, id, role, name, email, string(hash), birth.Format("2006-01-02"), flag, strings.TrimSpace(req.GuardianEmail), phone, NowRFC3339())
		return err
	})
	if err != nil {
		if ae, ok := asAppError(err); ok {
			return publicUser{}, ae
		}
		return publicUser{}, errInternal
	}

	return publicUser{ID: id, Role: role, DisplayName: name, VolunteerOnly: volunteer, PhoneNumber: phone}, nil
}

func (s *Store) Login(email, password string) (string, publicUser, *AppError) {
	email = strings.ToLower(strings.TrimSpace(email))
	var id, role, name, hash, status, phone, birthText string
	var volunteer int
	err := s.db.QueryRow(`SELECT id, role, display_name, COALESCE(password_hash, ''), status, volunteer_only, phone_number, COALESCE(birth_date,'') FROM users WHERE email = ?`, email).
		Scan(&id, &role, &name, &hash, &status, &volunteer, &phone, &birthText)
	if err == sql.ErrNoRows || hash == "" || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return "", publicUser{}, errInvalidCredentials
	}
	if err != nil {
		return "", publicUser{}, errInternal
	}
	if status == "suspended" {
		return "", publicUser{}, appErr(403, "account_suspended", "Contul este suspendat.")
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", publicUser{}, errInternal
	}
	token := hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	sessionID, err := NewID("user_")
	if err != nil {
		return "", publicUser{}, errInternal
	}
	expires := time.Now().In(zoneEEST).Add(24 * time.Hour).Format("2006-01-02T15:04:05.000Z07:00")
	_, err = s.db.Exec(`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`, sessionID, id, hex.EncodeToString(sum[:]), expires)
	if err != nil {
		return "", publicUser{}, errInternal
	}
	return token, publicUser{ID: id, Role: role, DisplayName: name, VolunteerOnly: accountVolunteerOnly(birthText, volunteer == 1), PhoneNumber: phone}, nil
}

func (s *Store) Logout(token string) *AppError {
	sum := sha256.Sum256([]byte(token))
	res, err := s.db.Exec(`DELETE FROM sessions WHERE token_hash = ?`, hex.EncodeToString(sum[:]))
	if err != nil {
		return errInternal
	}
	n, err := res.RowsAffected()
	if err != nil {
		return errInternal
	}
	if n == 0 {
		return errInvalidToken
	}
	return nil
}

func (s *Store) UserByToken(token string) (*User, error) {
	sum := sha256.Sum256([]byte(token))
	var u User
	var volunteer int
	var birthText string
	err := s.db.QueryRow(`
		SELECT u.id, u.role, u.display_name, u.volunteer_only, u.phone_number, COALESCE(u.birth_date,'')
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`, hex.EncodeToString(sum[:]), NowRFC3339()).
		Scan(&u.ID, &u.Role, &u.DisplayName, &volunteer, &u.PhoneNumber, &birthText)
	if err == sql.ErrNoRows {
		return nil, errInvalidToken
	}
	if err != nil {
		return nil, errInternal
	}
	u.VolunteerOnly = accountVolunteerOnly(birthText, volunteer == 1)
	return &u, nil
}
