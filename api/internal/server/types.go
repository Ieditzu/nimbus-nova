package server

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

type User struct {
	PhoneNumber   string
	ID            string
	Role          string
	DisplayName   string
	VolunteerOnly bool
}

type TaskPublic struct {
	JobType      string  `json:"job_type,omitempty"`
	County       string  `json:"county,omitempty"`
	LocalityID   string  `json:"locality_id,omitempty"`
	ID           string  `json:"id"`
	PosterID     string  `json:"poster_id"`
	PosterName   string  `json:"poster_name"`
	Title        string  `json:"title"`
	Category     string  `json:"category"`
	City         string  `json:"city"`
	PhotoURL     string  `json:"photo_url"`
	Sector       string  `json:"sector"`
	Lat          float64 `json:"lat"`
	Lng          float64 `json:"lng"`
	StartsAt     string  `json:"starts_at"`
	EndsAt       string  `json:"ends_at"`
	AmountBani   int64   `json:"amount_bani"`
	Description  string  `json:"description"`
	SafetyNote   string  `json:"safety_note"`
	Status       string  `json:"status"`
	AssigneeID   *string `json:"assignee_id"`
	AssigneeName *string `json:"assignee_name"`
	CreatedAt    string  `json:"created_at"`
}

type CreateTaskRequest struct {
	JobType     string   `json:"job_type"`
	County      string   `json:"county"`
	LocalityID  string   `json:"locality_id"`
	Title       string   `json:"title"`
	Category    string   `json:"category"`
	City        string   `json:"city"`
	PhotoURL    string   `json:"photo_url"`
	Sector      string   `json:"sector"`
	Lat         *float64 `json:"lat"`
	Lng         *float64 `json:"lng"`
	StartsAt    string   `json:"starts_at"`
	EndsAt      string   `json:"ends_at"`
	AmountBani  int64    `json:"amount_bani"`
	Description string   `json:"description"`
	SafetyNote  string   `json:"safety_note"`
}

type Profile struct {
	UserID       string   `json:"user_id"`
	DisplayName  string   `json:"display_name"`
	Skills       []string `json:"skills"`
	City         string   `json:"city"`
	Availability string   `json:"availability"`
	Bio          string   `json:"bio"`
}

type ProfileWrite struct {
	Skills       []string `json:"skills"`
	City         string   `json:"city"`
	Availability string   `json:"availability"`
	Bio          string   `json:"bio"`
}

type ApplicationView struct {
	ID         string   `json:"id"`
	TaskID     string   `json:"task_id"`
	WorkerID   string   `json:"worker_id"`
	WorkerName string   `json:"worker_name"`
	Skills     []string `json:"skills"`
	City       string   `json:"city"`
	Bio        string   `json:"bio"`
	Message    string   `json:"message"`
	Status     string   `json:"status"`
	CreatedAt  string   `json:"created_at"`
}

type ApplicationWithTask struct {
	ApplicationView
	Task TaskPublic `json:"task"`
}

type Review struct {
	ID          string `json:"id"`
	TaskID      string `json:"task_id"`
	AuthorID    string `json:"author_id"`
	AuthorName  string `json:"author_name"`
	SubjectID   string `json:"subject_id"`
	SubjectName string `json:"subject_name"`
	Stars       int    `json:"stars"`
	Text        string `json:"text"`
	CreatedAt   string `json:"created_at"`
}

type ReviewRequest struct {
	Stars int    `json:"stars"`
	Text  string `json:"text"`
}

type AppError struct {
	Status  int
	Code    string
	Message string
}

func (e *AppError) Error() string { return e.Code }

func appErr(status int, code, message string) *AppError {
	return &AppError{Status: status, Code: code, Message: message}
}

func asAppError(err error) (*AppError, bool) {
	if err == nil {
		return nil, false
	}
	var ae *AppError
	if errors.As(err, &ae) {
		return ae, true
	}
	return nil, false
}

