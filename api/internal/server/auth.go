package server

import (
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
	errContractRequired   = appErr(409, "contract_required", "Semnează contractul-cadru cu Nova înainte.")
	errVolunteerUnpaid    = appErr(409, "volunteer_unpaid", "Sarcina de voluntariat nu se plătește.")
	errAlreadyPaid        = appErr(409, "already_paid", "Sarcina este deja plătită.")
)

type publicUser struct {
	ID            string `json:"id"`
	Role          string `json:"role"`
	DisplayName   string `json:"display_name"`
	VolunteerOnly bool   `json:"volunteer_only"`
}

type registerRequest struct {
	Role           string `json:"role"`
	Email          string `json:"email"`
	Password       string `json:"password"`
	DisplayName    string `json:"display_name"`
	BirthDate      string `json:"birth_date"`
	GuardianEmail  string `json:"guardian_email"`
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
	return publicUser{ID: u.ID, Role: u.Role, DisplayName: u.DisplayName, VolunteerOnly: u.VolunteerOnly}
}

func (s *Store) Register(req registerRequest) (publicUser, *AppError) {
	email := strings.ToLower(strings.TrimSpace(req.Email))
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
	birth, err := time.Parse("2006-01-02", strings.TrimSpace(req.BirthDate))
	if err != nil {
		return publicUser{}, invalidInput("Data nașterii trebuie să fie YYYY-MM-DD.")
	}
	volunteer := time.Now().In(zoneEEST).Before(birth.AddDate(18, 0, 0))
	if volunteer {
		if role != "worker" {
			return publicUser{}, invalidInput("Un minor nu poate fi poster.")
		}
		if !strings.Contains(req.GuardianEmail, "@") {
			return publicUser{}, invalidInput("Un minor are nevoie de emailul tutorelui.")
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
	_, err = s.db.Exec(`INSERT INTO users (id, role, display_name, email, password_hash, birth_date, volunteer_only, guardian_email, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
		id, role, name, email, string(hash), birth.Format("2006-01-02"), flag, strings.TrimSpace(req.GuardianEmail))
	if err != nil {
		return publicUser{}, errInternal
	}
	return publicUser{ID: id, Role: role, DisplayName: name, VolunteerOnly: volunteer}, nil
}

func (s *Store) Login(email, password string) (string, publicUser, *AppError) {
	email = strings.ToLower(strings.TrimSpace(email))
	var id, role, name, hash, status string
	var volunteer int
	err := s.db.QueryRow(`SELECT id, role, display_name, COALESCE(password_hash, ''), status, volunteer_only FROM users WHERE email = ?`, email).
		Scan(&id, &role, &name, &hash, &status, &volunteer)
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
	return token, publicUser{ID: id, Role: role, DisplayName: name, VolunteerOnly: volunteer == 1}, nil
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
	err := s.db.QueryRow(`
		SELECT u.id, u.role, u.display_name, u.volunteer_only
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ? AND s.expires_at > ?`, hex.EncodeToString(sum[:]), NowRFC3339()).
		Scan(&u.ID, &u.Role, &u.DisplayName, &volunteer)
	if err == sql.ErrNoRows {
		return nil, errInvalidToken
	}
	if err != nil {
		return nil, errInternal
	}
	u.VolunteerOnly = volunteer == 1
	return &u, nil
}
