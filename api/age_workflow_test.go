package main_test

import (
	"net/http"
	"testing"
	"time"
)

func TestExistingSixteenYearOldAccountAndUnderSixteenRestrictions(t *testing.T) {
	h := start(t)
	id, token := account(t, h, "age-worker@example.test", "+40700000003")
	today := time.Now().In(time.FixedZone("RO", 3*3600))
	birth := today.AddDate(-16, 0, 0).Format("2006-01-02")
	if _, err := h.DB.Exec(`UPDATE users SET role='worker',birth_date=?,volunteer_only=1 WHERE id=?`, birth, id); err != nil {
		t.Fatal(err)
	}
	status, raw := h.doBearer(http.MethodGet, "/v1/me", token, nil)
	if status != 200 || asMap(t, asMap(t, decode(t, raw))["user"])["volunteer_only"] != false {
		t.Fatalf("existing 16yo locked %d %s", status, raw)
	}
	own := makeJob(t, h, token)
	status, _ = h.doBearer(http.MethodDelete, "/v1/tasks/"+own, token, nil)
	if status != 200 {
		t.Fatalf("16yo cannot manage job %d", status)
	}
	status, raw = h.doBearer(http.MethodPost, "/v1/auth/login", "", map[string]any{"email": "age-worker@example.test", "password": "workflow-password-42"})
	if status != 200 || asMap(t, asMap(t, decode(t, raw))["user"])["volunteer_only"] != false {
		t.Fatalf("16yo login %d %s", status, raw)
	}
	if _, err := h.DB.Exec(`INSERT INTO profiles(user_id,skills_json,city,availability,bio) SELECT ?,skills_json,city,availability,bio FROM profiles WHERE user_id='worker-1'`, id); err != nil {
		t.Fatal(err)
	}
	_, ownerToken := account(t, h, "age-owner@example.test", "+40700000004")
	paid := makeJob(t, h, ownerToken)
	status, raw = h.doBearer(http.MethodPost, "/v1/tasks/"+paid+"/applications", token, map[string]any{"message": "Pot ajuta la acest job."})
	if status != 201 {
		t.Fatalf("16yo paid apply %d %s", status, raw)
	}
	application := asMap(t, asMap(t, decode(t, raw))["application"])["id"].(string)
	younger := today.AddDate(-15, 0, 0).Format("2006-01-02")
	if _, err := h.DB.Exec(`UPDATE users SET birth_date=?,volunteer_only=0 WHERE id=?`, younger, id); err != nil {
		t.Fatal(err)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks", token, cloneMap(t, "create-task-request.json"))
	if status != 403 {
		t.Fatalf("under16 publish %d", status)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/tasks/"+paid+"/applications", token, map[string]any{"message": "Pot ajuta la acest job."})
	if status != 403 {
		t.Fatalf("under16 paid apply %d", status)
	}
	status, _ = h.doBearer(http.MethodPost, "/v1/applications/"+application+"/accept", ownerToken, map[string]any{})
	if status != 403 {
		t.Fatalf("under16 paid accept %d", status)
	}
	body := cloneMap(t, "create-task-request.json")
	body["amount_bani"] = 0
	status, raw = h.doBearer(http.MethodPost, "/v1/tasks", ownerToken, body)
	if status != 201 {
		t.Fatalf("volunteer create %d %s", status, raw)
	}
	volunteer := asMap(t, asMap(t, decode(t, raw))["task"])["id"].(string)
	status, raw = h.doBearer(http.MethodPost, "/v1/tasks/"+volunteer+"/applications", token, map[string]any{"message": "Vreau să fac voluntariat."})
	if status != 201 {
		t.Fatalf("under16 volunteer apply %d %s", status, raw)
	}
	application = asMap(t, asMap(t, decode(t, raw))["application"])["id"].(string)
	status, raw = h.doBearer(http.MethodPost, "/v1/applications/"+application+"/accept", ownerToken, map[string]any{})
	if status != 200 {
		t.Fatalf("under16 volunteer accept %d %s", status, raw)
	}
}

func TestVerifiedRegistrationAgePolicy(t *testing.T) {
	h := start(t)
	for _, tc := range []struct {
		email, role string
		age         int
		volunteer   bool
	}{{"age15-register@example.test", "worker", 15, true}, {"age16-register@example.test", "poster", 16, false}, {"age17-register@example.test", "worker", 17, false}} {
		proof := verifiedProofFixture(t, h, tc.email)
		birth := time.Now().AddDate(-tc.age, 0, -1).Format("2006-01-02")
		if _, err := h.DB.Exec(`UPDATE identity_sessions SET birth_date=? WHERE email=?`, birth, tc.email); err != nil {
			t.Fatal(err)
		}
		body := map[string]any{"role": tc.role, "email": tc.email, "password": "workflow-password-42", "display_name": "Age Test", "identity_proof": proof, "phone_number": "+40700000003", "birth_date": "2000-01-01"}
		if tc.volunteer {
			status, _ := h.doBearer(http.MethodPost, "/v1/auth/register", "", body)
			if status != 400 {
				t.Fatalf("under16 without guardian %d", status)
			}
			body["guardian_email"] = "guardian@example.test"
		}
		status, raw := h.doBearer(http.MethodPost, "/v1/auth/register", "", body)
		if status != 201 || asMap(t, asMap(t, decode(t, raw))["user"])["volunteer_only"] != tc.volunteer {
			t.Fatalf("register age %d: %d %s", tc.age, status, raw)
		}
	}
}
