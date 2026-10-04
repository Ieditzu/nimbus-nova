package server

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func scanFixture() identityScan {
	r := identityScan{Success: true, Decision: "accept", Data: map[string][]identityField{}}
	for key, value := range map[string]string{"countryIso2": "RO", "documentType": "I", "dob": "2015/03/15", "personalNumber": "5150315400013", "documentNumber": "RX123456", "expiry": "2035/03/15"} {
		r.Data[key] = []identityField{{Value: value, Confidence: 0.99}}
	}
	score := 0.9
	r.Scores.FaceCompare = &score
	return r
}
func identityHarness(t *testing.T, response identityScan, scanStatus int, delay time.Duration) (*Server, *httptest.Server, *atomic.Int32) {
	t.Helper()
	t.Setenv("IDANALYZER_KEY", "")
	s, err := New(filepath.Join(t.TempDir(), "nova.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	calls := &atomic.Int32{}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-KEY") != "synthetic-secret" {
			t.Error("missing server-side credential")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/myaccount" {
			json.NewEncoder(w).Encode(map[string]any{"id": 1, "credit": 100, "quota": 0, "hits": 0, "banned": 0})
			return
		}
		if r.URL.Path == "/profile/security_medium" {
			decisions := map[string]any{}
			for _, code := range []string{"FACE_MISMATCH", "FACE_LIVENESS_ERR", "RECAPTURED_FACE", "DOCUMENT_FACE_NOT_FOUND", "SELFIE_FACE_NOT_FOUND", "SELFIE_MULTIPLE_FACES"} {
				decisions[code] = map[string]bool{"enabled": true}
			}
			json.NewEncoder(w).Encode(map[string]any{"decisions": decisions})
			return
		}
		if r.URL.Path != "/scan" {
			t.Errorf("unexpected provider path %s", r.URL.Path)
			w.WriteHeader(404)
			return
		}
		calls.Add(1)
		var payload map[string]any
		if json.NewDecoder(r.Body).Decode(&payload) != nil {
			t.Error("invalid scan payload")
		}
		fields := []string{"document", "documentBack"}
		if payload["faceVideo"] != nil {
			fields = append(fields, "faceVideo")
		} else {
			fields = append(fields, "face")
		}
		for _, field := range fields {
			if _, err := base64.StdEncoding.DecodeString(payload[field].(string)); err != nil {
				t.Error("provider expects plain base64, not data URI")
			}
		}
		if payload["restrictCountry"] != "RO" || payload["restrictType"] != "I" || (payload["face"] == nil && payload["faceVideo"] == nil) || payload["documentBack"] == nil {
			t.Error("document/face constraints missing")
		}
		overrides := payload["profileOverride"].(map[string]any)
		for _, key := range []string{"saveResult", "saveImage", "outputImage", "transactionAuditReport"} {
			if overrides[key] != false {
				t.Errorf("storage/output enabled: %s", key)
			}
		}
		if strings.Contains(fmt.Sprint(payload), "@") {
			t.Error("email sent to provider")
		}
		if delay > 0 {
			time.Sleep(delay)
		}
		w.WriteHeader(scanStatus)
		if scanStatus != 200 {
			json.NewEncoder(w).Encode(map[string]any{"error": "private provider details synthetic-secret"})
			return
		}
		json.NewEncoder(w).Encode(response)
	}))
	t.Cleanup(provider.Close)
	s.store.identity = &identityProvider{key: "synthetic-secret", endpoint: provider.URL, http: provider.Client()}
	api := httptest.NewServer(s.Handler())
	t.Cleanup(api.Close)
	return s, api, calls
}
func identityRequest(t *testing.T, api *httptest.Server, path string, body any) (int, map[string]any) {
	t.Helper()
	data, _ := json.Marshal(body)
	response, err := http.Post(api.URL+path, "application/json", bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var output map[string]any
	if json.NewDecoder(response.Body).Decode(&output) != nil {
		t.Fatal("invalid response")
	}
	return response.StatusCode, output
}
func testPNG(t *testing.T) string {
	t.Helper()
	var raw bytes.Buffer
	image := image.NewRGBA(image.Rect(0, 0, 20, 20))
	image.Set(0, 0, color.RGBA{R: 100, A: 255})
	if err := png.Encode(&raw, image); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(raw.Bytes())
}
func testPDF(text string) []byte {
	var compressed bytes.Buffer
	compressor := zlib.NewWriter(&compressed)
	fmt.Fprintf(compressor, "BT /F1 12 Tf 40 740 Td (%s) Tj ET", text)
	compressor.Close()
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		fmt.Sprintf("<< /Length %d /Filter /FlateDecode >>\nstream\n%s\nendstream", compressed.Len(), compressed.String()),
	}
	var pdf bytes.Buffer
	pdf.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	for i, object := range objects {
		offsets = append(offsets, pdf.Len())
		fmt.Fprintf(&pdf, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := pdf.Len()
	fmt.Fprintf(&pdf, "xref\n0 6\n0000000000 65535 f \n")
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&pdf, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&pdf, "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF", xref)
	return pdf.Bytes()
}
func collectIdentity(t *testing.T, api *httptest.Server, kind string, pdf []byte) string {
	t.Helper()
	status, body := identityRequest(t, api, "/v1/auth/identity", map[string]any{"email": "identity@example.test", "kind": kind})
	if status != 201 {
		t.Fatalf("start %d %v", status, body)
	}
	verification := body["verification"].(map[string]any)
	if verification["checks"].(map[string]any)["face_match"] != "pending" {
		t.Fatal("not ready")
	}
	id := verification["id"].(string)
	photo := testPNG(t)
	for _, slot := range []string{kind + "_front", kind + "_back", "selfie"} {
		status, body = identityRequest(t, api, "/v1/auth/identity/"+id+"/files", map[string]any{"slot": slot, "content_type": "image/png", "content_base64": photo})
		if status != 201 {
			t.Fatalf("upload %d %v", status, body)
		}
	}
	if kind == "cei" {
		status, body = identityRequest(t, api, "/v1/auth/identity/"+id+"/files", map[string]any{"slot": "cei_pdf", "content_type": "application/pdf", "content_base64": base64.StdEncoding.EncodeToString(pdf)})
		if status != 201 {
			t.Fatalf("PDF %d %v", status, body)
		}
	}
	return id
}
func TestVerifiedIdentityAndPrivateRetention(t *testing.T) {
	for _, kind := range []string{"ci", "cei"} {
		t.Run(kind, func(t *testing.T) {
			s, api, calls := identityHarness(t, scanFixture(), 200, 0)
			id := collectIdentity(t, api, kind, testPDF("CNP 5150315400013 Document RX123456"))
			status, body := identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
			if status != 200 || body["proof"] == nil {
				t.Fatalf("complete %d %v", status, body)
			}
			view := body["verification"].(map[string]any)
			if view["status"] != "verified" || view["checks"].(map[string]any)["document"] != "passed" {
				t.Fatal(body)
			}
			proof := body["proof"].(map[string]any)["token"].(string)
			var remaining int
			s.DB().QueryRow(`SELECT COUNT(*) FROM identity_files WHERE session_id=?`, id).Scan(&remaining)
			if remaining != 0 || calls.Load() != 1 {
				t.Fatal("retained raw files or duplicate paid requests")
			}
			request := map[string]any{"role": "worker", "email": "wrong@example.test", "password": "identity-password-42", "display_name": "Synthetic Person", "identity_proof": proof, "guardian_email": "parent@example.test"}
			status, _ = identityRequest(t, api, "/v1/auth/register", request)
			if status != 409 {
				t.Fatalf("wrong email %d", status)
			}
			request["email"] = "identity@example.test"
			delete(request, "guardian_email")
			status, _ = identityRequest(t, api, "/v1/auth/register", request)
			if status != 400 {
				t.Fatalf("missing guardian %d", status)
			}
			request["guardian_email"] = "parent@example.test"
			status, body = identityRequest(t, api, "/v1/auth/register", request)
			if status != 201 || body["user"].(map[string]any)["volunteer_only"] != true {
				t.Fatalf("register %d %v", status, body)
			}
			status, _ = identityRequest(t, api, "/v1/auth/register", request)
			if status != 409 {
				t.Fatalf("proof reuse %d", status)
			}
			status, _ = identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
			if status != 409 {
				t.Fatalf("repeat %d", status)
			}
		})
	}
}
func TestIdentityFailClosedAndCleanup(t *testing.T) {
	for _, scenario := range []string{"review", "reject", "missing-face", "low-face", "non-Romanian", "passport", "wrong-cnp", "pdf-mismatch", "malformed-pdf", "quota", "provider-error", "missing-success"} {
		t.Run(scenario, func(t *testing.T) {
			scan := scanFixture()
			statusCode := 200
			kind := "ci"
			pdf := testPDF("CNP 5150315400013 Document RX123456")
			switch scenario {
			case "review", "reject":
				scan.Decision = scenario
			case "missing-face":
				scan.Scores.FaceCompare = nil
			case "low-face":
				score := 0.2
				scan.Scores.FaceCompare = &score
			case "non-Romanian":
				scan.Data["countryIso2"][0].Value = "DE"
			case "passport":
				scan.Data["documentType"][0].Value = "P"
			case "wrong-cnp":
				scan.Data["personalNumber"][0].Value = "5150315400014"
			case "pdf-mismatch":
				kind = "cei"
				pdf = testPDF("CNP 5150315400013 Document OTHER")
				delete(scan.Data, "personalNumber")
			case "malformed-pdf":
				kind = "cei"
				pdf = []byte("%PDF broken contents")
			case "quota":
				statusCode = 402
			case "provider-error":
				statusCode = 500
			case "missing-success":
				scan.Success = false
			}
			s, api, _ := identityHarness(t, scan, statusCode, 0)
			id := collectIdentity(t, api, kind, pdf)
			status, body := identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
			if body["proof"] != nil {
				t.Fatalf("issued proof: %d %v", status, body)
			}
			if status == 200 && body["verification"].(map[string]any)["status"] == "verified" {
				t.Fatal("accepted invalid identity")
			}
			encoded, _ := json.Marshal(body)
			if strings.Contains(string(encoded), "synthetic-secret") || strings.Contains(string(encoded), "5150315400013") {
				t.Fatal("sensitive provider content leaked")
			}
			var remaining int
			s.DB().QueryRow(`SELECT COUNT(*) FROM identity_files WHERE session_id=?`, id).Scan(&remaining)
			if remaining != 0 {
				t.Fatal("failed identity retained files")
			}
		})
	}
}
func TestConcurrentIdentityCompletionMakesOneProviderCall(t *testing.T) {
	_, api, calls := identityHarness(t, scanFixture(), 200, 200*time.Millisecond)
	id := collectIdentity(t, api, "ci", nil)
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() {
			data, _ := json.Marshal(map[string]any{})
			r, err := http.Post(api.URL+"/v1/auth/identity/"+id+"/complete", "application/json", bytes.NewReader(data))
			if err != nil {
				statuses <- 0
				return
			}
			defer r.Body.Close()
			statuses <- r.StatusCode
		}()
	}
	a, b := <-statuses, <-statuses
	if !(a == 200 && b == 409 || a == 409 && b == 200) || calls.Load() != 1 {
		t.Fatalf("concurrent completion %d %d calls %d", a, b, calls.Load())
	}
}
func TestLegacyIdentityProofRejected(t *testing.T) {
	s, _, _ := identityHarness(t, scanFixture(), 200, 0)
	token, hash, _ := newProofToken()
	_, err := s.DB().Exec(`INSERT INTO identity_sessions(id,email,kind,status,birth_date,proof_hash,expires_at,created_at) VALUES('legacy','legacy@example.test','ci','verified','2000-01-01',?,?,?)`, hash, time.Now().Add(time.Hour).In(zoneEEST).Format(time.RFC3339), time.Now().In(zoneEEST).Format(time.RFC3339))
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, err = s.store.lookupIdentityProof("legacy@example.test", token)
	if err == nil {
		t.Fatal("legacy unverified proof accepted")
	}
}

