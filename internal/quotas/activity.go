package quotas

import (
	"math"
	"sort"
	"strings"
	"time"

	"ai-accounts-hub/internal/model"
)

// ComputeActivityStats aggregates heatmap days, streaks, top models, surfaces, and per-account activity.
func ComputeActivityStats(accounts []model.Account, events []model.QuotaEvent, rangeDays int, now time.Time) model.ActivityStats {
	if rangeDays <= 0 {
		rangeDays = 30
	}
	if rangeDays > 365 {
		rangeDays = 365
	}

	loc := now.Location()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	windowStartStr := today.AddDate(0, 0, -(rangeDays - 1)).Format("2006-01-02")
	yearStart := today.AddDate(0, 0, -364)
	yearStartStr := yearStart.Format("2006-01-02")
	gridStart := yearStart.AddDate(0, 0, -int(yearStart.Weekday()))
	todayStr := today.Format("2006-01-02")

	type dayAccum struct {
		events     int
		totalDelta float64
		cooldowns  int
		accounts   map[string]struct{}
		models     map[string]struct{}
	}
	byDate := make(map[string]*dayAccum)
	activeDateSet := make(map[string]bool)

	type modelAccum struct {
		display string
		events  int
		pct     float64
		accs    map[string]struct{}
	}
	modelStats := make(map[string]*modelAccum)

	type surfAccum struct {
		events int
		pct    float64
	}
	surfaceStats := make(map[string]*surfAccum)

	type accAccum struct {
		events    int
		pct       float64
		cooldowns int
	}
	accStatsByID := make(map[int64]*accAccum)
	accGroupHits := make(map[string]int)
	accAliasHits := make(map[string]int)

	var stats model.ActivityStats
	stats.RangeDays = rangeDays
	stats.TotalEvents = len(events)

	for _, ev := range events {
		dateStr := strings.TrimSpace(ev.EventDate)
		if dateStr == "" {
			if t, err := time.Parse(time.RFC3339, ev.CreatedAt); err == nil {
				dateStr = t.In(loc).Format("2006-01-02")
			}
		}
		if dateStr == "" {
			continue
		}

		activeDateSet[dateStr] = true
		dAcc := byDate[dateStr]
		if dAcc == nil {
			dAcc = &dayAccum{
				accounts: make(map[string]struct{}),
				models:   make(map[string]struct{}),
			}
			byDate[dateStr] = dAcc
		}
		dAcc.events++
		dAcc.totalDelta += math.Max(0, ev.DeltaPercent)
		if ev.UsagePercentAfter >= 100 || ev.Action == "exhaust_now" {
			dAcc.cooldowns++
		}
		if ev.AccountAlias != "" {
			dAcc.accounts[ev.AccountAlias] = struct{}{}
		}
		evModels := resolveEventModels(ev)
		for _, m := range evModels {
			dAcc.models[m] = struct{}{}
		}

		if dateStr < windowStartStr || dateStr > todayStr {
			continue
		}

		stats.Events30d++
		if ev.UsagePercentAfter >= 100 || ev.Action == "exhaust_now" {
			stats.CooldownsHit30d++
		}
		if ev.AccountAlias != "" {
			accAliasHits[ev.AccountAlias]++
			if ev.GroupName != "" {
				accGroupHits[ev.AccountAlias+" / "+ev.GroupName]++
			}
		}

		aa := accStatsByID[ev.AccountID]
		if aa == nil {
			aa = &accAccum{}
			accStatsByID[ev.AccountID] = aa
		}
		aa.events++
		aa.pct += math.Max(0, ev.DeltaPercent)
		if ev.UsagePercentAfter >= 100 || ev.Action == "exhaust_now" {
			aa.cooldowns++
		}

		if len(evModels) > 0 {
			weightPct := math.Max(0, ev.DeltaPercent) / float64(len(evModels))
			for _, m := range evModels {
				key := strings.ToLower(m)
				ma := modelStats[key]
				if ma == nil {
					ma = &modelAccum{display: m, accs: make(map[string]struct{})}
					modelStats[key] = ma
				}
				ma.events++
				ma.pct += weightPct
				if ev.AccountAlias != "" {
					ma.accs[ev.AccountAlias] = struct{}{}
				}
			}
		}

		if len(ev.Surfaces) > 0 {
			weightPct := math.Max(0, ev.DeltaPercent) / float64(len(ev.Surfaces))
			for _, s := range ev.Surfaces {
				sa := surfaceStats[s]
				if sa == nil {
					sa = &surfAccum{}
					surfaceStats[s] = sa
				}
				sa.events++
				sa.pct += weightPct
			}
		}
	}

	// Count active days in 365d and selected window.
	for d := range activeDateSet {
		if d >= yearStartStr && d <= todayStr {
			stats.ActiveDays365++
		}
		if d >= windowStartStr && d <= todayStr {
			stats.ActiveDays30d++
		}
	}

	stats.CurrentStreak, stats.LongestStreak = computeStreaks(activeDateSet, today)
	stats.TopAccount = topMapKey(accAliasHits)
	stats.TopGroup = topMapKey(accGroupHits)
	stats.WeeklyHeadroom = computeWeeklyHeadroom(accounts)

	// Build week-aligned heatmap grid from gridStart up to today.
	totalDays := int(today.Sub(gridStart).Hours()/24) + 1
	if totalDays < 1 {
		totalDays = 1
	}
	heatmap := make([]model.ActivityDay, 0, totalDays)
	maxScore := 0.0
	for i := 0; i < totalDays; i++ {
		dStr := gridStart.AddDate(0, 0, i).Format("2006-01-02")
		dAcc := byDate[dStr]
		if dAcc == nil {
			heatmap = append(heatmap, model.ActivityDay{
				Date:     dStr,
				Accounts: []string{},
				Models:   []string{},
			})
			continue
		}
		score := activityScore(dAcc.events, dAcc.totalDelta)
		if score > maxScore {
			maxScore = score
		}
		heatmap = append(heatmap, model.ActivityDay{
			Date:       dStr,
			Events:     dAcc.events,
			TotalDelta: math.Round(dAcc.totalDelta*10) / 10,
			Cooldowns:  dAcc.cooldowns,
			Accounts:   sortedMapKeys(dAcc.accounts),
			Models:     sortedMapKeys(dAcc.models),
		})
	}
	for i := range heatmap {
		if heatmap[i].Events == 0 {
			heatmap[i].Level = 0
			continue
		}
		score := activityScore(heatmap[i].Events, heatmap[i].TotalDelta)
		heatmap[i].Level = activityLevel(score, maxScore)
	}
	stats.Heatmap = heatmap

	stats.TopModels = make([]model.ModelUsageStat, 0, len(modelStats))
	for _, ma := range modelStats {
		stats.TopModels = append(stats.TopModels, model.ModelUsageStat{
			Model:        ma.display,
			Events:       ma.events,
			TotalPercent: math.Round(ma.pct*10) / 10,
			Accounts:     sortedMapKeys(ma.accs),
		})
	}
	sort.Slice(stats.TopModels, func(i, j int) bool {
		if stats.TopModels[i].TotalPercent != stats.TopModels[j].TotalPercent {
			return stats.TopModels[i].TotalPercent > stats.TopModels[j].TotalPercent
		}
		if stats.TopModels[i].Events != stats.TopModels[j].Events {
			return stats.TopModels[i].Events > stats.TopModels[j].Events
		}
		return stats.TopModels[i].Model < stats.TopModels[j].Model
	})

	stats.SurfaceBreakdown = make([]model.SurfaceUsageStat, 0, len(surfaceStats))
	for surf, sa := range surfaceStats {
		stats.SurfaceBreakdown = append(stats.SurfaceBreakdown, model.SurfaceUsageStat{
			Surface:      surf,
			Events:       sa.events,
			TotalPercent: math.Round(sa.pct*10) / 10,
		})
	}
	sort.Slice(stats.SurfaceBreakdown, func(i, j int) bool {
		if stats.SurfaceBreakdown[i].TotalPercent != stats.SurfaceBreakdown[j].TotalPercent {
			return stats.SurfaceBreakdown[i].TotalPercent > stats.SurfaceBreakdown[j].TotalPercent
		}
		return stats.SurfaceBreakdown[i].Surface < stats.SurfaceBreakdown[j].Surface
	})

	stats.AccountUsage30d = make([]model.AccountActivityStat, 0, len(accounts))
	for _, acc := range accounts {
		aa := accStatsByID[acc.ID]
		row := model.AccountActivityStat{
			AccountID:    acc.ID,
			Alias:        acc.Alias,
			Provider:     acc.Provider,
			BillingCycle: acc.BillingCycle,
			Cost:         acc.Cost,
			Currency:     acc.Currency,
		}
		if aa != nil {
			row.Events = aa.events
			row.TotalPercent = math.Round(aa.pct*10) / 10
			row.Cooldowns = aa.cooldowns
		}
		stats.AccountUsage30d = append(stats.AccountUsage30d, row)
	}

	return stats
}

