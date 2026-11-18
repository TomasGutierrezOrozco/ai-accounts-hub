package quotas

import (
	"testing"
	"time"

	"ai-accounts-hub/internal/model"
)

func TestEvaluateQuotaAutoResetsWhenDeadlinePassed(t *testing.T) {
	base := time.Date(2026, 11, 17, 14, 0, 0, 0, time.UTC)
	q := model.QuotaRule{
		LimitValue:      45,
		UsedValue:       45,
		WindowType:      model.WindowRollingHours,
		WindowHours:     5,
		WindowStartedAt: base.Add(-6 * time.Hour).Format(time.RFC3339),
		ResetsAt:        base.Add(-1 * time.Hour).Format(time.RFC3339),
	}

	changed := EvaluateQuota(&q, base)
	if !changed {
		t.Fatalf("expected expired quota to report changed=true")
	}
	if q.UsedValue != 0 || q.ResetsAt != "" || q.WindowStartedAt != "" {
		t.Fatalf("expected reset fields to be cleared, got used=%v resets=%q", q.UsedValue, q.ResetsAt)
	}
	if q.Status != model.StatusAvailable {
		t.Fatalf("expected status available after reset, got %s", q.Status)
	}
}

func TestApplyActionIncrementAndWarningThreshold(t *testing.T) {
	now := time.Date(2026, 11, 17, 10, 0, 0, 0, time.UTC)
	q := model.QuotaRule{
		LimitValue:  50,
		WindowType:  model.WindowRollingHours,
		WindowHours: 5,
	}

	if err := ApplyAction(&q, model.QuotaActionRequest{Action: "increment", Delta: 40}, now); err != nil {
		t.Fatalf("increment failed: %v", err)
	}
	if q.Status != model.StatusWarning {
		t.Fatalf("expected warning at 80%% usage, got %s (pct=%v)", q.Status, q.UsagePercent)
	}
	if q.ResetsAt == "" {
		t.Fatalf("expected rolling window to start on first increment")
	}
	expectedReset := now.Add(5 * time.Hour).Format(time.RFC3339)
	if q.ResetsAt != expectedReset {
		t.Fatalf("expected ResetsAt=%s, got %s", expectedReset, q.ResetsAt)
	}
}

func TestApplyActionExhaustWithExactClockTimeRollover(t *testing.T) {
	loc := time.FixedZone("COT", -5*3600)
	now := time.Date(2026, 11, 17, 21, 30, 0, 0, loc)
	q := model.QuotaRule{
		LimitValue:  45,
		WindowType:  model.WindowRollingHours,
		WindowHours: 5,
	}

	// 02:00 is earlier than 21:30, so it must schedule for 02:00 the next day.
	if err := ApplyAction(&q, model.QuotaActionRequest{Action: "exhaust_now", UntilTime: "02:00"}, now); err != nil {
		t.Fatalf("exhaust_now with until_time failed: %v", err)
	}
	if q.Status != model.StatusCooldown {
		t.Fatalf("expected cooldown status, got %s", q.Status)
	}
	expectedTarget := time.Date(2026, 11, 18, 2, 0, 0, 0, loc).UTC().Format(time.RFC3339)
	if q.ResetsAt != expectedTarget {
		t.Fatalf("expected ResetsAt=%s, got %s", expectedTarget, q.ResetsAt)
	}
	if q.RemainingSeconds != 4*3600+30*60 {
		t.Fatalf("expected 16200 remaining seconds, got %d", q.RemainingSeconds)
	}
}

func TestMonthlyResetClampsShortMonths(t *testing.T) {
	now := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)
	next := nextMonthlyReset(31, now)
	if next.Month() != time.February || next.Day() != 28 {
		t.Fatalf("expected Feb 28 for non-leap year day 31, got %s", next.Format("2006-01-02"))
	}
}