var (
	errInvalidJSON          = appErr(400, "invalid_json", "JSON invalid.")
	errMissingActor         = appErr(401, "missing_actor", "Lipsește antetul X-Demo-Actor.")
	errUnknownActor         = appErr(401, "unknown_actor", "Actor necunoscut.")
	errForbidden            = appErr(403, "forbidden", "Interzis.")
	errNotFound             = appErr(404, "not_found", "Nu există.")
	errCannotApplyOwnTask   = appErr(409, "cannot_apply_own_task", "Nu poți aplica la propria sarcină.")
	errProfileRequired      = appErr(409, "profile_required", "Completează profilul înainte să aplici.")
	errTaskNotOpen          = appErr(409, "task_not_open", "Sarcina nu este deschisă.")
	errDuplicateApplication = appErr(409, "duplicate_application", "Ai aplicat deja la această sarcină.")
	errTaskAlreadyAssigned  = appErr(409, "task_already_assigned", "Sarcina este deja atribuită.")
	errTaskNotAssigned      = appErr(409, "task_not_assigned", "Sarcina nu este atribuită.")
	errTaskNotCompleted     = appErr(409, "task_not_completed", "Sarcina nu este finalizată.")
	errDuplicateReview      = appErr(409, "duplicate_review", "Ai lăsat deja o recenzie.")
	errInternal             = appErr(500, "internal", "Eroare internă.")
)

const (
	msgTitle        = "Titlul trebuie să aibă între 3 și 80 de caractere."
	msgCategory     = "Categoria trebuie să fie event_setup, light_moving, shop_cover sau other."
	msgCity         = "Orașul trebuie să aibă între 2 și 80 de caractere."
	msgTime         = "Timpul trebuie să fie RFC3339 cu fus orar."
	msgEnd          = "Ora de final trebuie să fie după ora de început."
	msgDuration     = "Durata trebuie să fie de cel mult 12 ore."
	msgAmount       = "Suma trebuie să fie un număr întreg de bani între 0 și 500000."
	msgDescription  = "Descrierea trebuie să aibă între 10 și 500 de caractere."
	msgSafety       = "Nota de siguranță poate avea cel mult 200 de caractere."
	msgPhoto        = "Fotografia trebuie să fie un URL http sau https de cel mult 500 de caractere."
	msgSector       = "Sectorul poate avea cel mult 40 de caractere."
	msgCoords       = "lat și lng se trimit împreună. lat este între -90 și 90, lng între -180 și 180."
	msgNear         = "Pentru căutare în apropiere trimite lat, lng și radius_km."
	msgRadius       = "radius_km trebuie să fie un număr mai mare decât 0 și cel mult 100."
	msgMessage      = "Mesajul trebuie să aibă între 1 și 280 de caractere."
	msgSkills       = "Competențele trebuie să conțină între 1 și 8 elemente, fiecare de cel mult 40 de caractere."
	msgAvailability = "Disponibilitatea trebuie să aibă între 1 și 80 de caractere."
	msgBio          = "Bio poate avea cel mult 280 de caractere."
	msgStars        = "Nota trebuie să fie un număr întreg între 1 și 5."
	msgReviewText   = "Textul trebuie să aibă între 1 și 280 de caractere."
)

func invalidInput(message string) *AppError {
	return appErr(400, "invalid_input", message)
}

var zoneEEST = time.FixedZone("EEST", 3*3600)

func NowRFC3339() string {
	return time.Now().In(zoneEEST).Format("2006-01-02T15:04:05.000000Z07:00")
}

func NewID(prefix string) (string, error) {
	switch prefix {
	case "chat_", "msg_", "task_", "app_", "rev_", "user_", "con_", "pay_", "led_", "evt_", "par_", "doc_", "dis_", "ntf_", "att_", "dip_", "idn_", "idf_", "log_", "note_", "tck_", "stm_", "spn_":
	default:
		return "", errors.New("invalid id prefix")
	}
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(buf), nil
}

func knownCategory(category string) bool {
	switch category {
	case "event_setup", "light_moving", "shop_cover", "other":
		return true
	default:
		return false
	}
}