func resolveEventModels(ev model.QuotaEvent) []string {
	if strings.TrimSpace(ev.ModelUsed) != "" {
		return []string{strings.TrimSpace(ev.ModelUsed)}
	}
	return ev.Models
}

func activityScore(events int, totalDelta float64) float64 {
	return float64(events) + totalDelta/25.0
}

func activityLevel(score, maxScore float64) int {
	if score <= 0 {
		return 0
	}
	if maxScore <= 4 {
		switch {
		case score >= 3.5:
			return 4
		case score >= 2.2:
			return 3
		case score >= 1.4:
			return 2
		default:
			return 1
		}
	}
	ratio := score / maxScore
	switch {
	case ratio >= 0.75:
		return 4
	case ratio >= 0.50:
		return 3
	case ratio >= 0.25:
		return 2
	default:
		return 1
	}
}

func computeStreaks(activeDates map[string]bool, today time.Time) (int, int) {
	if len(activeDates) == 0 {
		return 0, 0
	}

	current := 0
	cursor := today
	if !activeDates[cursor.Format("2006-01-02")] {
		cursor = cursor.AddDate(0, 0, -1)
	}
	for activeDates[cursor.Format("2006-01-02")] {
		current++
		cursor = cursor.AddDate(0, 0, -1)
	}

	dates := make([]string, 0, len(activeDates))
	for d := range activeDates {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	longest := 0
	run := 0
	var prev time.Time
	for i, d := range dates {
		parsed, err := time.Parse("2006-01-02", d)
		if err != nil {
			continue
		}
		if i > 0 && parsed.Sub(prev) == 24*time.Hour {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
		prev = parsed
	}
	return current, longest
}

func computeWeeklyHeadroom(accounts []model.Account) float64 {
	total := 0.0
	count := 0
	for _, acc := range accounts {
		for _, q := range acc.Quotas {
			if q.WindowType == model.WindowWeeklyCycle && q.LimitValue > 0 {
				rem := math.Max(0, 100-q.UsagePercent)
				total += rem
				count++
			}
		}
	}
	if count == 0 {
		return 0
	}
	return math.Round((total/float64(count))*10) / 10
}

func topMapKey(counts map[string]int) string {
	bestKey := ""
	bestVal := 0
	for k, v := range counts {
		if v > bestVal || (v == bestVal && (bestKey == "" || k < bestKey)) {
			bestKey = k
			bestVal = v
		}
	}
	return bestKey
}

func sortedMapKeys(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