func TestWeeklyQuotaRollingAndFixedWeekday(t *testing.T) {
	// 2026-11-17 is a Tuesday.
	loc := time.UTC
	now := time.Date(2026, 11, 17, 15, 0, 0, 0, loc)

	rolling := model.QuotaRule{
		LimitValue:     100,
		WindowType:     model.WindowWeeklyCycle,
		WeeklyResetDay: 0,
	}
	if err := ApplyAction(&rolling, model.QuotaActionRequest{Action: "exhaust_now"}, now); err != nil {
		t.Fatalf("weekly rolling exhaust failed: %v", err)
	}
	expectedRolling := now.Add(7 * 24 * time.Hour).Format(time.RFC3339)
	if rolling.ResetsAt != expectedRolling {
		t.Fatalf("expected 7-day reset %s, got %s", expectedRolling, rolling.ResetsAt)
	}

	// WeeklyResetDay=1 (Monday) at 09:00 from Tuesday Nov 17 must target Monday Nov 23 09:00.
	fixed := model.QuotaRule{
		LimitValue:     50,
		WindowType:     model.WindowWeeklyCycle,
		WeeklyResetDay: 1,
		DailyResetTime: "09:00",
	}
	if err := ApplyAction(&fixed, model.QuotaActionRequest{Action: "set_usage", Value: 10}, now); err != nil {
		t.Fatalf("weekly fixed set_usage failed: %v", err)
	}
	expectedMonday := time.Date(2026, 11, 23, 9, 0, 0, 0, loc).Format(time.RFC3339)
	if fixed.ResetsAt != expectedMonday {
		t.Fatalf("expected Monday reset %s, got %s", expectedMonday, fixed.ResetsAt)
	}

	// Exact date+time override (Thursday Nov 19 at 18:30).
	if err := ApplyAction(&fixed, model.QuotaActionRequest{Action: "exhaust_now", UntilTime: "2026-11-19T18:30"}, now); err != nil {
		t.Fatalf("weekly exact date+time failed: %v", err)
	}
	expectedExact := time.Date(2026, 11, 19, 18, 30, 0, 0, loc).Format(time.RFC3339)
	if fixed.ResetsAt != expectedExact {
		t.Fatalf("expected exact reset %s, got %s", expectedExact, fixed.ResetsAt)
	}
}

func TestComputeSummaryStatsByCurrency(t *testing.T) {
	accounts := []model.Account{
		{
			BillingCycle: model.BillingMonthly,
			Cost:         20,
			Currency:     "USD",
			Models:       []string{"GPT-4o", "o3-mini"},
			Quotas: []model.QuotaRule{
				{Status: model.StatusAvailable},
			},
		},
		{
			BillingCycle: model.BillingAnnual,
			Cost:         120,
			Currency:     "USD",
			Models:       []string{"Claude 3.7 Sonnet", "GPT-4o"},
			Quotas: []model.QuotaRule{
				{Status: model.StatusCooldown},
			},
		},
		{
			BillingCycle: model.BillingPrepaid,
			Cost:         15,
			Currency:     "EUR",
			Models:       []string{"DeepSeek V3"},
			Quotas: []model.QuotaRule{
				{Status: model.StatusWarning},
			},
		},
	}

	stats := ComputeSummaryStats(accounts)
	if stats.TotalAccounts != 3 || stats.TotalQuotas != 3 {
		t.Fatalf("unexpected totals: %+v", stats)
	}
	if stats.AvailableQuotas != 1 || stats.WarningQuotas != 1 || stats.CooldownQuotas != 1 {
		t.Fatalf("unexpected quota counts: %+v", stats)
	}
	if len(stats.DistinctModels) != 4 {
		t.Fatalf("expected 4 distinct models, got %v", stats.DistinctModels)
	}
	if len(stats.CostByCurrency) != 2 {
		t.Fatalf("expected 2 currency summaries, got %d", len(stats.CostByCurrency))
	}

	// Sorted alphabetically: EUR first, USD second.
	usd := stats.CostByCurrency[1]
	if usd.Currency != "USD" || usd.MonthlyEquivalentTotal != 30 || usd.AnnualProjectedTotal != 360 {
		t.Fatalf("unexpected USD totals: %+v", usd)
	}
}

func TestApplyActionSetUsageWithCustomHoursAndUntilTime(t *testing.T) {
	now := time.Date(2026, 11, 17, 20, 0, 0, 0, time.UTC)
	q := model.QuotaRule{
		Unit:        "percent",
		LimitValue:  100,
		WindowType:  model.WindowRollingHours,
		WindowHours: 5,
	}

	if err := ApplyAction(&q, model.QuotaActionRequest{
		Action:      "set_usage",
		Value:       35,
		CustomHours: 2.25,
	}, now); err != nil {
		t.Fatalf("set_usage with custom_hours failed: %v", err)
	}
	if q.UsedValue != 35 || q.RemainingSeconds != 8100 || q.Status != model.StatusAvailable {
		t.Fatalf("unexpected quota state after custom_hours: %+v", q)
	}

	if err := ApplyAction(&q, model.QuotaActionRequest{
		Action:    "set_usage",
		Value:     45,
		UntilTime: "23:30",
	}, now); err != nil {
		t.Fatalf("set_usage with until_time failed: %v", err)
	}
	if q.UsedValue != 45 || q.RemainingSeconds != 12600 {
		t.Fatalf("expected 3h30m (12600s) remaining, got %d (used=%.0f)", q.RemainingSeconds, q.UsedValue)
	}
}