func TestPosterCannotBypassIdentityWithTypedBirthDate(t *testing.T) {
	_, api, calls := identityHarness(t, scanFixture(), 200, 0)
	status, _ := identityRequest(t, api, "/v1/auth/register", map[string]any{
		"email": "poster@example.test", "role": "poster", "display_name": "Synthetic Poster", "password": "identity-password-42", "birth_date": "2000-01-01",
	})
	if status != 409 || calls.Load() != 0 {
		t.Fatalf("typed birth date bypassed identity: %d", status)
	}
}
func TestConcurrentRegistrationConsumesProofOnce(t *testing.T) {
	s, api, _ := identityHarness(t, scanFixture(), 200, 0)
	id := collectIdentity(t, api, "ci", nil)
	status, body := identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
	if status != 200 {
		t.Fatal(body)
	}
	request := map[string]any{"role": "worker", "email": "identity@example.test", "password": "identity-password-42", "display_name": "Synthetic Person", "identity_proof": body["proof"].(map[string]any)["token"], "guardian_email": "parent@example.test"}
	results := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() { code, _ := identityRequest(t, api, "/v1/auth/register", request); results <- code }()
	}
	first, second := <-results, <-results
	if !((first == 201 && second == 409) || (second == 201 && first == 409)) {
		t.Fatalf("concurrent registration: %d %d", first, second)
	}
	var count int
	if err := s.DB().QueryRow("SELECT COUNT(*) FROM users WHERE email='identity@example.test'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("account count=%d error=%v", count, err)
	}
}

