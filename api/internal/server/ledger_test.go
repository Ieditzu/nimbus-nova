package server

import "testing"

func TestPaymentBreakdownPreservesHeldLegacyPayments(t *testing.T) {
	for _, tc := range []struct {
		name                  string
		task, charged, policy int64
		wantFee, wantPay      int64
	}{
		{"new", 10000, 10500, 2, 500, 10000},
		{"new rounding", 110, 116, 2, 6, 110},
		{"legacy hold", 10000, 10000, 1, 1500, 8500},
		{"legacy tiny hold", 4, 4, 1, 1, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fee, payout := paymentBreakdown(tc.task, tc.charged, tc.policy)
			if fee != tc.wantFee || payout != tc.wantPay || fee+payout != tc.charged {
				t.Fatalf("fee=%d payout=%d for charge=%d", fee, payout, tc.charged)
			}
		})
	}
}
