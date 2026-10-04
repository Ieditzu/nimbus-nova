package server

import (
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"os"
	"regexp"
	"strings"
)

var phonePattern = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
var errPhoneRequired = appErr(409, "phone_required", "Completează numărul de telefon pentru a continua.")

func normalizePhone(value string) (string, *AppError) {
	value = strings.NewReplacer(" ", "", "-", "", "(", "", ")", "").Replace(strings.TrimSpace(value))
	if strings.HasPrefix(value, "00") {
		value = "+" + value[2:]
	}
	if len(value) == 10 && strings.HasPrefix(value, "0") {
		value = "+40" + value[1:]
	}
	if !phonePattern.MatchString(value) {
		return "", invalidInput("Introdu un număr valid cu prefix de țară, de exemplu +40712345678.")
	}
	return value, nil
}
func requireMember(u User) *AppError {
	if u.Role != "worker" && u.Role != "poster" {
		return errForbidden
	}
	return nil
}
func requirePublisher(u User) *AppError {
	if ae := requireMember(u); ae != nil {
		return ae
	}
	if u.VolunteerOnly {
		return appErr(403, "publishing_age_required", "Publicarea joburilor este disponibilă de la 16 ani.")
	}
	return nil
}
func (s *Server) handlePhone(w http.ResponseWriter, r *http.Request) {
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
	var body struct {
		PhoneNumber string `json:"phone_number"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae = readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	phone, ae := normalizePhone(body.PhoneNumber)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if _, err = s.store.db.Exec(`UPDATE users SET phone_number = ? WHERE id = ?`, phone, user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	user.PhoneNumber = phone
	writeJSON(w, http.StatusOK, struct {
		User publicUser `json:"user"`
	}{publicFrom(user)})
}

// Opt-in development fixture, using the same hashed-password/session path as real accounts.
func (s *Store) ensureMobileTestAccount() error {
	if os.Getenv("NOVA_DEMO") != "1" || os.Getenv("NOVA_TEST_ACCOUNT") != "1" {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("samoaraplatoniimei"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT OR IGNORE INTO users(id,role,display_name,email,password_hash,birth_date,volunteer_only,status,phone_number) VALUES('mobile-test-worker','worker','Perjoc Test','test@haisamoritu.com',?,'2000-01-01',0,'active','')`, string(hash))
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT OR IGNORE INTO profiles(user_id,skills_json,city,availability,bio) SELECT id,'["organizare","comunicare"]','București','După-amiaza și în weekend','' FROM users WHERE id='mobile-test-worker'`)
	return err
}
