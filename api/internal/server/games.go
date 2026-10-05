package server

import (
	"context"
	"crypto/rand"
	"database/sql"
	"math/big"
	"net/http"
	"time"
)

type gameState struct {
	Streak         int    `json:"streak"`
	SpinsAvailable int    `json:"spins_available"`
	XP             int64  `json:"xp"`
	Level          int64  `json:"level"`
	LastDay        string `json:"last_day"`
}

func gameDay(now time.Time) string {
	zone, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		zone = zoneEEST
	}
	return now.In(zone).Format("2006-01-02")
}

// Visiting the app once per Romanian calendar day advances the streak exactly
// once. Every fifth consecutive day grants one spin; unused spins remain saved.
func (s *Store) TouchGameDay(userID string) error {
	return s.touchGameDayAt(userID, time.Now())
}

func (s *Store) touchGameDayAt(userID string, now time.Time) error {
	today := gameDay(now)
	return s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		var last string
		var streak, spins int
		err := conn.QueryRowContext(ctx, `SELECT last_day,streak,spins_available FROM game_streaks WHERE user_id=?`, userID).Scan(&last, &streak, &spins)
		if err == sql.ErrNoRows {
			_, err = conn.ExecContext(ctx, `INSERT INTO game_streaks(user_id,last_day,streak,spins_available) VALUES(?,?,1,0)`, userID, today)
			return err
		}
		if err != nil || last == today {
			return err
		}
		zone, zoneErr := time.LoadLocation("Europe/Bucharest")
		if zoneErr != nil {
			zone = zoneEEST
		}
		if last == now.In(zone).AddDate(0, 0, -1).Format("2006-01-02") {
			streak++
		} else {
			streak = 1
		}
		if streak%5 == 0 {
			spins++
		}
		_, err = conn.ExecContext(ctx, `UPDATE game_streaks SET last_day=?,streak=?,spins_available=? WHERE user_id=?`, today, streak, spins, userID)
		return err
	})
}

func (s *Store) TotalXP(userID string) (int64, error) {
	var reviewXP, spinXP int64
	if err := s.db.QueryRow(`SELECT COALESCE(SUM(CASE stars WHEN 5 THEN 250 WHEN 4 THEN 100 ELSE 0 END),0) FROM reviews WHERE subject_id=?`, userID).Scan(&reviewXP); err != nil {
		return 0, errInternal
	}
	if err := s.db.QueryRow(`SELECT COALESCE(SUM(xp),0) FROM game_spins WHERE user_id=?`, userID).Scan(&spinXP); err != nil {
		return 0, errInternal
	}
	return reviewXP + spinXP, nil
}

func (s *Store) GameState(userID string) (gameState, error) {
	var state gameState
	err := s.db.QueryRow(`SELECT last_day,streak,spins_available FROM game_streaks WHERE user_id=?`, userID).Scan(&state.LastDay, &state.Streak, &state.SpinsAvailable)
	if err != nil {
		return state, errInternal
	}
	state.XP, err = s.TotalXP(userID)
	if err != nil {
		return state, err
	}
	state.Level = 1 + state.XP/1000
	return state, nil
}

func (s *Store) Spin(userID string) (int64, error) {
	prizeIndex, err := rand.Int(rand.Reader, big.NewInt(5))
	if err != nil {
		return 0, errInternal
	}
	prize := int64(50 + 50*prizeIndex.Int64())
	err = s.withImmediate(func(ctx context.Context, conn *sql.Conn) error {
		result, err := conn.ExecContext(ctx, `UPDATE game_streaks SET spins_available=spins_available-1 WHERE user_id=? AND spins_available>0`, userID)
		if err != nil {
			return errInternal
		}
		count, err := result.RowsAffected()
		if err != nil {
			return errInternal
		}
		if count == 0 {
			return appErr(409, "no_spins", "Revino 5 zile la rând pentru o rotire.")
		}
		id, err := NewID("spn_")
		if err != nil {
			return errInternal
		}
		_, err = conn.ExecContext(ctx, `INSERT INTO game_spins(id,user_id,xp,created_at) VALUES(?,?,?,?)`, id, userID, prize, NowRFC3339())
		if err != nil {
			return errInternal
		}
		return nil
	})
	return prize, err
}

func (s *Server) handleGames(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireMember(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	if err := s.store.TouchGameDay(user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	state, err := s.store.GameState(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"games": state})
}

func (s *Server) handleGameSpin(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireMember(user); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	if err := s.store.TouchGameDay(user.ID); err != nil {
		s.writeErr(w, err)
		return
	}
	prize, err := s.store.Spin(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	state, err := s.store.GameState(user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"xp_won": prize, "games": state})
}
