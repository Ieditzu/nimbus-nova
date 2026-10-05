package server

import (
	"path/filepath"
	"testing"
	"time"
)

func TestDailyStreakGrantsOneSpinOnFifthDay(t *testing.T) {
	t.Setenv("NOVA_DEMO", "1")
	store, err := openStore(filepath.Join(t.TempDir(), "games.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.SeedIfEmpty(); err != nil {
		t.Fatal(err)
	}
	zone, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		t.Fatal(err)
	}
	for day := 1; day <= 5; day++ {
		date := time.Date(2026, 10, day, 12, 0, 0, 0, zone)
		if err := store.touchGameDayAt("worker-1", date); err != nil {
			t.Fatal(err)
		}
		if err := store.touchGameDayAt("worker-1", date); err != nil {
			t.Fatal(err)
		}
	}
	state, err := store.GameState("worker-1")
	if err != nil {
		t.Fatal(err)
	}
	if state.Streak != 5 || state.SpinsAvailable != 1 {
		t.Fatalf("state=%+v", state)
	}
	prize, err := store.Spin("worker-1")
	if err != nil || prize < 50 || prize > 250 || prize%50 != 0 {
		t.Fatalf("prize=%d err=%v", prize, err)
	}
	if _, err := store.Spin("worker-1"); err == nil {
		t.Fatal("second spin should be rejected")
	}
	state, err = store.GameState("worker-1")
	if err != nil {
		t.Fatal(err)
	}
	if state.SpinsAvailable != 0 || state.XP != prize {
		t.Fatalf("state=%+v", state)
	}
	date := time.Date(2026, 10, 7, 12, 0, 0, 0, zone)
	if err := store.touchGameDayAt("worker-1", date); err != nil {
		t.Fatal(err)
	}
	state, err = store.GameState("worker-1")
	if err != nil || state.Streak != 1 {
		t.Fatalf("reset state=%+v err=%v", state, err)
	}
}

func TestReviewXPAddsToPublicProgress(t *testing.T) {
	t.Setenv("NOVA_DEMO", "1")
	store, err := openStore(filepath.Join(t.TempDir(), "reviews.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.SeedIfEmpty(); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		id, task string
		stars    int
	}{
		{"review_five", "task_seed_event_setup", 5},
		{"review_four", "task_seed_shop_cover", 4},
	} {
		if _, err := store.db.Exec(`INSERT INTO reviews(id,task_id,author_id,subject_id,stars,text,created_at) VALUES(?,?,'poster-1','worker-1',?,'Test',?)`, row.id, row.task, row.stars, NowRFC3339()); err != nil {
			t.Fatal(err)
		}
	}
	xp, err := store.TotalXP("worker-1")
	if err != nil || xp != 350 {
		t.Fatalf("xp=%d err=%v", xp, err)
	}
}