func TestFacialFailureIdentifiesTheActualStage(t *testing.T) {
	for _, tc := range []struct{ warning, code, check string }{
		{"UNRECOGNIZED_DOCUMENT", "document_unreadable", "document"},
		{"UNRECOGNIZED_BACK_DOCUMENT", "document_back_unreadable", "document"},
		{"DOCUMENT_FACE_NOT_FOUND", "document_face_missing", "document"},
		{"DOCUMENT_FACE_LANDMARK_ERR", "document_face_unclear", "document"},
		{"SELFIE_FACE_NOT_FOUND", "selfie_face_missing", "selfie"},
		{"SELFIE_MULTIPLE_FACES", "selfie_multiple_faces", "selfie"},
		{"SELFIE_FACE_LANDMARK_ERR", "selfie_face_unclear", "selfie"},
		{"FACE_LIVENESS_ERR", "selfie_liveness_failed", "selfie"},
		{"RECAPTURED_FACE", "selfie_recaptured", "selfie"},
		{"FACE_IDENTICAL", "selfie_identical", "selfie"},
		{"FACE_MISMATCH", "face_mismatch", "face_match"},
		{"INTERNAL_FACE_VERIFICATION_ERR", "face_service_error", "face_match"},
	} {
		t.Run(tc.warning, func(t *testing.T) {
			scan := scanFixture()
			scan.Warning = append(scan.Warning, struct {
				Code     string `json:"code"`
				Decision string `json:"decision"`
			}{tc.warning, "reject"})
			if tc.check == "document" {
				scan.Scores.FaceCompare = nil
			}
			checks := map[string]string{"face_match": "pending", "selfie": "pending", "document": "pending"}
			ae := scan.faceFailure(checks)
			if ae == nil || ae.Code != tc.code || checks[tc.check] != "failed" {
				t.Fatalf("incorrect reason: %v %v", ae, checks)
			}
			if tc.check == "document" && checks["selfie"] != "pending" {
				t.Fatal("document failure blamed selfie")
			}
		})
	}
	scan := scanFixture()
	scan.Scores.FaceCompare = nil
	checks := map[string]string{}
	if ae := scan.faceFailure(checks); ae == nil || ae.Code != "face_result_missing" {
		t.Fatalf("missing result: %v", ae)
	}
	scan = scanFixture()
	scan.Warning = append(scan.Warning, struct {
		Code     string `json:"code"`
		Decision string `json:"decision"`
	}{"INFORMATIONAL_FACE_CHECK", "accept"})
	if ae := scan.faceFailure(map[string]string{}); ae != nil {
		t.Fatalf("accepted informational warning rejected: %v", ae)
	}
	scan.Warning[0].Decision = "review"
	if ae := scan.faceFailure(map[string]string{}); ae == nil {
		t.Fatal("unknown review bypassed")
	}
}
func TestUnreadableCardReturnsDocumentAdviceAndNoProof(t *testing.T) {
	scan := scanFixture()
	scan.Decision = "reject"
	scan.Scores.FaceCompare = nil
	scan.Warning = append(scan.Warning, struct {
		Code     string `json:"code"`
		Decision string `json:"decision"`
	}{"UNRECOGNIZED_DOCUMENT", "reject"})
	_, api, _ := identityHarness(t, scan, 200, 0)
	id := collectIdentity(t, api, "cei", testPDF("CNP 5150315400013 Document RX123456"))
	status, body := identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
	if status != 200 || body["proof"] != nil {
		t.Fatalf("unexpected proof: %d %v", status, body)
	}
	view := body["verification"].(map[string]any)
	if !strings.Contains(view["message"].(string), "DOCUMENT_UNRECOGNIZED") || view["checks"].(map[string]any)["selfie"] != "pending" {
		t.Fatalf("incorrect advice: %v", view)
	}
}

