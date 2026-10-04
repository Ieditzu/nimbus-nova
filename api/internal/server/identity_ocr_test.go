package server

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"os"
	"os/exec"
	"testing"
	"time"
)

func TestOCRRecoversRotatedSyntheticCNP(t *testing.T) {
	if _, err := exec.LookPath("tesseract"); err != nil {
		t.Skip("requires production Tesseract")
	}
	data, err := os.ReadFile("testdata/cnp-synthetic.png")
	if err != nil {
		t.Fatal(err)
	}
	original, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	b := original.Bounds()
	rotated := image.NewRGBA(image.Rect(0, 0, b.Dy(), b.Dx()))
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			rotated.Set(b.Dy()-1-y, x, original.At(x, y))
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, rotated); err != nil {
		t.Fatal(err)
	}
	birth, _ := time.Parse("2006-01-02", "2015-03-15")
	value, ok := readCNPFromImage(context.Background(), encoded.Bytes(), birth)
	if !ok || value != "5150315400013" {
		t.Fatal("rotated CNP could not be recovered")
	}
	wrongBirth := birth.AddDate(1, 0, 0)
	if _, ok := readCNPFromImage(context.Background(), encoded.Bytes(), wrongBirth); ok {
		t.Fatal("OCR accepted a different birth date")
	}
}

func TestOCRWorkingCopiesRejectInvalidImages(t *testing.T) {
	if variants := cnpOCRImages([]byte("not an image")); len(variants) != 0 {
		t.Fatal("invalid image produced OCR copies")
	}
}
