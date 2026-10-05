package server

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"sync"
	"time"
)

type Server struct {
	started time.Time
	store   *Store
	stop    context.CancelFunc
	cleanup sync.WaitGroup
}

func New(dbPath string) (*Server, error) {
	st, err := openStore(dbPath)
	if err != nil {
		return nil, err
	}
	if err := st.ensureAdminTables(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureChatTables(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureNotificationTables(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureAdminExtras(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureSupport(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureStripe(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.SeedIfEmpty(); err != nil {
		_ = st.Close()
		return nil, err
	}
	// Retire only the two built-in demo listings on existing production databases.
	// Keep dependent applications and conversations intact.
	if os.Getenv("NOVA_DEMO") != "1" {
		if _, err := st.db.Exec(`UPDATE tasks SET status='hidden' WHERE poster_id='poster-1' AND id IN ('task_seed_event_setup', 'task_seed_shop_cover') AND status!='hidden'`); err != nil {
			_ = st.Close()
			return nil, err
		}
	}
	email, password := adminEmailFromEnv()
	if err := st.EnsureAdmin(email, password); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.ensureMobileTestAccount(); err != nil {
		_ = st.Close()
		return nil, err
	}
	if err := st.pruneIdentityFiles(); err != nil {
		st.Close()
		return nil, err
	}
	s := &Server{store: st, started: time.Now()}
	ctx, cancel := context.WithCancel(context.Background())
	s.stop = cancel
	s.cleanup.Add(1)
	go func() {
		defer s.cleanup.Done()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				st.pruneIdentityFiles()
			}
		}
	}()
	s.cleanup.Add(1)
	go func() {
		defer s.cleanup.Done()
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if now.In(zoneEEST).Hour() == 9 && now.In(zoneEEST).Minute() == 0 {
					s.sendNearbyDigests(ctx, now)
				}
			}
		}
	}()
	return s, nil
}

func (s *Server) Handler() http.Handler {
	return withCORS(s.routes())
}

func (s *Server) Close() error {
	if s == nil || s.store == nil {
		return nil
	}
	if s.stop != nil {
		s.stop()
		s.cleanup.Wait()
	}
	return s.store.Close()
}

func (s *Server) DB() *sql.DB {
	return s.store.DB()
}