func TestV2IssuingCountryField(t *testing.T) {
	for _, tc := range []struct{ name, country, code string }{
		{"Romanian CEI", "RO", ""},
		{"foreign card", "DE", "document_country"},
		{"unreadable country", "", "document_country_unreadable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scan := scanFixture()
			if tc.country == "" {
				delete(scan.Data, "countryIso2")
			} else {
				scan.Data["countryIso2"][0].Value = tc.country
			}
			checks := map[string]string{}
			_, ae := validateScannedIdentity(t.Context(), "cei", map[string][]byte{"cei_pdf": testPDF("CNP 5150315400013 Document RX123456")}, scan, checks)
			if tc.code == "" {
				if ae != nil || checks["document"] != "passed" {
					t.Fatalf("Romanian V2 card rejected: %v %v", ae, checks)
				}
			} else if ae == nil || ae.Code != tc.code {
				t.Fatalf("incorrect country diagnosis: %v", ae)
			}
		})
	}
}

func TestProviderDateFormats(t *testing.T) {
	for _, input := range []string{"2015/03/15", "2015-03-15"} {
		parsed, err := parseProviderDate(input)
		if err != nil || parsed.Format("2006-01-02") != "2015-03-15" {
			t.Fatalf("unsupported provider date %q: %v", input, err)
		}
	}
	for _, input := range []string{"2015/02/30", "15/03/2015", ""} {
		if _, err := parseProviderDate(input); err == nil {
			t.Fatalf("invalid date accepted: %q", input)
		}
	}
}

