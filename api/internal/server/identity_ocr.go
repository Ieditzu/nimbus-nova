package server

import (
	"bytes"
	"image"
	"image/color"
	_ "image/jpeg"
	"image/png"
)

// Bound decoded images before allocating, and never persist OCR working copies.
func cnpOCRImages(data []byte) [][]byte {
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 20_000_000 {
		return nil
	}
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	bounds := source.Bounds()
	// Normalize camera orientation without relying on EXIF being preserved.
	var result [][]byte
	for _, rotation := range []int{0, 90, 270, 180} {
		width, height := bounds.Dx(), bounds.Dy()
		if rotation == 90 || rotation == 270 {
			width, height = height, width
		}
		scale := 1.0
		if width > 2400 {
			scale = 2400.0 / float64(width)
		}
		if float64(height)*scale > 3200 {
			scale = 3200.0 / float64(height)
		}
		w, h := max(1, int(float64(width)*scale)), max(1, int(float64(height)*scale))
		gray := image.NewGray(image.Rect(0, 0, w, h))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				sx, sy := min(width-1, int(float64(x)/scale)), min(height-1, int(float64(y)/scale))
				switch rotation {
				case 90:
					sx, sy = sy, bounds.Dy()-1-sx
				case 270:
					sx, sy = bounds.Dx()-1-sy, sx
				case 180:
					sx, sy = bounds.Dx()-1-sx, bounds.Dy()-1-sy
				}
				gray.SetGray(x, y, color.GrayModel.Convert(source.At(bounds.Min.X+sx, bounds.Min.Y+sy)).(color.Gray))
			}
		}
		var encoded bytes.Buffer
		if png.Encode(&encoded, gray) == nil {
			result = append(result, encoded.Bytes())
		}
		if rotation == 0 {
			// Overlapping bands separate the small CNP row from portraits/background text.
			// Enlarge each band, retaining every original digit (no OCR substitutions).
			for _, band := range []image.Rectangle{image.Rect(0, h/5, w, 4*h/5), image.Rect(0, 0, w, 3*h/5)} {
				targetWidth := min(3200, w*2)
				factor := float64(targetWidth) / float64(w)
				target := image.NewGray(image.Rect(0, 0, targetWidth, int(float64(band.Dy())*factor)+24))
				for i := range target.Pix {
					target.Pix[i] = 255
				}
				for y := 12; y < target.Bounds().Dy()-12; y++ {
					for x := 0; x < targetWidth; x++ {
						target.SetGray(x, y, gray.GrayAt(min(w-1, int(float64(x)/factor)), min(band.Max.Y-1, band.Min.Y+int(float64(y-12)/factor))))
					}
				}
				encoded.Reset()
				if png.Encode(&encoded, target) == nil {
					result = append(result, bytes.Clone(encoded.Bytes()))
				}
			}
		}
	}
	return result
}
