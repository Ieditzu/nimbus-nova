package server

import (
	"context"
	"database/sql"
	"net/http"
	"sync"
	"time"
)

type Server struct {
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
	if err := st.SeedIfEmpty(); err != nil {
		_ = st.Close()
		return nil, err
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
	s := &Server{store: st}
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
