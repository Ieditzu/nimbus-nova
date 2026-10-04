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
func (r identityScan) facePassed() bool {
	value := r.Scores.FaceCompare
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) || *value < 0.5 || *value > 1 {
		return false
	}
	for _, w := range r.Warning {
		if strings.Contains(w.Code, "FACE") {
			return false
		}
	}
	return true
}
