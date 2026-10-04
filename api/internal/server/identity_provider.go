package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const identityEndpoint = "https://api2-eu.idanalyzer.com"
const verifiedIdentityProvider = "idanalyzer-v2-eu"

var errIdentityUnavailable = appErr(503, "identity_unavailable", "Serviciul de verificare a identității nu este disponibil. Fotografiile nu au fost trimise. Încearcă mai târziu.")
var errIdentityProvider = appErr(502, "identity_provider_error", "Serviciul de verificare nu a putut procesa fotografiile. Încearcă din nou mai târziu.")

type identityProvider struct {
	key        string
	endpoint   string
	http       *http.Client
	mu         sync.Mutex
	readyUntil time.Time
}

func newIdentityProvider() *identityProvider {
	key := strings.TrimSpace(os.Getenv("IDANALYZER_KEY"))
	if strings.ToLower(strings.TrimSpace(os.Getenv("IDANALYZER_REGION"))) != "eu" {
		key = ""
	}
	return &identityProvider{key: key, endpoint: identityEndpoint, http: &http.Client{
		Timeout:       55 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}}
}
func (p *identityProvider) request(ctx context.Context, method, path string, body any, output any) error {
	var input io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return errIdentityProvider
		}
		input = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, p.endpoint+path, input)
	if err != nil {
		return errIdentityProvider
	}
	request.Header.Set("X-API-KEY", p.key)
	request.Header.Set("User-Agent", "Nova-identity-integration")
	request.Header.Set("Content-Type", "application/json")
	response, err := p.http.Do(request)
	if err != nil {
		return errIdentityProvider
	}
	defer response.Body.Close()
	if response.StatusCode == 401 || response.StatusCode == 403 || response.StatusCode == 402 || response.StatusCode == 429 {
		return appErr(503, "identity_provider_unavailable", "Serviciul de verificare este indisponibil sau nu are credite disponibile. Încearcă mai târziu.")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errIdentityProvider
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 2_000_001))
	if err != nil || len(raw) > 2_000_000 {
		return errIdentityProvider
	}
	// Never return provider errors, raw OCR fields or document images to a client/log.
	var envelope map[string]json.RawMessage
	if json.Unmarshal(raw, &envelope) != nil {
		return errIdentityProvider
	}
	if value, ok := envelope["error"]; ok && string(value) != "null" {
		return errIdentityProvider
	}
	if json.Unmarshal(raw, output) != nil {
		return errIdentityProvider
	}
	return nil
}
func (p *identityProvider) ready(ctx context.Context) error {
	if p == nil || p.key == "" {
		return errIdentityUnavailable
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if time.Now().Before(p.readyUntil) {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	var account struct {
		ID              int64   `json:"id"`
		Credit          float64 `json:"credit"`
		Quota           float64 `json:"quota"`
		Hits            float64 `json:"hits"`
		Banned          int     `json:"banned"`
		AllowOvercharge int     `json:"allowOvercharge"`
	}
	if err := p.request(ctx, http.MethodGet, "/myaccount", nil, &account); err != nil || account.ID == 0 || account.Banned != 0 {
		return errIdentityUnavailable
	}
	if account.Credit <= 0 && account.Quota <= account.Hits && account.AllowOvercharge != 1 {
		return errIdentityUnavailable
	}
	var profile struct {
		Decisions map[string]struct {
			Enabled bool `json:"enabled"`
		} `json:"decisions"`
	}
	if err := p.request(ctx, http.MethodGet, "/profile/security_medium", nil, &profile); err != nil {
		return errIdentityUnavailable
	}
	for _, code := range []string{"FACE_MISMATCH", "FACE_LIVENESS_ERR", "RECAPTURED_FACE", "DOCUMENT_FACE_NOT_FOUND", "SELFIE_FACE_NOT_FOUND", "SELFIE_MULTIPLE_FACES"} {
		if !profile.Decisions[code].Enabled {
			return errIdentityUnavailable
		}
	}
	p.readyUntil = time.Now().Add(30 * time.Second)
	return nil
}

type identityField struct {
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}
type identityScan struct {
	Success  bool                       `json:"success"`
	Decision string                     `json:"decision"`
	Data     map[string][]identityField `json:"data"`
	Scores   struct {
		FaceCompare *float64 `json:"faceCompare"`
	} `json:"scores"`
	Warning []struct {
		Code     string `json:"code"`
		Decision string `json:"decision"`
	} `json:"warning"`
}

func (p *identityProvider) scan(ctx context.Context, kind string, files map[string][]byte) (identityScan, error) {
	prefix := kind + "_"
	encoded := func(slot string) string {
		return base64.StdEncoding.EncodeToString(files[slot])
	}
	// The preset remains responsible for authenticity, dual-side, expiry and fraud checks.
	// Override storage/output and enforce face/liveness findings even if a preset changes.
	decisions := map[string]any{}
	for _, code := range []string{"FACE_MISMATCH", "FACE_LIVENESS_ERR", "RECAPTURED_FACE", "FACE_IDENTICAL", "DOCUMENT_FACE_NOT_FOUND", "SELFIE_FACE_NOT_FOUND", "SELFIE_MULTIPLE_FACES", "SELFIE_FACE_LANDMARK_ERR", "DOCUMENT_FACE_LANDMARK_ERR", "INTERNAL_FACE_VERIFICATION_ERR", "COUNTRY_NOT_ACCEPTED", "TYPE_NOT_ACCEPTED", "DOCUMENT_EXPIRED", "DOCUMENT_DOB_MISMATCH", "DOCUMENT_NAME_MISMATCH", "DOCUMENT_COUNTRY_MISMATCH", "INVALID_BACK_DOCUMENT", "CHECK_DIGIT_FAILED"} {
		decisions[code] = map[string]any{"enabled": true, "reject": 0, "review": -1, "weight": 1}
	}
	body := map[string]any{
		"profile": "security_medium", "document": encoded(prefix + "front"), "documentBack": encoded(prefix + "back"), "face": encoded("selfie"),
		"restrictCountry": "RO", "restrictType": "I",
		"profileOverride": map[string]any{
			"saveResult": false, "saveImage": false, "outputImage": false, "transactionAuditReport": false, "webhook": "",
			"decisions": decisions, "decisionTrigger": map[string]int{"reject": 1, "review": 1},
			"thresholds": map[string]float64{"face": 0.5, "faceLiveness": 0.2, "faceRecapture": 0.5},
		},
	}
	if kind == "ci" {
		// The classic Romanian CI has no identity data on its reverse side.
		// Keep accepting legacy back uploads, but do not send them for recognition.
		delete(body, "documentBack")
		for _, code := range []string{"UNRECOGNIZED_BACK_DOCUMENT", "UNRECOGNIZED_BACK_BARCODE", "INVALID_BACK_DOCUMENT"} {
			decisions[code] = map[string]any{"enabled": false, "reject": -1, "review": -1, "weight": 0}
		}
	}
	if len(files["selfie_video"]) > 0 {
		delete(body, "face")
		body["faceVideo"] = encoded("selfie_video")
	}
	var result identityScan
	err := p.request(ctx, http.MethodPost, "/scan", body, &result)
	if err == nil && !result.Success {
		err = errIdentityProvider
	}
	return result, err
}
func (r identityScan) field(name string) (string, bool) {
	values := r.Data[name]
	value := ""
	for _, field := range values {
		candidate := strings.TrimSpace(field.Value)
		if candidate == "" {
			continue
		}
		if field.Confidence < 0.8 || math.IsNaN(field.Confidence) || field.Confidence > 1 {
			return "", false
		}
		if value != "" && value != candidate {
			return "", false
		}
		value = candidate
	}
	return value, value != ""
}

// Report the failed stage, rather than blaming the selfie for every absent score.
// Only fixed public codes/messages leave the server; provider descriptions can contain PII.
func (r identityScan) faceFailure(checks map[string]string) *AppError {
	warnings := map[string]string{}
	for _, warning := range r.Warning {
		warnings[warning.Code] = warning.Decision
	}
	fail := func(code, message, check string) *AppError {
		checks[check] = "failed"
		return appErr(422, code, message)
	}
	for _, failure := range []struct{ warning, code, message, check string }{
		{"INTERNAL_FACE_VERIFICATION_ERR", "face_service_error", "Serviciul de comparație facială a întâmpinat o eroare. Identitatea nu a fost evaluată; reîncearcă mai târziu. (FACE_SERVICE_ERROR)", "face_match"},
		{"UNRECOGNIZED_DOCUMENT", "document_unreadable", "CEI-ul sau CI-ul nu a fost recunoscut. Fotografiază întregul card, cu toate colțurile vizibile și portretul clar, nu doar fotografia feței. (DOCUMENT_UNRECOGNIZED)", "document"},
		{"UNRECOGNIZED_BACK_DOCUMENT", "document_back_unreadable", "Versoul actului nu a fost recunoscut. Adaugă o fotografie clară a întregului verso al aceluiași card. (DOCUMENT_BACK_UNRECOGNIZED)", "document"},
		{"DOCUMENT_FACE_NOT_FOUND", "document_face_missing", "Nu a fost detectat portretul din act. Refă fotografia feței CI/CEI cu întregul card și portretul lizibil. (DOCUMENT_FACE_MISSING)", "document"},
		{"DOCUMENT_FACE_LANDMARK_ERR", "document_face_unclear", "Portretul de pe act este prea neclar pentru comparație. Refă fotografia actului, mai aproape și fără reflexii. (DOCUMENT_FACE_UNCLEAR)", "document"},
		{"SELFIE_FACE_NOT_FOUND", "selfie_face_missing", "Nu a fost detectată fața în selfie. Privește camera și include întreaga față, într-un loc bine luminat. (SELFIE_FACE_MISSING)", "selfie"},
		{"SELFIE_MULTIPLE_FACES", "selfie_multiple_faces", "Selfie-ul trebuie să conțină o singură persoană. Refă fotografia fără alte persoane în cadru. (SELFIE_MULTIPLE_FACES)", "selfie"},
		{"SELFIE_FACE_LANDMARK_ERR", "selfie_face_unclear", "Selfie-ul este prea neclar pentru comparație. Curăță obiectivul, ține telefonul nemișcat și refă fotografia. (SELFIE_FACE_UNCLEAR)", "selfie"},
		{"FACE_LIVENESS_ERR", "selfie_liveness_failed", "Verificarea că ești prezent în fața camerei nu a trecut. Fă un selfie nou direct cu camera, cu lumină uniformă și fără filtre. (SELFIE_LIVENESS)", "selfie"},
		{"RECAPTURED_FACE", "selfie_recaptured", "Selfie-ul a fost detectat ca fotografie a unei imagini sau a unui ecran. Fă o fotografie nouă direct a feței tale. (SELFIE_RECAPTURED)", "selfie"},
		{"FACE_IDENTICAL", "selfie_identical", "Selfie-ul pare identic cu portretul din act. Folosește o fotografie nouă făcută direct cu camera. (SELFIE_IDENTICAL)", "selfie"},
		{"FACE_MISMATCH", "face_mismatch", "Fața din selfie nu a corespuns suficient portretului din act. Verifică fotografia actului și fă un selfie frontal, la distanța unui braț. (FACE_MISMATCH)", "face_match"},
	} {
		if _, present := warnings[failure.warning]; present {
			return fail(failure.code, failure.message, failure.check)
		}
	}
	// Unknown blocking biometric findings still fail closed. Accepted informational
	// warnings must not independently overturn an accepted provider result.
	for _, warning := range r.Warning {
		if strings.Contains(warning.Code, "FACE") && warning.Decision != "accept" {
			return fail("face_review", "Verificarea facială necesită o verificare suplimentară. Refă fotografiile actului și selfie-ul. (FACE_REVIEW)", "face_match")
		}
	}
	value := r.Scores.FaceCompare
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0 || *value > 1 {
		return fail("face_result_missing", "Serviciul nu a furnizat rezultatul comparației faciale. Verifică dacă actul și selfie-ul sunt clare și reîncearcă. (FACE_RESULT_MISSING)", "face_match")
	}
	if *value < 0.5 {
		return fail("face_mismatch", "Fața din selfie nu a corespuns suficient portretului din act. Verifică fotografia actului și fă un selfie frontal, la distanța unui braț. (FACE_MISMATCH)", "face_match")
	}
	return nil
}
