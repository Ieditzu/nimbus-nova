package server

import (
	"testing"
	"time"
)

func TestPaidWorkStartsOnSixteenthBirthday(t *testing.T) {
	birth, _ := time.Parse("2006-01-02", "2010-10-04")
	for _, tc := range []struct {
		now       string
		volunteer bool
	}{{"2026-10-03T23:59:59+03:00", true}, {"2026-10-04T00:00:00+03:00", false}, {"2027-10-04T00:00:00+03:00", false}} {
		now, _ := time.Parse(time.RFC3339, tc.now)
		if got := volunteerOnlyAt(birth, now); got != tc.volunteer {
			t.Fatalf("at %s volunteer=%v", tc.now, got)
		}
	}
}
