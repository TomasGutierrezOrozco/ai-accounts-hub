package quotas

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"ai-accounts-hub/internal/model"
)

// EvaluateQuota checks reset deadlines and recomputes status, usage percentage, and remaining seconds.
func EvaluateQuota(q *model.QuotaRule, now time.Time) bool {
	changed := false
	if q.ResetsAt != "" {
		resetsAt, err := time.Parse(time.RFC3339, q.ResetsAt)
		if err != nil {
			q.ResetsAt = ""
			q.WindowStartedAt = ""
			q.RemainingSeconds = 0
			changed = true
		} else if !now.Before(resetsAt) {
			q.UsedValue = 0
			q.WindowStartedAt = ""
			q.ResetsAt = ""
			q.RemainingSeconds = 0
			changed = true
		} else {
			diff := resetsAt.Sub(now)
			q.RemainingSeconds = int64(math.Ceil(diff.Seconds()))
		}
	} else {
		q.RemainingSeconds = 0
	}

	if q.LimitValue > 0 {
		pct := (q.UsedValue / q.LimitValue) * 100
		if pct < 0 {
			pct = 0
		} else if pct > 100 {
			pct = 100
		}
		q.UsagePercent = math.Round(pct*10) / 10
	} else {
		q.UsagePercent = 0
	}

	if (q.LimitValue > 0 && q.UsedValue >= q.LimitValue) || (q.LimitValue == 0 && q.RemainingSeconds > 0) {
		q.Status = model.StatusCooldown
	} else if q.UsagePercent >= 80 {
		q.Status = model.StatusWarning
	} else {
		q.Status = model.StatusAvailable
	}

	return changed
}

// ApplyAction mutates quota usage or timers according to an explicit user command.
func ApplyAction(q *model.QuotaRule, req model.QuotaActionRequest, now time.Time) error {
	switch req.Action {
	case "increment":
		delta := req.Delta
		if delta == 0 {
			delta = 1
		}
		q.UsedValue += delta
		if q.UsedValue < 0 {
			q.UsedValue = 0
		}
		if q.LimitValue > 0 && q.UsedValue > q.LimitValue {
			q.UsedValue = q.LimitValue
		}
		if q.UsedValue > 0 && q.ResetsAt == "" {
			startWindow(q, now)
		} else if q.UsedValue == 0 {
			q.WindowStartedAt = ""
			q.ResetsAt = ""
		}

	case "set_usage":
		if req.Value < 0 {
			return errors.New("usage value cannot be negative")
		}
		q.UsedValue = req.Value
		appliedExplicit, err := applyExplicitResetTimer(q, req, now)
		if err != nil {
			return err
		}
		if !appliedExplicit {
			if q.UsedValue == 0 {
				q.WindowStartedAt = ""
				q.ResetsAt = ""
			} else if q.ResetsAt == "" {
				startWindow(q, now)
			}
		}

	case "exhaust_now":
		if q.LimitValue > 0 {
			q.UsedValue = q.LimitValue
		} else {
			q.UsedValue = 1
		}
		appliedExplicit, err := applyExplicitResetTimer(q, req, now)
		if err != nil {
			return err
		}
		if !appliedExplicit {
			startWindow(q, now)
		}

	case "reset_now":
		q.UsedValue = 0
		q.WindowStartedAt = ""
		q.ResetsAt = ""

	default:
		return fmt.Errorf("unknown quota action: %s", req.Action)
	}

	EvaluateQuota(q, now)
	return nil
}

func applyExplicitResetTimer(q *model.QuotaRule, req model.QuotaActionRequest, now time.Time) (bool, error) {
	if strings.TrimSpace(req.UntilTime) != "" {
		target, err := parseNextClockTime(req.UntilTime, now)
		if err != nil {
			return false, err
		}
		q.WindowStartedAt = now.UTC().Format(time.RFC3339)
		q.ResetsAt = target.UTC().Format(time.RFC3339)
		return true, nil
	}
	if req.CustomHours > 0 {
		secs := math.Round(req.CustomHours * 3600)
		if secs < 1 {
			secs = 1
		}
		q.WindowStartedAt = now.UTC().Format(time.RFC3339)
		q.ResetsAt = now.Add(time.Duration(secs) * time.Second).UTC().Format(time.RFC3339)
		return true, nil
	}
	return false, nil
}