func TestComputeActivityStatsStreaksModelsAndHeatmap(t *testing.T) {
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	accounts := []model.Account{
		{
			ID:           1,
			Provider:     "Google",
			Alias:        "Estudiantil",
			BillingCycle: model.BillingMonthly,
			Cost:         20000,
			Currency:     "COP",
			Quotas: []model.QuotaRule{
				{WindowType: model.WindowWeeklyCycle, LimitValue: 100, UsedValue: 20, UsagePercent: 20},
			},
		},
		{
			ID:           2,
			Provider:     "Google",
			Alias:        "Backup",
			BillingCycle: model.BillingAnnual,
			Cost:         15000,
			Currency:     "COP",
		},
	}

	events := []model.QuotaEvent{
		{
			AccountID:         1,
			AccountAlias:      "Estudiantil",
			Provider:          "Google",
			GroupName:         "IDE",
			Surfaces:          []string{"CLI", "IDE"},
			Models:            []string{"Gemini 4 Argon", "Claude Sonnet 5.5"},
			DeltaPercent:      40,
			UsagePercentAfter: 40,
			Action:            "set_usage",
			ModelUsed:         "Gemini 4 Argon",
			EventDate:         "2026-11-16",
			CreatedAt:         "2026-11-16T15:00:00Z",
		},
		{
			AccountID:         1,
			AccountAlias:      "Estudiantil",
			Provider:          "Google",
			GroupName:         "IDE",
			Surfaces:          []string{"CLI"},
			Models:            []string{"Claude Sonnet 5.5", "Claude Opus 5.5"},
			DeltaPercent:      60,
			UsagePercentAfter: 100,
			Action:            "exhaust_now",
			EventDate:         "2026-11-17",
			CreatedAt:         "2026-11-17T16:00:00Z",
		},
		{
			AccountID:         1,
			AccountAlias:      "Estudiantil",
			Provider:          "Google",
			GroupName:         "Web",
			Surfaces:          []string{"Web"},
			Models:            []string{"Gemini 4 Argon"},
			DeltaPercent:      25,
			UsagePercentAfter: 25,
			Action:            "set_usage",
			EventDate:         "2026-11-18",
			CreatedAt:         "2026-11-18T10:00:00Z",
		},
	}

	stats := ComputeActivityStats(accounts, events, 30, now)
	if stats.CurrentStreak != 3 || stats.LongestStreak != 3 {
		t.Fatalf("expected 3-day streak, got current=%d longest=%d", stats.CurrentStreak, stats.LongestStreak)
	}
	if stats.ActiveDays30d != 3 || stats.Events30d != 3 || stats.CooldownsHit30d != 1 {
		t.Fatalf("unexpected 30d counts: %+v", stats)
	}
	if stats.TopAccount != "Estudiantil" || stats.WeeklyHeadroom != 80 {
		t.Fatalf("unexpected top account/headroom: %+v", stats)
	}
	if len(stats.Heatmap) < 365 || stats.Heatmap[len(stats.Heatmap)-1].Date != "2026-11-18" || stats.Heatmap[len(stats.Heatmap)-1].Level == 0 {
		t.Fatalf("expected heatmap ending today with active level > 0, got len=%d last=%+v", len(stats.Heatmap), stats.Heatmap[len(stats.Heatmap)-1])
	}
	if len(stats.TopModels) == 0 || stats.TopModels[0].Model != "Gemini 4 Argon" || stats.TopModels[0].TotalPercent != 65 {
		t.Fatalf("expected Gemini 4 Argon top model with 65%% weighted usage, got %+v", stats.TopModels)
	}
	if len(stats.AccountUsage30d) != 2 || stats.AccountUsage30d[0].Events != 3 || stats.AccountUsage30d[1].Events != 0 {
		t.Fatalf("expected per-account breakdown including 0-event account, got %+v", stats.AccountUsage30d)
	}
}
