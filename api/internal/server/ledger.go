package server

import (
	"database/sql"
	"net/http"
)

func platformFee(amount int64) int64 {
	return (amount*15 + 50) / 100
}

type paymentView struct {
	TaskID           string `json:"task_id"`
	PayStatus        string `json:"pay_status"`
	AmountBani       int64  `json:"amount_bani"`
	PlatformFeeBani  int64  `json:"platform_fee_bani"`
	WorkerPayoutBani int64  `json:"worker_payout_bani"`
	Provider         string `json:"provider"`
}

func (s *Server) handlePay(w http.ResponseWriter, r *http.Request) {
	user, ae := s.currentUser(r)
	if ae != nil {
		writeAppError(w, ae)
		return
	}
	if ae = requireRole(user, "poster"); ae != nil {
		writeAppError(w, ae)
		return
	}
	if !s.readEmptyObject(w, r) {
		return
	}
	payment, err := s.store.Pay(r.PathValue("id"), user.ID)
	if err != nil {
		s.writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Payment paymentView `json:"payment"`
	}{Payment: payment})
}

func (s *Store) Pay(taskID, posterID string) (paymentView, error) {
	var owner, status, kind string
	var amount int64
	err := s.db.QueryRow(`SELECT poster_id, status, kind, amount_bani FROM tasks WHERE id = ?`, taskID).Scan(&owner, &status, &kind, &amount)
	if err == sql.ErrNoRows {
		return paymentView{}, errNotFound
	}
	if err != nil {
		return paymentView{}, errInternal
	}
	if owner != posterID {
		return paymentView{}, errForbidden
	}
	if kind == "volunteer" {
		return paymentView{}, errVolunteerUnpaid
	}
	if status != "assigned" {
		return paymentView{}, errTaskNotAssigned
	}
	var payStatus string
	err = s.db.QueryRow(`SELECT status FROM payment_intents WHERE task_id = ?`, taskID).Scan(&payStatus)
	if err == nil {
		return paymentView{}, errAlreadyPaid
	}
	if err != sql.ErrNoRows {
		return paymentView{}, errInternal
	}
	fee := platformFee(amount)
	id, err := NewID("pay_")
	if err != nil {
		return paymentView{}, errInternal
	}
	_, err = s.db.Exec(`INSERT INTO payment_intents (id, task_id, provider, status, amount_bani) VALUES (?, ?, 'simulated', 'held', ?)`, id, taskID, amount)
	if err != nil {
		return paymentView{}, errInternal
	}
	if _, err := s.db.Exec(`UPDATE tasks SET pay_status = 'held' WHERE id = ?`, taskID); err != nil {
		return paymentView{}, errInternal
	}
	now := NowRFC3339()
	for _, row := range []struct {
		account, direction string
		amount             int64
	}{
		{"poster", "debit", amount},
		{"escrow", "credit", amount},
	} {
		id, err := NewID("led_")
		if err != nil {
			return paymentView{}, errInternal
		}
		if _, err := s.db.Exec(`INSERT INTO ledger_entries (id, task_id, account, direction, amount_bani, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, taskID, row.account, row.direction, row.amount, now); err != nil {
			return paymentView{}, errInternal
		}
	}
	return paymentView{
		TaskID: taskID, PayStatus: "held", AmountBani: amount,
		PlatformFeeBani: fee, WorkerPayoutBani: amount - fee, Provider: "simulated",
	}, nil
}

func (s *Store) releaseIfHeld(taskID string) error {
	var amount int64
	var status string
	err := s.db.QueryRow(`SELECT amount_bani, status FROM payment_intents WHERE task_id = ?`, taskID).Scan(&amount, &status)
	if err == sql.ErrNoRows || status != "held" {
		return nil
	}
	if err != nil {
		return errInternal
	}
	fee := platformFee(amount)
	payout := amount - fee
	now := NowRFC3339()
	rows := []struct {
		account, direction string
		amount             int64
	}{
		{"escrow", "debit", amount},
		{"worker", "credit", payout},
		{"platform", "credit", fee},
	}
	for _, row := range rows {
		id, err := NewID("led_")
		if err != nil {
			return errInternal
		}
		if _, err := s.db.Exec(`INSERT INTO ledger_entries (id, task_id, account, direction, amount_bani, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
			id, taskID, row.account, row.direction, row.amount, now); err != nil {
			return errInternal
		}
	}
	if _, err := s.db.Exec(`UPDATE payment_intents SET status = 'released' WHERE task_id = ?`, taskID); err != nil {
		return errInternal
	}
	if _, err := s.db.Exec(`UPDATE tasks SET pay_status = 'released' WHERE id = ?`, taskID); err != nil {
		return errInternal
	}
	return nil
}