func startWindow(q *model.QuotaRule, now time.Time) {
	switch q.WindowType {
	case model.WindowRollingHours:
		hours := q.WindowHours
		if hours <= 0 {
			hours = 5
		}
		q.WindowStartedAt = now.UTC().Format(time.RFC3339)
		q.ResetsAt = now.Add(time.Duration(hours * float64(time.Hour))).UTC().Format(time.RFC3339)

	case model.WindowDailyFixed:
		clock := q.DailyResetTime
		if strings.TrimSpace(clock) == "" {
			clock = "00:00"
		}
		target, err := parseNextClockTime(clock, now)
		if err != nil {
			target = now.Add(24 * time.Hour)
		}
		q.WindowStartedAt = now.UTC().Format(time.RFC3339)
		q.ResetsAt = target.UTC().Format(time.RFC3339)

	case model.WindowWeeklyCycle:
		if q.WeeklyResetDay >= 1 && q.WeeklyResetDay <= 7 {
			target := nextWeeklyReset(q.WeeklyResetDay, q.DailyResetTime, now)
			q.WindowStartedAt = now.UTC().Format(time.RFC3339)
			q.ResetsAt = target.UTC().Format(time.RFC3339)
		} else {
			q.WindowStartedAt = now.UTC().Format(time.RFC3339)
			q.ResetsAt = now.Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339)
		}

	case model.WindowMonthlyCycle:
		day := q.MonthlyResetDay
		if day < 1 {
			day = 1
		} else if day > 31 {
			day = 31
		}
		target := nextMonthlyReset(day, now)
		q.WindowStartedAt = now.UTC().Format(time.RFC3339)
		q.ResetsAt = target.UTC().Format(time.RFC3339)

	case model.WindowManualOnly:
		// Manual-only quotas track usage or prepaid credits without auto-expiring timers.
	}
}

func parseNextClockTime(input string, now time.Time) (time.Time, error) {
	trimmed := strings.TrimSpace(input)
	if strings.Contains(trimmed, "T") {
		if target, err := time.Parse(time.RFC3339Nano, trimmed); err == nil {
			if !target.After(now) {
				return time.Time{}, errors.New("reset date/time must be in the future")
			}
			return target, nil
		}
		for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02T15:04"} {
			if target, err := time.ParseInLocation(layout, trimmed, now.Location()); err == nil {
				if !target.After(now) {
					return time.Time{}, errors.New("reset date/time must be in the future")
				}
				return target, nil
			}
		}
		return time.Time{}, errors.New("invalid date/time format, use RFC3339 or YYYY-MM-DDTHH:MM")
	}

	parts := strings.Split(trimmed, ":")
	if len(parts) != 2 {
		return time.Time{}, errors.New("invalid time format, use HH:MM")
	}
	hh, err := strconv.Atoi(parts[0])
	if err != nil || hh < 0 || hh > 23 {
		return time.Time{}, errors.New("invalid hour, must be between 00 and 23")
	}
	mm, err := strconv.Atoi(parts[1])
	if err != nil || mm < 0 || mm > 59 {
		return time.Time{}, errors.New("invalid minutes, must be between 00 and 59")
	}
	loc := now.Location()
	candidate := time.Date(now.Year(), now.Month(), now.Day(), hh, mm, 0, 0, loc)
	if !candidate.After(now) {
		candidate = candidate.AddDate(0, 0, 1)
	}
	return candidate, nil
}

