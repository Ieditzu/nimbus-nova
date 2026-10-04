package server

import (
	"bytes"
	"context"
	"io"
	"os/exec"
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
func validateScannedIdentity(ctx context.Context, kind string, files map[string][]byte, scan identityScan, checks map[string]string) (time.Time, *AppError) {
	if !scan.facePassed() {
		checks["face_match"] = "failed"
		checks["selfie"] = "failed"
		return time.Time{}, appErr(422, "identity_rejected", "Selfie-ul nu a confirmat identitatea. Fă o fotografie nouă, clară, cu fața întreagă și fără reflexii.")
	}
	checks["face_match"] = "passed"
	checks["selfie"] = "passed"
	country, ok := scan.field("issuerOrgIso2")
	if !ok || country != "RO" {
		return time.Time{}, appErr(422, "document_country", "Este acceptat doar un act de identitate emis în România.")
	}
	documentType, ok := scan.field("documentType")
	if !ok || documentType != "I" {
		return time.Time{}, appErr(422, "document_type", "Adaugă o carte de identitate românească CI sau CEI.")
	}
	dob, ok := scan.field("dob")
	birth, err := time.Parse("2006-01-02", dob)
	now := time.Now()
	if !ok || err != nil || birth.After(now) || birth.Before(now.AddDate(-120, 0, 0)) {
		return time.Time{}, appErr(422, "document_unreadable", "Data nașterii nu a putut fi confirmată din act.")
	}
	if expiry, ok := scan.field("expiry"); ok {
		expires, err := time.Parse("2006-01-02", expiry)
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
		return time.Time{}, appErr(422, "document_unreadable", "CNP-ul nu a putut fi citit din CI. Refă fotografiile fără reflexii.")
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
