package server

import (
	"database/sql"
	"net/http"
)

type Server struct {
	store *Store
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
	return &Server{store: st}, nil
}

func (s *Server) Handler() http.Handler {
	return withCORS(s.routes())
}

func (s *Server) Close() error {
	if s == nil || s.store == nil {
		return nil
	}
	return s.store.Close()
}

func (s *Server) DB() *sql.DB {
	return s.store.DB()
}
