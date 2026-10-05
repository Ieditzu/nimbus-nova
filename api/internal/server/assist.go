package server

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

var (
	errAssistUnavailable = appErr(503, "assist_unavailable", "Asistentul nu este disponibil momentan. Poți continua fără el.")
	errAssistLimited     = appErr(429, "assist_limited", "Ai folosit asistentul de prea multe ori azi. Continuă manual.")
)

const assistDailyCap = 40

var (
	assistPhone   = regexp.MustCompile(`(?:\+40|0040|0)(?:[\s.-]*\d){8,10}`)
	assistEmail   = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	assistDigits  = regexp.MustCompile(`\b\d{13}\b`)
	assistOffsite = regexp.MustCompile(`(?i)whats?app|telegram|instagram|viber|signal|numerar|cash|revolut|iban|plătește[- ]?mă|plateste[- ]?ma|în mână|in mana`)
	assistHome    = regexp.MustCompile(`(?i)(strad[aă]|blocul|apartament|scara|etajul|domiciliu|în casă|in casa|la mine acas)`)
	assistDrive   = regexp.MustCompile(`(?i)\b(șofat|sofat|conduc|volan|permis de conducere|uber|bolt)\b`)
	assistMinor   = regexp.MustCompile(`(?i)\b(copil|minor|sub 16|sub 18|elev)\b`)
)

type assistBucket struct {
	mu  sync.Mutex
	day string
	n   int
}

var assistBuckets sync.Map

func takeAssist(userID string) bool {
	today := time.Now().In(zoneEEST).Format("2006-01-02")
	value, _ := assistBuckets.LoadOrStore(userID, &assistBucket{})
	bucket := value.(*assistBucket)
	bucket.mu.Lock()
	defer bucket.mu.Unlock()
	if bucket.day != today {
		bucket.day = today
		bucket.n = 0
	}
	if bucket.n >= assistDailyCap {
		return false
	}
	bucket.n++
	return true
}

func (s *Server) assistRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /v1/assist/task-draft", s.handleTaskDraft)
	mux.HandleFunc("POST /v1/assist/safety-check", s.handleSafetyCheck)
	mux.HandleFunc("POST /v1/assist/application-draft", s.handleApplicationDraft)
	mux.HandleFunc("POST /v1/assist/profile-draft", s.handleProfileDraft)
	mux.HandleFunc("POST /v1/assist/message-check", s.handleMessageCheck)
	mux.HandleFunc("POST /v1/assist/search", s.handleSearchAssist)
	mux.HandleFunc("POST /v1/assist/dispute-brief", s.handleDisputeBrief)
}

func (s *Server) assistUser(w http.ResponseWriter, r *http.Request) (User, bool) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return User{}, false
	}
	if !takeAssist(user.ID) {
		writeAppError(w, errAssistLimited)
		return User{}, false
	}
	return user, true
}

func readBrief(r *http.Request, key string) (string, *AppError) {
	var body map[string]string
	r.Body = http.MaxBytesReader(&assistLimitWriter{}, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		return "", ae
	}
	text := strings.TrimSpace(body[key])
	if n := utf8.RuneCountInString(text); n < 8 || n > 800 {
		return "", invalidInput("Scrie între 8 și 800 de caractere.")
	}
	return redactPrivate(text), nil
}

func redactPrivate(text string) string {
	text = assistEmail.ReplaceAllString(text, "[email]")
	text = assistPhone.ReplaceAllString(text, "[telefon]")
	text = assistDigits.ReplaceAllString(text, "[cnp]")
	return text
}

func askJSON(ctx context.Context, system, user string, think bool, dest any) (err error) {
	defer func() {
		if recover() != nil {
			err = errAssistUnavailable
		}
	}()
	raw, err := assistComplete(ctx, system+" Răspunde doar cu un obiect JSON.", user, think)
	if err != nil {
		return err
	}
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	if err = json.Unmarshal([]byte(strings.TrimSpace(raw)), dest); err != nil {
		return errAssistUnavailable
	}
	return nil
}

func clip(text string, max int) string {
	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) <= max {
		return text
	}
	runes := []rune(text)
	return strings.TrimSpace(string(runes[:max]))
}

func listingAssistAllowed(user User) *AppError {
	if user.Role == "admin" {
		return nil
	}
	return requirePublisher(user)
}

