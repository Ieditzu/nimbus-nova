package server

import "time"

const paidWorkAge = 16

func volunteerOnlyAt(birth, now time.Time) bool {
	today := now.In(zoneEEST).Format("2006-01-02")
	return today < birth.AddDate(paidWorkAge, 0, 0).Format("2006-01-02")
}
func accountVolunteerOnly(birthText string, stored bool) bool {
	birth, err := time.Parse("2006-01-02", birthText)
	if err != nil {
		return stored
	}
	return volunteerOnlyAt(birth, time.Now())
}

var errVolunteerOnly = appErr(403, "volunteer_only", "Sub 16 ani poți participa doar la voluntariat, fără plată.")
