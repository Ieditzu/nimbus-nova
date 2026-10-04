package server

import (
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
	"unicode"
)

type limitedPDFText struct{ bytes.Buffer }

func (b *limitedPDFText) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 1_000_000 {
		return 0, io.ErrShortBuffer
	}
	return b.Buffer.Write(p)
}
func readerPDFText(ctx context.Context, data []byte) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "pdftotext", "-enc", "UTF-8", "-", "-")
	command.Stdin = bytes.NewReader(data)
	var output limitedPDFText
	command.Stdout = &output
	command.Stderr = io.Discard
	if command.Run() != nil {
		return nil, appErr(422, "document_unreadable", "PDF-ul CEI nu poate fi citit. Importă exportul original din RO CEI Reader.")
	}
	return output.Bytes(), nil
}
func compactDocumentNumber(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' {
			return -1
		}
		return unicode.ToUpper(r)
	}, value)
}
func parseProviderDate(value string) (time.Time, error) {
	// V2 documents dates as YYYY/MM/DD; some responses use ISO YYYY-MM-DD.
	parsed, err := time.Parse("2006/01/02", value)
	if err == nil {
		return parsed, nil
	}
	return time.Parse("2006-01-02", value)
}
func normalizeCNP(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || r == '-' || r == '<' {
			return -1
		}
		return r
	}, value)
}

var ocrCNPPattern = regexp.MustCompile(`[0-9](?:[ \t-]*[0-9]){12}`)

