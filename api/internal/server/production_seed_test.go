package server

import (
	"path/filepath"
	"testing"
)

func TestProductionRetiresOnlyBuiltInJobs(t *testing.T) {
	t.Setenv("IDANALYZER_KEY", "")
	t.Setenv("NOVA_DEMO", "1")
	path := filepath.Join(t.TempDir(), "nova.db")
	s, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.DB().Exec(`INSERT INTO tasks (id,poster_id,title,category,city,starts_at,ends_at,amount_bani,description,safety_note,status,created_at) SELECT 'task_real','poster-1',title,category,city,starts_at,ends_at,amount_bani,description,safety_note,'open',created_at FROM tasks WHERE id='task_seed_event_setup'`)
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	t.Setenv("NOVA_DEMO", "0")
	s, err = New(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var hidden, real int
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM tasks WHERE id IN ('task_seed_event_setup','task_seed_shop_cover') AND status='hidden'`).Scan(&hidden); err != nil || hidden != 2 {
		t.Fatalf("retired=%d: %v", hidden, err)
	}
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM tasks WHERE id='task_real' AND status='open'`).Scan(&real); err != nil || real != 1 {
		t.Fatalf("real=%d: %v", real, err)
	}
}

func TestFreshProductionHasNoSeedJobs(t *testing.T) {
	t.Setenv("IDANALYZER_KEY", "")
	t.Setenv("NOVA_DEMO", "0")
	s, err := New(filepath.Join(t.TempDir(), "nova.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	var count int
	if err := s.DB().QueryRow(`SELECT COUNT(*) FROM tasks`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("tasks=%d: %v", count, err)
	}
}