func (s *Server) handleTaskDraft(w http.ResponseWriter, r *http.Request) {
	user, ok := s.assistUser(w, r)
	if !ok {
		return
	}
	if ae := listingAssistAllowed(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	brief, ae := readBrief(r, "brief")
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var draft struct {
		Title       string `json:"title"`
		Category    string `json:"category"`
		JobType     string `json:"job_type"`
		City        string `json:"city"`
		AmountBani  int64  `json:"amount_bani"`
		Description string `json:"description"`
		SafetyNote  string `json:"safety_note"`
	}
	err := askJSON(r.Context(), `Ești editorul de anunțuri Nova, în română. Nu inventa un oraș, o sumă sau o experiență care nu este în text. category este una din: event_setup, light_moving, shop_cover, other. job_type este short_term, long_term sau volunteer. Voluntariatul are amount_bani 0. Suma este în bani (1 leu = 100 bani), între 0 și 500000. Titlul are 3-80 caractere. Descrierea are 10-500. safety_note are cel mult 200 și spune limitele: spațiu public, fără numerar, fără acces în locuință, fără șofat, doar adulți pentru muncă plătită. JSON: {"title","category","job_type","city","amount_bani","description","safety_note"}.`, brief, false, &draft)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if !knownCategory(draft.Category) {
		draft.Category = "other"
	}
	if draft.JobType != "short_term" && draft.JobType != "long_term" && draft.JobType != "volunteer" {
		draft.JobType = "short_term"
	}
	if draft.JobType == "volunteer" {
		draft.AmountBani = 0
	}
	if draft.AmountBani < 0 {
		draft.AmountBani = 0
	}
	if draft.AmountBani > 500000 {
		draft.AmountBani = 500000
	}
	draft.Title = clip(draft.Title, 80)
	draft.City = clip(draft.City, 80)
	draft.Description = clip(draft.Description, 500)
	draft.SafetyNote = clip(draft.SafetyNote, 200)
	flags, warning := safetyFlags(draft.Title + " " + draft.Description + " " + brief)
	writeJSON(w, http.StatusOK, map[string]any{
		"draft":   draft,
		"flags":   flags,
		"warning": warning,
	})
}

func (s *Server) handleSafetyCheck(w http.ResponseWriter, r *http.Request) {
	user, ok := s.assistUser(w, r)
	if !ok {
		return
	}
	if ae := listingAssistAllowed(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	var body struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		SafetyNote  string `json:"safety_note"`
		JobType     string `json:"job_type"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	source := redactPrivate(strings.TrimSpace(body.Title + "\n" + body.Description + "\n" + body.SafetyNote))
	if utf8.RuneCountInString(source) < 8 {
		writeAppError(w, invalidInput("Scrie descrierea înainte de verificare."))
		return
	}
	flags, warning := safetyFlags(source)
	note := clip(body.SafetyNote, 200)
	var model struct {
		Note    string   `json:"note"`
		Flags   []string `json:"flags"`
		Warning string   `json:"warning"`
	}
	err := askJSON(r.Context(), `Verifici un anunț Nova. Semnalează doar numerar, șofat, acces în locuință sau muncă plătită pentru minori. Nu bloca anunțul. Propune o safety_note de cel mult 200 de caractere, în română, fără date personale. JSON: {"note","flags","warning"}. flags poate conține cash, driving, home, underage.`, source, false, &model)
	if err == nil {
		if strings.TrimSpace(model.Note) != "" {
			note = clip(model.Note, 200)
		}
		if model.Warning != "" {
			warning = clip(model.Warning, 240)
		}
		for _, flag := range model.Flags {
			if !containsFlag(flags, flag) && knownFlag(flag) {
				flags = append(flags, flag)
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"flags": flags, "warning": warning, "safety_note": note})
}

func knownFlag(flag string) bool {
	switch flag {
	case "cash", "driving", "home", "underage", "offplatform":
		return true
	default:
		return false
	}
}

func containsFlag(flags []string, flag string) bool {
	for _, item := range flags {
		if item == flag {
			return true
		}
	}
	return false
}

func safetyFlags(text string) ([]string, string) {
	var flags []string
	if positiveHit(assistOffsite, text) {
		flags = append(flags, "cash")
	}
	if positiveHit(assistHome, text) {
		flags = append(flags, "home")
	}
	if positiveHit(assistDrive, text) {
		flags = append(flags, "driving")
	}
	if positiveHit(assistMinor, text) {
		flags = append(flags, "underage")
	}
	if len(flags) == 0 {
		return []string{}, ""
	}
	return flags, "Anunțul pare să ceară numerar, acces în locuință, șofat sau muncă pentru minori. Nova ține banii și limitează sarcina la spațiu public, adulți și fără volan."
}

func positiveHit(re *regexp.Regexp, text string) bool {
	loc := re.FindStringIndex(text)
	if loc == nil {
		return false
	}
	start := loc[0] - 48
	if start < 0 {
		start = 0
	}
	prefix := strings.ToLower(text[start:loc[0]])
	return !strings.Contains(prefix, "fără") && !strings.Contains(prefix, "fara") && !strings.Contains(prefix, " nu")
}

func (s *Server) handleApplicationDraft(w http.ResponseWriter, r *http.Request) {
	user, ok := s.assistUser(w, r)
	if !ok {
		return
	}
	if user.Role != "worker" {
		writeAppError(w, errForbidden)
		return
	}
	var body struct {
		TaskID string `json:"task_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	task, err := s.store.PublicTask(strings.TrimSpace(body.TaskID))
	if err != nil {
		s.writeErr(w, err)
		return
	}
	profile, err := s.store.Profile(user.ID)
	skills, city, bio := "", "", ""
	if err == nil {
		skills = strings.Join(profile.Skills, ", ")
		city = profile.City
		bio = profile.Bio
	}
	var out struct {
		Message string `json:"message"`
	}
	prompt := "Sarcină: " + task.Title + "\n" + task.Description + "\nOraș: " + task.City + "\nProfil: " + skills + "\n" + city + "\n" + bio
	err = askJSON(r.Context(), `Scrie un mesaj de candidatură în română, 20-280 caractere. Folosește doar competențele din profil. Nu inventa experiență, telefon sau preț. JSON: {"message"}.`, redactPrivate(prompt), false, &out)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	out.Message = clip(out.Message, 280)
	if utf8.RuneCountInString(out.Message) < 1 {
		writeAppError(w, errAssistUnavailable)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleProfileDraft(w http.ResponseWriter, r *http.Request) {
	user, ok := s.assistUser(w, r)
	if !ok {
		return
	}
	if user.Role != "worker" {
		writeAppError(w, errForbidden)
		return
	}
	brief, ae := readBrief(r, "brief")
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var out struct {
		Skills       []string `json:"skills"`
		Bio          string   `json:"bio"`
		Availability string   `json:"availability"`
	}
	err := askJSON(r.Context(), `Transformi o frază într-un profil Nova. Nu adăuga competențe care nu sunt în text. skills are cel mult 8 intrări, fiecare cel mult 40 de caractere. bio are cel mult 280. availability are cel mult 80. Română. JSON: {"skills","bio","availability"}.`, brief, false, &out)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	skills := make([]string, 0, len(out.Skills))
	for _, skill := range out.Skills {
		skill = clip(skill, 40)
		if skill != "" && len(skills) < 8 {
			skills = append(skills, skill)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"skills":       skills,
		"bio":          clip(out.Bio, 280),
		"availability": clip(out.Availability, 80),
	})
}

func (s *Server) handleMessageCheck(w http.ResponseWriter, r *http.Request) {
	user, ok := s.assistUser(w, r)
	if !ok {
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" || utf8.RuneCountInString(text) > 2000 {
		writeAppError(w, invalidInput("Mesajul trebuie să aibă între 1 și 2000 de caractere."))
		return
	}
	warning := messageWarning(text)
	if warning == "" {
		var model struct {
			Warning string `json:"warning"`
		}
		_ = askJSON(r.Context(), `Verifici un mesaj între doi utilizatori Nova. Dacă cere telefon, adresă, WhatsApp, numerar sau plată în afara Nova, pune un avertisment scurt în română. Altfel warning este șir gol. Nu rescrie mesajul. JSON: {"warning"}.`, redactPrivate(text), false, &model)
		warning = clip(model.Warning, 240)
	}
	if warning != "" {
		s.noteAssist(user.ID, "Mesaj semnalat: "+clip(warning, 180))
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": warning == "", "warning": warning})
}

func messageWarning(text string) string {
	if assistPhone.MatchString(text) || assistEmail.MatchString(text) || assistOffsite.MatchString(text) || assistHome.MatchString(text) {
		return "Mesajul pare să mute conversația în afara Nova: telefon, adresă, aplicație sau numerar. Poți să-l trimiți, dar echipa îl vede."
	}
	return ""
}

func (s *Server) noteAssist(userID, text string) {
	var existing int
	since := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	_ = s.store.db.QueryRow(`SELECT COUNT(*) FROM admin_notes WHERE target = ? AND text = ? AND created_at > ?`, userID, text, since).Scan(&existing)
	if existing > 0 {
		return
	}
	id, err := NewID("note_")
	if err != nil {
		return
	}
	_, _ = s.store.db.Exec(`INSERT INTO admin_notes (id, target, author_id, text, created_at) VALUES (?, ?, 'system', ?, ?)`, id, userID, text, NowRFC3339())
}

func (s *Server) handleSearchAssist(w http.ResponseWriter, r *http.Request) {
	actor := "public:" + r.RemoteAddr
	if user, ae := s.currentUser(r); ae == nil {
		actor = user.ID
	}
	if !takeAssist(actor) {
		writeAppError(w, errAssistLimited)
		return
	}
	query, ae := readBrief(r, "query")
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	var out struct {
		JobType  string `json:"job_type"`
		Category string `json:"category"`
		City     string `json:"city"`
		County   string `json:"county"`
	}
	err := askJSON(r.Context(), `Transformi o căutare în filtre Nova. Nu alege o persoană. job_type este short_term, long_term, volunteer sau șir gol. category este event_setup, light_moving, shop_cover, other sau șir gol. city și county sunt goale dacă nu sunt în text. JSON: {"job_type","category","city","county"}.`, query, false, &out)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	if out.JobType != "short_term" && out.JobType != "long_term" && out.JobType != "volunteer" {
		out.JobType = ""
	}
	if !knownCategory(out.Category) {
		out.Category = ""
	}
	out.City = clip(out.City, 80)
	out.County = clip(out.County, 80)
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleDisputeBrief(w http.ResponseWriter, r *http.Request) {
	admin, ok := s.requireAdmin(w, r)
	if !ok {
		return
	}
	if !takeAssist(admin.ID) {
		writeAppError(w, errAssistLimited)
		return
	}
	var body struct {
		DisputeID string `json:"dispute_id"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	if ae := readJSON(r, &body, false); ae != nil {
		writeAppError(w, ae)
		return
	}
	var reason, status, title, description string
	var amount int64
	err := s.store.db.QueryRow(`SELECT d.reason, d.status, t.title, t.description, t.amount_bani FROM disputes d JOIN tasks t ON t.id = d.task_id WHERE d.id = ?`, strings.TrimSpace(body.DisputeID)).Scan(&reason, &status, &title, &description, &amount)
	if err != nil {
		writeAppError(w, errNotFound)
		return
	}
	var out struct {
		Summary    string `json:"summary"`
		WorkerBani int64  `json:"worker_bani"`
		PosterBani int64  `json:"poster_bani"`
	}
	prompt := "Motiv: " + reason + "\nSarcină: " + title + "\n" + description + "\nSumă bani: " + itoa(amount)
	err = askJSON(r.Context(), `Rezumă o dispută Nova în cel mult 500 de caractere, în română, fără telefon, email sau act de identitate. Nu decide tu. suggested worker_bani + poster_bani trebuie să fie exact suma, sau ambele 0 dacă nu sugerezi. JSON: {"summary","worker_bani","poster_bani"}.`, redactPrivate(prompt), true, &out)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	out.Summary = clip(out.Summary, 500)
	if out.WorkerBani < 0 || out.PosterBani < 0 || out.WorkerBani+out.PosterBani != amount {
		out.WorkerBani = 0
		out.PosterBani = 0
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"summary":     out.Summary,
		"worker_bani": out.WorkerBani,
		"poster_bani": out.PosterBani,
		"status":      status,
	})
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

type assistLimitWriter struct{}

func (assistLimitWriter) Header() http.Header         { return make(http.Header) }
func (assistLimitWriter) Write(p []byte) (int, error) { return len(p), nil }
func (assistLimitWriter) WriteHeader(int)             {}

func (s *Server) flagOutgoing(userID, text string) string {
	warning := messageWarning(text)
	if warning != "" {
		s.noteAssist(userID, "Mesaj semnalat: "+clip(redactPrivate(text), 160))
	}
	return warning
}

// SetAssistForTest replaces the model call. The returned function restores it.
func SetAssistForTest(fn func(ctx context.Context, system, user string, think bool) (string, error)) func() {
	previous := assistComplete
	if fn == nil {
		assistComplete = groqComplete
	} else {
		assistComplete = fn
	}
	return func() { assistComplete = previous }
}

func AssistUnavailable() error { return errAssistUnavailable }