func TestSelfieVideoCanReplacePhotoAndIsForwarded(t *testing.T) {
	s, api, calls := identityHarness(t, scanFixture(), 200, 0)
	id := collectIdentity(t, api, "ci", nil)
	if _, err := s.DB().Exec("DELETE FROM identity_files WHERE session_id=? AND slot='selfie'", id); err != nil {
		t.Fatal(err)
	}
	video := append([]byte{0, 0, 0, 24}, []byte("ftypisomsynthetic-test-video")...)
	status, body := identityRequest(t, api, "/v1/auth/identity/"+id+"/files", map[string]any{"slot": "selfie_video", "content_type": "video/mp4", "content_base64": base64.StdEncoding.EncodeToString(video)})
	if status != 201 {
		t.Fatalf("video upload %d %v", status, body)
	}
	status, body = identityRequest(t, api, "/v1/auth/identity/"+id+"/complete", map[string]any{})
	if status != 200 || body["proof"] == nil || calls.Load() != 1 {
		t.Fatalf("video complete %d %v", status, body)
	}
	var remaining int
	s.DB().QueryRow("SELECT COUNT(*) FROM identity_files WHERE session_id=?", id).Scan(&remaining)
	if remaining != 0 {
		t.Fatal("video retained after verification")
	}
}
func TestVideoFileFormatBounds(t *testing.T) {
	if magicOK("selfie_video", []byte("not a video")) {
		t.Fatal("invalid video accepted")
	}
	if !magicOK("selfie_video", []byte{0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0}) {
		t.Fatal("webm rejected")
	}
	if validIdentityType("selfie_video", "image/jpeg") {
		t.Fatal("video slot accepts photographs")
	}
}