func ValidateCreateTask(req CreateTaskRequest) *AppError {
	if req.JobType != "" && req.JobType != "short_term" && req.JobType != "long_term" && req.JobType != "volunteer" {
		return invalidInput("Alege termen scurt, termen lung sau voluntariat.")
	}
	if ae := validateTaskLocation(req); ae != nil {
		return ae
	}
	title := strings.TrimSpace(req.Title)
	if n := utf8.RuneCountInString(title); n < 3 || n > 80 {
		return invalidInput(msgTitle)
	}
	if !knownCategory(req.Category) {
		return invalidInput(msgCategory)
	}
	city := strings.TrimSpace(req.City)
	if n := utf8.RuneCountInString(city); n < 2 || n > 80 {
		return invalidInput(msgCity)
	}
	start, errStart := time.Parse(time.RFC3339, strings.TrimSpace(req.StartsAt))
	end, errEnd := time.Parse(time.RFC3339, strings.TrimSpace(req.EndsAt))
	if errStart != nil || errEnd != nil {
		return invalidInput(msgTime)
	}
	if !end.After(start) {
		return invalidInput(msgEnd)
	}
	if req.JobType == "long_term" && end.Sub(start) > 365*24*time.Hour {
		return invalidInput("Perioada unui job pe termen lung poate fi de cel mult un an.")
	}
	if req.JobType != "long_term" && end.Sub(start) > 12*time.Hour {
		return invalidInput(msgDuration)
	}
	if req.JobType == "volunteer" && req.AmountBani != 0 {
		return invalidInput("Voluntariatul este fără plată.")
	}
	if (req.JobType == "short_term" || req.JobType == "long_term") && req.AmountBani <= 0 {
		return invalidInput("Pentru un job plătit introdu o sumă mai mare decât zero.")
	}
	if req.AmountBani < 0 || req.AmountBani > 500000 {
		return invalidInput(msgAmount)
	}
	description := strings.TrimSpace(req.Description)
	if n := utf8.RuneCountInString(description); n < 10 || n > 500 {
		return invalidInput(msgDescription)
	}
	if utf8.RuneCountInString(strings.TrimSpace(req.SafetyNote)) > 200 {
		return invalidInput(msgSafety)
	}
	photo := strings.TrimSpace(req.PhotoURL)
	if photo != "" {
		if utf8.RuneCountInString(photo) > 500 || strings.ContainsAny(photo, " \t\r\n") || (!strings.HasPrefix(photo, "https://") && !strings.HasPrefix(photo, "http://")) {
			return invalidInput(msgPhoto)
		}
	}
	if utf8.RuneCountInString(strings.TrimSpace(req.Sector)) > 40 {
		return invalidInput(msgSector)
	}
	if ae := validateCoords(req.Lat, req.Lng); ae != nil {
		return ae
	}
	return nil
}
func validateCoords(lat, lng *float64) *AppError {
	if lat == nil && lng == nil {
		return nil
	}
	if lat == nil || lng == nil || *lat < -90 || *lat > 90 || *lng < -180 || *lng > 180 {
		return invalidInput(msgCoords)
	}
	return nil
}

func ValidateProfile(in ProfileWrite) *AppError {
	city := strings.TrimSpace(in.City)
	if n := utf8.RuneCountInString(city); n < 2 || n > 80 {
		return invalidInput(msgCity)
	}
	if len(in.Skills) < 1 || len(in.Skills) > 8 {
		return invalidInput(msgSkills)
	}
	for _, skill := range in.Skills {
		n := utf8.RuneCountInString(strings.TrimSpace(skill))
		if n < 1 || n > 40 {
			return invalidInput(msgSkills)
		}
	}
	availability := strings.TrimSpace(in.Availability)
	if n := utf8.RuneCountInString(availability); n < 1 || n > 80 {
		return invalidInput(msgAvailability)
	}
	if utf8.RuneCountInString(strings.TrimSpace(in.Bio)) > 280 {
		return invalidInput(msgBio)
	}
	return nil
}

func ValidateMessage(message string) *AppError {
	n := utf8.RuneCountInString(strings.TrimSpace(message))
	if n < 1 || n > 280 {
		return invalidInput(msgMessage)
	}
	return nil
}

func ValidateReview(in ReviewRequest) *AppError {
	if in.Stars < 1 || in.Stars > 5 {
		return invalidInput(msgStars)
	}
	n := utf8.RuneCountInString(strings.TrimSpace(in.Text))
	if n < 1 || n > 280 {
		return invalidInput(msgReviewText)
	}
	return nil
}

var originPattern = regexp.MustCompile(`^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$`)

func AllowedOrigin(origin string) bool {
	switch origin {
	case "https://nimbusnova.cc", "https://www.nimbusnova.cc", "https://app.nimbusnova.cc", "https://admin.nimbusnova.cc":
		return true
	}
	return originPattern.MatchString(origin)
}