func nextWeeklyReset(weekdayNum int, clock string, now time.Time) time.Time {
	hh, mm := 0, 0
	if parts := strings.Split(strings.TrimSpace(clock), ":"); len(parts) == 2 {
		if parsedH, err := strconv.Atoi(parts[0]); err == nil && parsedH >= 0 && parsedH <= 23 {
			hh = parsedH
		}
		if parsedM, err := strconv.Atoi(parts[1]); err == nil && parsedM >= 0 && parsedM <= 59 {
			mm = parsedM
		}
	}

	// Schema maps 1..7 (Mon..Sun) while Go time.Weekday uses 0..6 (Sun..Sat).
	targetWeekday := time.Weekday(weekdayNum % 7)
	daysAhead := (int(targetWeekday) - int(now.Weekday()) + 7) % 7
	loc := now.Location()
	candidate := time.Date(now.Year(), now.Month(), now.Day()+daysAhead, hh, mm, 0, 0, loc)
	if !candidate.After(now) {
		candidate = candidate.AddDate(0, 0, 7)
	}
	return candidate
}

func nextMonthlyReset(targetDay int, now time.Time) time.Time {
	loc := now.Location()
	clampedThisMonth := clampDayInMonth(now.Year(), now.Month(), targetDay)
	candidate := time.Date(now.Year(), now.Month(), clampedThisMonth, 0, 0, 0, 0, loc)
	if !candidate.After(now) {
		nextMonth := now.AddDate(0, 1, 0)
		// Normalize via first of next month to avoid month-end overflow skipping February.
		firstOfCurrent := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, loc)
		nextMonth = firstOfCurrent.AddDate(0, 1, 0)
		clampedNext := clampDayInMonth(nextMonth.Year(), nextMonth.Month(), targetDay)
		candidate = time.Date(nextMonth.Year(), nextMonth.Month(), clampedNext, 0, 0, 0, 0, loc)
	}
	return candidate
}

func clampDayInMonth(year int, month time.Month, day int) int {
	lastDay := time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > lastDay {
		return lastDay
	}
	return day
}

