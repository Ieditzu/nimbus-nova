package server

import "testing"

func TestRedactTaskHidesExactCoordinates(t *testing.T) {
	worker := "user_worker"
	task := TaskPublic{
		ID: "task_1", PosterID: "user_poster", AssigneeID: &worker,
		Lat: 44.426767, Lng: 26.102538, Sector: "Sector 1", City: "București", County: "București",
	}
	for _, tc := range []struct {
		name   string
		viewer string
		exact  bool
	}{
		{"anonymous", "", false},
		{"other user", "user_other", false},
		{"poster", "user_poster", true},
		{"accepted worker", "user_worker", true},
	} {
		got := redactTask(task, tc.viewer)
		if tc.exact && (got.Lat != task.Lat || got.Lng != task.Lng) {
			t.Fatalf("%s should see exact coordinates, got %v,%v", tc.name, got.Lat, got.Lng)
		}
		if !tc.exact && (got.Lat != 0 || got.Lng != 0 || got.Sector != "" || got.City != task.City || got.County != task.County) {
			t.Fatalf("%s should see only county and locality, got %+v", tc.name, got)
		}
	}
}

func TestRedactTaskWithoutAssigneeKeepsOwnerExact(t *testing.T) {
	task := TaskPublic{PosterID: "user_poster", Lat: 44.426767, Lng: 26.102538}
	if got := redactTask(task, "user_poster"); got.Lat != task.Lat {
		t.Fatalf("poster lost exact coordinates: %v", got.Lat)
	}
	if got := redactTask(task, ""); got.Lat != 0 {
		t.Fatalf("anonymous saw %v", got.Lat)
	}
}

func TestRedactTasksDoesNotMutateInput(t *testing.T) {
	in := []TaskPublic{{PosterID: "p", Lat: 44.426767, Lng: 26.102538}}
	out := redactTasks(in, "")
	if in[0].Lat != 44.426767 || out[0].Lat != 0 {
		t.Fatalf("in=%v out=%v", in[0].Lat, out[0].Lat)
	}
}