func cnpFromOCR(text string, birth time.Time) (string, bool) {
	value, valid, _ := inspectCNPOCR(text, birth)
	return value, valid
}
func inspectCNPOCR(text string, birth time.Time) (string, bool, bool) {
	candidates := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		for _, match := range ocrCNPPattern.FindAllStringIndex(line, -1) {
			// Do not extract a 13-digit substring from a longer number.
			if match[0] > 0 && line[match[0]-1] >= '0' && line[match[0]-1] <= '9' {
				continue
			}
			if match[1] < len(line) && line[match[1]] >= '0' && line[match[1]] <= '9' {
				continue
			}
			value := normalizeCNP(line[match[0]:match[1]])
			parsed, valid := parseCNP(value)
			if valid {
				if !parsed.Equal(birth) {
					return "", false, true
				}
				candidates[value] = true
			}
		}
	}
	if len(candidates) != 1 {
		return "", false, len(candidates) > 1
	}
	for value := range candidates {
		return value, true, false
	}
	return "", false, false
}
func readCNPFromImage(ctx context.Context, image []byte, birth time.Time) (string, bool) {
	if len(image) == 0 {
		return "", false
	}
	ctx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	run := func(data []byte, mode string, adaptive bool) (string, bool, bool) {
		args := []string{"stdin", "stdout", "-l", "eng", "--psm", mode, "--dpi", "300"}
		if adaptive {
			args = append(args, "-c", "thresholding_method=2")
		}
		attempt, stop := context.WithTimeout(ctx, 2*time.Second)
		defer stop()
		command := exec.CommandContext(attempt, "tesseract", args...)
		command.Env = append(os.Environ(), "OMP_THREAD_LIMIT=2")
		command.Stdin = bytes.NewReader(data)
		var output limitedPDFText
		command.Stdout = &output
		command.Stderr = io.Discard
		if command.Run() != nil {
			return "", false, false
		}
		return inspectCNPOCR(output.String(), birth)
	}
	for _, mode := range []string{"11", "6"} {
		value, ok, conflict := run(image, mode, false)
		if conflict {
			return "", false
		}
		if ok {
			return value, true
		}
	}
	// Work only on temporary OCR copies; the provider receives the original photo.
	for _, variant := range cnpOCRImages(image) {
		if ctx.Err() != nil {
			break
		}
		value, ok, conflict := run(variant, "11", true)
		if conflict {
			return "", false
		}
		if ok {
			return value, true
		}
	}
	return "", false
}
func validateScannedIdentity(ctx context.Context, kind string, files map[string][]byte, scan identityScan, checks map[string]string) (time.Time, *AppError) {
	if ae := scan.faceFailure(checks); ae != nil {
		return time.Time{}, ae
	}
	checks["face_match"] = "passed"
	checks["selfie"] = "passed"
	country, ok := scan.field("countryIso2")
	if !ok {
		return time.Time{}, appErr(422, "document_country_unreadable", "Țara emitentă nu a putut fi confirmată din act. Refă fotografiile întregului card. (DOCUMENT_COUNTRY_UNREADABLE)")
	}
	if country != "RO" {
		return time.Time{}, appErr(422, "document_country", "Este acceptat doar un act de identitate emis în România.")
	}
	documentType, ok := scan.field("documentType")
	if !ok || documentType != "I" {
		return time.Time{}, appErr(422, "document_type", "Adaugă o carte de identitate românească CI sau CEI.")
	}
	dob, ok := scan.field("dob")
	birth, err := parseProviderDate(dob)
	now := time.Now()
	if !ok || err != nil || birth.After(now) || birth.Before(now.AddDate(-120, 0, 0)) {
		return time.Time{}, appErr(422, "document_unreadable", "Data nașterii nu a putut fi confirmată din act.")
	}
	if expiry, ok := scan.field("expiry"); ok {
		expires, err := parseProviderDate(expiry)
		today := now.In(zoneEEST).Format("2006-01-02")
		if err != nil || expires.Format("2006-01-02") < today {
			return time.Time{}, appErr(422, "document_expired", "Actul este expirat sau data expirării nu poate fi confirmată.")
		}
	}
	documentNumber, ok := scan.field("documentNumber")
	if !ok {
		return time.Time{}, appErr(422, "document_unreadable", "Numărul actului nu a putut fi citit. Refă fotografiile.")
	}
	cnp, hasCNP := scan.field("personalNumber")
	if kind == "ci" && scan.Decision == "accept" {
		_, valid := parseCNP(cnp)
		if !hasCNP || !valid {
			cnp, hasCNP = readCNPFromImage(ctx, files["ci_front"], birth)
		}
	}
	if kind == "cei" {
		text, err := readerPDFText(ctx, files["cei_pdf"])
		if err != nil {
			return time.Time{}, err.(*AppError)
		}
		pdfBirth, valid := firstValidCNP(text)
		if !valid || !pdfBirth.Equal(birth) {
			return time.Time{}, appErr(422, "document_mismatch", "PDF-ul CEI nu corespunde datei nașterii citite din act.")
		}
		// If the card exposes its CNP, bind it exactly. Otherwise bind the PDF to its card number.
		if hasCNP {
			if !strings.Contains(string(text), cnp) {
				return time.Time{}, appErr(422, "document_mismatch", "PDF-ul CEI nu corespunde CNP-ului citit din act.")
			}
		} else if !strings.Contains(compactDocumentNumber(string(text)), compactDocumentNumber(documentNumber)) {
			return time.Time{}, appErr(422, "document_mismatch", "PDF-ul CEI nu corespunde numărului actului. Importă exportul original pentru acest CEI.")
		}
		checks["pdf"] = "passed"
	}
	if hasCNP {
		cnpBirth, valid := parseCNP(cnp)
		if !valid || !cnpBirth.Equal(birth) {
			return time.Time{}, appErr(422, "document_mismatch", "CNP-ul și data nașterii din act nu corespund.")
		}
	} else if kind == "ci" {
		return time.Time{}, appErr(422, "document_unreadable", "CNP-ul nu a putut fi confirmat nici după citirea OCR suplimentară. Încadrează CI-ul mai aproape, cu rândul CNP clar și toate colțurile vizibile. (CNP_OCR_UNREADABLE)")
	}
	checks["cnp"] = "passed"
	if scan.Decision != "accept" {
		return time.Time{}, appErr(422, "identity_review", "Actul nu a trecut toate verificările. Refă fotografiile clare ale actului și selfie-ul.")
	}
	for _, warning := range scan.Warning {
		if warning.Decision != "accept" {
			return time.Time{}, appErr(422, "identity_review", "Actul necesită o verificare suplimentară. Refă fotografiile.")
		}
	}
	checks["document"] = "passed"
	return birth, nil
}
