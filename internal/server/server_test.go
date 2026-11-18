package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"ai-accounts-hub/internal/db"
	"ai-accounts-hub/internal/model"
)

func setupTestServer(t *testing.T) (*Server, *time.Time) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := db.Open(dbPath)
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	currentTime := time.Date(2026, 11, 17, 12, 0, 0, 0, time.UTC)
	srv := New(store, nil)
	srv.nowFn = func() time.Time { return currentTime }
	return srv, &currentTime
}

func TestAccountCRUDQuotaLifecycleAndBackupRoundtrip(t *testing.T) {
	srv, currentTime := setupTestServer(t)
	h := srv.Handler()

	// 1. Create account with shared Web+CLI quota
	payload := model.Account{
		Provider:     "Anthropic",
		Alias:        "Claude Pro Personal",
		Identifier:   "user@example.com",
		PlanName:     "Pro",
		BillingCycle: model.BillingMonthly,
		Cost:         20,
		Currency:     "USD",
		RenewalDate:  "2026-12-01",
		Models:       []string{"Claude 3.7 Sonnet", "Claude 3.5 Haiku"},
		Apps:         []string{"Web", "Claude Code CLI"},
		Quotas: []model.QuotaRule{
			{
				GroupName:   "Web + Claude Code",
				Label:       "Ventana 5h",
				ScopeType:   model.ScopeShared,
				Surfaces:    []string{"Web", "CLI"},
				Models:      []string{"Claude 3.7 Sonnet"},
				Unit:        "messages",
				LimitValue:  45,
				WindowType:  model.WindowRollingHours,
				WindowHours: 5,
			},
		},
	}

	body, _ := json.Marshal(payload)
	req := httptest.NewRequest(http.MethodPost, "/api/accounts", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var created model.Account
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created account: %v", err)
	}
	if created.ID == 0 || len(created.Quotas) != 1 {
		t.Fatalf("unexpected created account: %+v", created)
	}
	if created.Quotas[0].GroupName != "Web + Claude Code" || len(created.Quotas[0].Models) != 1 {
		t.Fatalf("expected group_name and models to persist, got %+v", created.Quotas[0])
	}
	quotaID := created.Quotas[0].ID

	// 2. Exhaust quota
	actionBody, _ := json.Marshal(model.QuotaActionRequest{Action: "exhaust_now"})
	req = httptest.NewRequest(http.MethodPost, "/api/quotas/"+strconv.FormatInt(quotaID, 10)+"/action", bytes.NewReader(actionBody))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("exhaust action failed: %d %s", rec.Code, rec.Body.String())
	}
	var updatedQuota model.QuotaRule
	_ = json.Unmarshal(rec.Body.Bytes(), &updatedQuota)
	if updatedQuota.Status != model.StatusCooldown || updatedQuota.RemainingSeconds != 5*3600 {
		t.Fatalf("expected 5h cooldown, got %+v", updatedQuota)
	}

	// 3. Advance clock past 5 hours and verify auto-reset persisted via GET /api/accounts
	*currentTime = currentTime.Add(5*time.Hour + time.Minute)
	req = httptest.NewRequest(http.MethodGet, "/api/accounts", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("list accounts failed: %d", rec.Code)
	}
	var accounts []model.Account
	_ = json.Unmarshal(rec.Body.Bytes(), &accounts)
	if len(accounts) != 1 || accounts[0].Quotas[0].Status != model.StatusAvailable || accounts[0].Quotas[0].UsedValue != 0 {
		t.Fatalf("expected quota to auto-reset after deadline, got %+v", accounts)
	}

	// 4. Export backup and re-import in replace mode
	req = httptest.NewRequest(http.MethodGet, "/api/export", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("export failed: %d", rec.Code)
	}
	exportedBytes := rec.Body.Bytes()

	req = httptest.NewRequest(http.MethodPost, "/api/import?mode=replace", bytes.NewReader(exportedBytes))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("import failed: %d %s", rec.Code, rec.Body.String())
	}

	// 5. Delete account
	req = httptest.NewRequest(http.MethodDelete, "/api/accounts/"+strconv.FormatInt(created.ID, 10), nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	// After replace-import, a fresh ID was generated, so verify stats still shows 1 account first.
	req = httptest.NewRequest(http.MethodGet, "/api/stats", nil)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var stats model.SummaryStats
	_ = json.Unmarshal(rec.Body.Bytes(), &stats)
	if stats.TotalAccounts != 1 || len(stats.CostByCurrency) != 1 || stats.CostByCurrency[0].MonthlyEquivalentTotal != 20 {
		t.Fatalf("unexpected stats after import: %+v", stats)
	}
}