// ComputeSummaryStats calculates real totals directly from saved accounts without estimates.
func ComputeSummaryStats(accounts []model.Account) model.SummaryStats {
	stats := model.SummaryStats{
		TotalAccounts: len(accounts),
	}

	modelSet := make(map[string]struct{})
	currencyMap := make(map[string]*model.CurrencyCostSummary)

	for _, acc := range accounts {
		for _, m := range acc.Models {
			trimmed := strings.TrimSpace(m)
			if trimmed != "" {
				modelSet[trimmed] = struct{}{}
			}
		}

		for _, q := range acc.Quotas {
			for _, m := range q.Models {
				trimmed := strings.TrimSpace(m)
				if trimmed != "" {
					modelSet[trimmed] = struct{}{}
				}
			}
			stats.TotalQuotas++
			switch q.Status {
			case model.StatusCooldown:
				stats.CooldownQuotas++
			case model.StatusWarning:
				stats.WarningQuotas++
			default:
				stats.AvailableQuotas++
			}
		}

		cur := strings.ToUpper(strings.TrimSpace(acc.Currency))
		if cur == "" {
			cur = "USD"
		}
		cs, ok := currencyMap[cur]
		if !ok {
			cs = &model.CurrencyCostSummary{Currency: cur}
			currencyMap[cur] = cs
		}
		cs.AccountCount++

		switch acc.BillingCycle {
		case model.BillingMonthly:
			cs.MonthlyDirect += acc.Cost
			cs.MonthlyEquivalentTotal += acc.Cost
			cs.AnnualProjectedTotal += acc.Cost * 12
		case model.BillingAnnual:
			prorated := acc.Cost / 12.0
			cs.AnnualProratedMonthly += prorated
			cs.MonthlyEquivalentTotal += prorated
			cs.AnnualProjectedTotal += acc.Cost
		case model.BillingPrepaid:
			cs.PrepaidBalanceTotal += acc.Cost
		}
	}

	models := make([]string, 0, len(modelSet))
	for m := range modelSet {
		models = append(models, m)
	}
	sort.Strings(models)
	stats.DistinctModels = models

	currencies := make([]string, 0, len(currencyMap))
	for c := range currencyMap {
		currencies = append(currencies, c)
	}
	sort.Strings(currencies)

	costSummaries := make([]model.CurrencyCostSummary, 0, len(currencies))
	for _, c := range currencies {
		cs := currencyMap[c]
		cs.MonthlyDirect = round2(cs.MonthlyDirect)
		cs.AnnualProratedMonthly = round2(cs.AnnualProratedMonthly)
		cs.MonthlyEquivalentTotal = round2(cs.MonthlyEquivalentTotal)
		cs.AnnualProjectedTotal = round2(cs.AnnualProjectedTotal)
		cs.PrepaidBalanceTotal = round2(cs.PrepaidBalanceTotal)
		costSummaries = append(costSummaries, *cs)
	}
	stats.CostByCurrency = costSummaries

	return stats
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

// GetProviderPresets returns optional starter templates with zero usage so users can quickly register common plans.
func GetProviderPresets() []model.ProviderPreset {
	return []model.ProviderPreset{
		{
			ID:          "anthropic-claude-pro",
			DisplayName: "Anthropic: Claude Pro ($20/mo | 5h + Weekly)",
			AccountTemplate: model.Account{
				Provider:     "Anthropic",
				Alias:        "Claude Pro",
				PlanName:     "Pro",
				BillingCycle: model.BillingMonthly,
				Cost:         20,
				Currency:     "USD",
				Models:       []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5"},
				Apps:         []string{"Web (claude.ai)", "Claude Desktop", "Mobile App", "Claude Code CLI"},
				Notes:        "Pro plan ($20/mo or $17/mo annual). All surfaces share the same 5h and weekly pool; Fable requires extra usage credits.",
				Quotas: []model.QuotaRule{
					{
						GroupName:   "Web · Desktop · Claude Code",
						Label:       "5h session limit",
						ScopeType:   model.ScopeShared,
						Surfaces:    []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:      []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5"},
						Unit:        "percent",
						LimitValue:  100,
						UsedValue:   0,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Web · Desktop · Claude Code",
						Label:          "Weekly limit (1x)",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:         []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5"},
						Unit:           "percent",
						LimitValue:     100,
						UsedValue:      0,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
				},
			},
		},
		{
			ID:          "anthropic-claude-max",
			DisplayName: "Anthropic: Claude Max ($100/mo | 5x Pro + $100 API)",
			AccountTemplate: model.Account{
				Provider:     "Anthropic",
				Alias:        "Claude Max",
				PlanName:     "Max",
				BillingCycle: model.BillingMonthly,
				Cost:         100,
				Currency:     "USD",
				Models:       []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Fable"},
				Apps:         []string{"Web (claude.ai)", "Claude Desktop", "Mobile App", "Claude Code CLI", "Claude Platform API"},
				Notes:        "5x Pro capacity across 5h and weekly windows (Fable capped at 50% of weekly pool) + $100/mo API credits.",
				Quotas: []model.QuotaRule{
					{
						GroupName:   "Web · Desktop · Claude Code (5x)",
						Label:       "5h session limit",
						ScopeType:   model.ScopeShared,
						Surfaces:    []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:      []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Fable"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Web · Desktop · Claude Code (5x)",
						Label:          "Weekly limit (5x Pro)",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:         []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Fable"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:       "Claude Platform API Credits",
						Label:           "Included API credits ($100/mo)",
						ScopeType:       model.ScopeIsolated,
						Surfaces:        []string{"API"},
						Unit:            "credits_usd",
						LimitValue:      100,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "anthropic-claude-ultra",
			DisplayName: "Anthropic: Claude Ultra ($200/mo | No 5h cap + $200 API)",
			AccountTemplate: model.Account{
				Provider:     "Anthropic",
				Alias:        "Claude Ultra",
				PlanName:     "Ultra",
				BillingCycle: model.BillingMonthly,
				Cost:         200,
				Currency:     "USD",
				Models:       []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Fable"},
				Apps:         []string{"Web (claude.ai)", "Claude Desktop", "Mobile App", "Claude Code CLI", "Claude Platform API"},
				Notes:        "10x Pro weekly capacity with no 5h session limit for verified accounts + $200/mo API credits.",
				Quotas: []model.QuotaRule{
					{
						GroupName:      "Web · Desktop · Claude Code (10x)",
						Label:          "Weekly limit (no 5h cap)",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:         []string{"Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Fable"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:       "Claude Platform API Credits",
						Label:           "Included API credits ($200/mo)",
						ScopeType:       model.ScopeIsolated,
						Surfaces:        []string{"API"},
						Unit:            "credits_usd",
						LimitValue:      200,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "openai-chatgpt-plus",
			DisplayName: "OpenAI: ChatGPT Plus ($20/mo | 5h + Weekly)",
			AccountTemplate: model.Account{
				Provider:     "OpenAI",
				Alias:        "ChatGPT Plus",
				PlanName:     "Plus",
				BillingCycle: model.BillingMonthly,
				Cost:         20,
				Currency:     "USD",
				Models:       []string{"GPT-6.1 Sol", "GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna", "GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna", "GPT-5 Thinking Mini"},
				Apps:         []string{"Web (chatgpt.com)", "ChatGPT Desktop", "Mobile App", "Codex"},
				Notes:        "USD baseline ($20/mo). Context: 54K Instant / 256K Reasoning. Limits shared across ChatGPT and Codex.",
				Quotas: []model.QuotaRule{
					{
						GroupName:   "ChatGPT Web, App & Codex",
						Label:       "5h rolling limit",
						ScopeType:   model.ScopeShared,
						Surfaces:    []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:      []string{"GPT-6.1 Sol", "GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna", "GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna", "GPT-5 Thinking Mini"},
						Unit:        "percent",
						LimitValue:  100,
						UsedValue:   0,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "ChatGPT Web, App & Codex",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:         []string{"GPT-6.1 Sol", "GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna", "GPT-5.6 Sol", "GPT-5.6 Terra", "GPT-5.6 Luna", "GPT-5 Thinking Mini"},
						Unit:           "percent",
						LimitValue:     100,
						UsedValue:      0,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
				},
			},
		},
		{
			ID:          "openai-chatgpt-pro",
			DisplayName: "OpenAI: ChatGPT Pro 100 ($100/mo | Expanded + API)",
			AccountTemplate: model.Account{
				Provider:     "OpenAI",
				Alias:        "ChatGPT Pro 100",
				PlanName:     "Pro 100",
				BillingCycle: model.BillingMonthly,
				Cost:         100,
				Currency:     "USD",
				Models:       []string{"GPT-6.1 Sol", "GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna", "GPT-5.6 Sol Pro", "GPT-5 Thinking Mini"},
				Apps:         []string{"Web (chatgpt.com)", "ChatGPT Desktop", "Mobile App", "Codex", "OpenAI API"},
				Notes:        "Tiers Pro 100 ($100), Pro 200 ($200), Pro 500 ($500). 128K Instant / 400K Reasoning + monthly API credits (expire at billing end).",
				Quotas: []model.QuotaRule{
					{
						GroupName:      "ChatGPT Pro + Codex",
						Label:          "Expanded weekly usage",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"Web", "Desktop", "Mobile", "CLI"},
						Models:         []string{"GPT-6.1 Sol", "GPT-6 Astra", "GPT-6 Sol", "GPT-6 Luna", "GPT-5.6 Sol Pro", "GPT-5 Thinking Mini"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:       "OpenAI API Credits",
						Label:           "Monthly API credits ($100)",
						ScopeType:       model.ScopeIsolated,
						Surfaces:        []string{"API"},
						Unit:            "credits_usd",
						LimitValue:      100,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "cursor-premium",
			DisplayName: "Cursor: Premium ($30/mo | Weekly Pool + 3rd-party Prepaid)",
			AccountTemplate: model.Account{
				Provider:     "Cursor",
				Alias:        "Cursor Premium",
				PlanName:     "Premium (The X Subscription)",
				BillingCycle: model.BillingMonthly,
				Cost:         30,
				Currency:     "USD",
				Models:       []string{"Grok 4.7", "Grok 4.6", "Grok 4.5", "Composer 2.5", "Claude 4.6 Sonnet", "Claude 4.7 Opus", "GPT-5.6 Sol", "Gemini 4 Argon"},
				Apps:         []string{"Cursor IDE", "Cursor CLI", "Cloud Agents", "Grok"},
				Notes:        "Includes shared weekly pool across Cursor and Grok (4x Plus). 3rd-party models (Claude, GPT, Gemini) use separate prepaid API balance.",
				Quotas: []model.QuotaRule{
					{
						GroupName:      "Cursor + Grok (Weekly pool)",
						Label:          "Included weekly pool (4x Plus)",
						ScopeType:      model.ScopeShared,
						Surfaces:       []string{"IDE", "CLI", "Web"},
						Models:         []string{"Grok 4.7", "Grok 4.6", "Grok 4.5", "Composer 2.5"},
						Unit:           "percent",
						LimitValue:     100,
						UsedValue:      0,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:  "3rd-party models (Prepaid)",
						Label:      "Cursor API prepaid balance (USD)",
						ScopeType:  model.ScopeIsolated,
						Surfaces:   []string{"IDE", "CLI"},
						Models:     []string{"Claude 4.6 Sonnet", "Claude 4.7 Opus", "GPT-5.6 Sol", "Gemini 4 Argon"},
						Unit:       "credits_usd",
						LimitValue: 20,
						UsedValue:  0,
						WindowType: model.WindowManualOnly,
					},
				},
			},
		},
		{
			ID:          "github-copilot-pro",
			DisplayName: "GitHub Copilot: Pro ($10/mo | 1,500 AI Credits)",
			AccountTemplate: model.Account{
				Provider:     "GitHub Copilot",
				Alias:        "Copilot Pro",
				PlanName:     "Pro",
				BillingCycle: model.BillingMonthly,
				Cost:         10,
				Currency:     "USD",
				Models:       []string{"Claude Sonnet 4.6", "Claude Sonnet 5.5", "GPT-6.2 Sol", "GPT-5.6 Sol", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Grok 4.7", "MAI Code 2"},
				Apps:         []string{"VS Code", "Copilot CLI", "GitHub Web", "Copilot App"},
				Notes:        "Unlimited base completions at no credit cost. Includes 1,500 AI Credits/mo ($10 base + $5 flex; 1 credit = $0.01) shared across Chat, Agent, and CLI.",
				Quotas: []model.QuotaRule{
					{
						GroupName:       "GitHub AI Credits (Chat, Agent, CLI)",
						Label:           "Monthly credits (1,000 base + 500 flex)",
						ScopeType:       model.ScopeShared,
						Surfaces:        []string{"IDE", "CLI", "Web"},
						Models:          []string{"Claude Sonnet 4.6", "Claude Sonnet 5.5", "GPT-6.2 Sol", "GPT-5.6 Sol", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Grok 4.7", "MAI Code 2"},
						Unit:            "credits",
						LimitValue:      1500,
						UsedValue:       0,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "github-copilot-pro-plus",
			DisplayName: "GitHub Copilot: Pro+ ($39/mo | 7,000 AI Credits)",
			AccountTemplate: model.Account{
				Provider:     "GitHub Copilot",
				Alias:        "Copilot Pro+",
				PlanName:     "Pro+",
				BillingCycle: model.BillingMonthly,
				Cost:         39,
				Currency:     "USD",
				Models:       []string{"Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Fable 5.2", "GPT-6.2 Astra", "GPT-6.2 Sol", "Gemini 4 Carbon", "Gemini 4 Argon", "Grok 4.7"},
				Apps:         []string{"VS Code", "Copilot CLI", "GitHub Web", "Copilot App"},
				Notes:        "4x+ Pro usage with Opus/Fable access and 7,000 AI Credits/mo (3,900 base + 3,100 flex). Copilot Max ($100/mo, 20,000 credits) also available.",
				Quotas: []model.QuotaRule{
					{
						GroupName:       "GitHub AI Credits (Chat, Agent, CLI)",
						Label:           "Monthly credits (3,900 base + 3,100 flex)",
						ScopeType:       model.ScopeShared,
						Surfaces:        []string{"IDE", "CLI", "Web"},
						Models:          []string{"Claude Opus 5.5", "Claude Sonnet 5.5", "Claude Fable 5.2", "GPT-6.2 Astra", "GPT-6.2 Sol", "Gemini 4 Carbon", "Gemini 4 Argon", "Grok 4.7"},
						Unit:            "credits",
						LimitValue:      7000,
						UsedValue:       0,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "google-ai-pro-antigravity",
			DisplayName: "Google: AI Pro ($19.99/mo | Gemini Web + Antigravity + Flow)",
			AccountTemplate: model.Account{
				Provider:     "Google",
				Alias:        "Google AI Pro",
				PlanName:     "AI Pro",
				BillingCycle: model.BillingMonthly,
				Cost:         19.99,
				Currency:     "USD",
				Models:       []string{"Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini 3.1 Pro", "Gemini Omni Flash", "Claude Sonnet 4.6", "Claude Opus 4.6", "Nano Banana Pro", "Veo 3.1"},
				Apps:         []string{"Web (gemini.google.com)", "Antigravity IDE", "Agy CLI", "Google Flow", "Google Colab"},
				Notes:        "AI Pro ($19.99/mo or $199.99/yr). 5h + weekly quotas on Web and separate pools in Antigravity, plus 1,000 Flow credits and 200 Colab compute units/mo.",
				Quotas: []model.QuotaRule{
					{
						GroupName:   "Web (Gemini App)",
						Label:       "5h limit",
						ScopeType:   model.ScopeIsolated,
						Surfaces:    []string{"Web", "Mobile"},
						Models:      []string{"Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini 3.1 Pro", "Gemini Omni Flash"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Web (Gemini App)",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"Web", "Mobile"},
						Models:         []string{"Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini 3.1 Pro", "Gemini Omni Flash"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:   "Antigravity: Gemini Base",
						Label:       "5h limit",
						ScopeType:   model.ScopeIsolated,
						Surfaces:    []string{"IDE", "CLI"},
						Models:      []string{"Gemini 4 Hydrogen", "Gemini Omni Flash"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Antigravity: Gemini Base",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"IDE", "CLI"},
						Models:         []string{"Gemini 4 Hydrogen", "Gemini Omni Flash"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:   "Antigravity: External Models",
						Label:       "5h limit",
						ScopeType:   model.ScopeIsolated,
						Surfaces:    []string{"IDE", "CLI"},
						Models:      []string{"Claude Sonnet 4.6", "Claude Opus 4.6"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Antigravity: External Models",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"IDE", "CLI"},
						Models:         []string{"Claude Sonnet 4.6", "Claude Opus 4.6"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:      "Antigravity: Frontier Model",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"IDE", "CLI"},
						Models:         []string{"Gemini 4 Argon", "Gemini 3.1 Pro"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:       "Google Flow (Video / Image)",
						Label:           "Monthly Flow credits",
						ScopeType:       model.ScopeIsolated,
						Surfaces:        []string{"Web"},
						Models:          []string{"Nano Banana Pro", "Veo 3.1"},
						Unit:            "credits",
						LimitValue:      1000,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "google-ai-ultra",
			DisplayName: "Google: AI Ultra 5x ($99.99/mo | 5x Pro + Carbon + 10k Flow)",
			AccountTemplate: model.Account{
				Provider:     "Google",
				Alias:        "Google AI Ultra 5x",
				PlanName:     "AI Ultra 5x",
				BillingCycle: model.BillingMonthly,
				Cost:         99.99,
				Currency:     "USD",
				Models:       []string{"Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini Omni Flash", "Claude Opus 4.6", "Claude Sonnet 4.6", "Veo 3.1", "Genie 3"},
				Apps:         []string{"Web (gemini.google.com)", "Antigravity IDE", "Agy CLI", "Google Flow", "Google Colab"},
				Notes:        "5x AI Pro capacity (Ultra 20x also available at $199.99/mo), priority access to Gemini 4 Carbon, and 10,000 Flow credits/mo.",
				Quotas: []model.QuotaRule{
					{
						GroupName:   "Web (Gemini App)",
						Label:       "5h limit (5x Pro)",
						ScopeType:   model.ScopeIsolated,
						Surfaces:    []string{"Web", "Mobile"},
						Models:      []string{"Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini Omni Flash"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Web (Gemini App)",
						Label:          "Weekly limit (5x Pro)",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"Web", "Mobile"},
						Models:         []string{"Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Gemini Omni Flash"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:   "Antigravity (5x Pro)",
						Label:       "5h limit",
						ScopeType:   model.ScopeIsolated,
						Surfaces:    []string{"IDE", "CLI"},
						Models:      []string{"Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Claude Opus 4.6", "Claude Sonnet 4.6"},
						Unit:        "percent",
						LimitValue:  100,
						WindowType:  model.WindowRollingHours,
						WindowHours: 5,
					},
					{
						GroupName:      "Antigravity (5x Pro)",
						Label:          "Weekly limit",
						ScopeType:      model.ScopeIsolated,
						Surfaces:       []string{"IDE", "CLI"},
						Models:         []string{"Gemini 4 Carbon", "Gemini 4 Argon", "Gemini 4 Hydrogen", "Claude Opus 4.6", "Claude Sonnet 4.6"},
						Unit:           "percent",
						LimitValue:     100,
						WindowType:     model.WindowWeeklyCycle,
						WeeklyResetDay: 0,
					},
					{
						GroupName:       "Google Flow (Video / Image)",
						Label:           "Monthly Flow credits",
						ScopeType:       model.ScopeIsolated,
						Surfaces:        []string{"Web"},
						Models:          []string{"Veo 3.1", "Genie 3"},
						Unit:            "credits",
						LimitValue:      10000,
						WindowType:      model.WindowMonthlyCycle,
						MonthlyResetDay: 1,
					},
				},
			},
		},
		{
			ID:          "api-prepaid-isolated",
			DisplayName: "Prepaid API Console (Isolated limit for CLI / Scripts)",
			AccountTemplate: model.Account{
				Provider:     "Anthropic / OpenAI / OpenRouter",
				Alias:        "Prepaid API CLI",
				PlanName:     "Pay-as-you-go",
				BillingCycle: model.BillingPrepaid,
				Cost:         15,
				Currency:     "USD",
				Models:       []string{"Claude Sonnet 4.6 API", "GPT-6 Sol API", "DeepSeek V3"},
				Apps:         []string{"CLI", "API", "Local Scripts"},
				Notes:        "Isolated prepaid balance. Never shares limits with web subscriptions.",
				Quotas: []model.QuotaRule{
					{
						Label:      "Used balance (USD)",
						ScopeType:  model.ScopeIsolated,
						Surfaces:   []string{"API", "CLI"},
						Unit:       "credits_usd",
						LimitValue: 15,
						UsedValue:  0,
						WindowType: model.WindowManualOnly,
					},
				},
			},
		},
	}
}
