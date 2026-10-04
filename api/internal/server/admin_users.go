package server

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

var adminRoles = map[string]bool{"worker": true, "poster": true, "admin": true, "partner_user": true, "organizer": true, "guardian": true}

// Fields are pointers so a PUT can change only what the admin edited.
type adminUserPatch struct {
	DisplayName   *string `json:"display_name"`
	Email         *string `json:"email"`
	PhoneNumber   *string `json:"phone_number"`
	BirthDate     *string `json:"birth_date"`
	GuardianEmail *string `json:"guardian_email"`
	Role          *string `json:"role"`
}

type adminProfilePatch struct {
	Skills       []string `json:"skills"`
	City         string   `json:"city"`
	Availability string   `json:"availability"`
	Bio          string   `json:"bio"`
}

func (s *Server) handleAdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var patch adminUserPatch
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &patch, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	id := r.PathValue("id")
	changed, err := s.store.AdminUpdateUser(id, admin.ID, patch)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if len(changed) > 0 {
		s.audit(admin.ID, "user_edit", id, strings.Join(changed, ", "))
	}
	detail, err := s.store.AdminUserDetail(id)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

func (s *Store) AdminUpdateUser(id, actorID string, p adminUserPatch) ([]string, error) {
	var changed []string
	err := s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var role, name, email, phone, birth, guardian string
		var volunteer int
		err := conn.QueryRowContext(ctx, `SELECT role, display_name, COALESCE(email,''), phone_number, COALESCE(birth_date,''), COALESCE(guardian_email,''), volunteer_only FROM users WHERE id = ?`, id).
			Scan(&role, &name, &email, &phone, &birth, &guardian, &volunteer)
		if err == sql.ErrNoRows {
			return errNotFound
		}
		if err != nil {
			return errInternal
		}
		if p.DisplayName != nil {
			v := strings.TrimSpace(*p.DisplayName)
			if n := len([]rune(v)); n < 2 || n > 80 {
				return invalidInput("Numele trebuie să aibă între 2 și 80 de caractere.")
			}
			if v != name {
				name = v
				changed = append(changed, "nume")
			}
		}
		if p.Email != nil {
			v := strings.ToLower(strings.TrimSpace(*p.Email))
			if !strings.Contains(v, "@") || len(v) > 200 {
				return invalidInput("Emailul nu este valid.")
			}
			if v != email {
				var taken int
				if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE email = ? AND id != ?`, v, id).Scan(&taken); err != nil {
					return errInternal
				}
				if taken > 0 {
					return appErr(409, "duplicate_email", "Există deja un cont cu acest email.")
				}
				email = v
				changed = append(changed, "email")
			}
		}
		if p.PhoneNumber != nil {
			v := strings.TrimSpace(*p.PhoneNumber)
			if v != "" {
				parsed, ae := normalizePhone(v)
				if ae != nil {
					return ae
				}
				v = parsed
			}
			if v != phone {
				phone = v
				changed = append(changed, "telefon")
			}
		}
		if p.GuardianEmail != nil {
			v := strings.TrimSpace(*p.GuardianEmail)
			if v != "" && !strings.Contains(v, "@") {
				return invalidInput("Emailul tutorelui nu este valid.")
			}
			if v != guardian {
				guardian = v
				changed = append(changed, "tutore")
			}
		}
		if p.BirthDate != nil {
			v := strings.TrimSpace(*p.BirthDate)
			parsed, perr := time.Parse("2006-01-02", v)
			if perr != nil || parsed.After(time.Now()) || parsed.Year() < 1900 {
				return invalidInput("Data nașterii trebuie să fie în formatul AAAA-LL-ZZ, în trecut.")
			}
			if v != birth {
				birth = v
				volunteer = 0
				if accountVolunteerOnly(v, false) {
					volunteer = 1
				}
				changed = append(changed, "data nașterii")
			}
		}
		if p.Role != nil {
			v := strings.TrimSpace(*p.Role)
			if !adminRoles[v] {
				return invalidInput("Rol necunoscut.")
			}
			if v != role {
				if id == actorID {
					return invalidInput("Nu îți poți schimba propriul rol.")
				}
				role = v
				changed = append(changed, "rol")
			}
		}
		if role == "admin" && volunteer == 1 {
			return invalidInput("Un administrator trebuie să fie major.")
		}
		if len(changed) == 0 {
			return nil
		}
		if _, err := conn.ExecContext(ctx, `UPDATE users SET display_name=?, email=?, phone_number=?, birth_date=?, guardian_email=?, role=?, volunteer_only=? WHERE id=?`,
			name, email, phone, birth, guardian, role, volunteer, id); err != nil {
			return errInternal
		}
		for _, c := range changed {
			// A new role or email invalidates what existing sessions were issued for.
			if c == "rol" || c == "email" {
				if _, err := conn.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, id); err != nil {
					return errInternal
				}
				break
			}
		}
		return nil
	})
	return changed, err
}

func (s *Server) handleAdminSetPassword(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body struct {
		Password string `json:"password"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	if len(body.Password) < 8 || len(body.Password) > 72 {
		writeAppError(w, invalidInput("Parola trebuie să aibă între 8 și 72 de caractere."))
		return
	}
	id := r.PathValue("id")
	if id == admin.ID {
		writeAppError(w, invalidInput("Schimbă-ți parola din contul tău, nu din panou."))
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	res, err := s.store.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, string(hash), id)
	if err != nil {
		writeAppError(w, errInternal)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeAppError(w, errNotFound)
		return
	}
	_, _ = s.store.db.Exec(`DELETE FROM sessions WHERE user_id = ?`, id)
	s.audit(admin.ID, "user_password_reset", id, "")
	writeJSON(w, http.StatusOK, okBody{OK: true})
}

func (s *Server) handleAdminUpdateProfile(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	var body adminProfilePatch
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	in := ProfileWrite{Skills: body.Skills, City: body.City, Availability: body.Availability, Bio: body.Bio}
	if ae := ValidateProfile(in); ae != nil {
		writeAppError(w, ae)
		return
	}
	id := r.PathValue("id")
	var exists int
	if err := s.store.db.QueryRow(`SELECT COUNT(*) FROM users WHERE id = ?`, id).Scan(&exists); err != nil || exists == 0 {
		writeAppError(w, errNotFound)
		return
	}
	if _, err := s.store.SaveProfile(User{ID: id}, in); err != nil {
		s.writeErr(w, err)
		return
	}
	s.audit(admin.ID, "user_edit", id, "profil")
	detail, err := s.store.AdminUserDetail(id)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, detail)
}
