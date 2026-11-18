package model

// BillingCycle defines supported subscription and payment cadences.
const (
	BillingMonthly = "monthly"
	BillingAnnual  = "annual"
	BillingPrepaid = "prepaid"
	BillingFree    = "free"
)

// ScopeType defines whether a quota pool is shared across multiple apps/surfaces or isolated.
const (
	ScopeShared   = "shared"
	ScopeIsolated = "isolated"
)

// WindowType defines how a quota reset window behaves over time.
const (
	WindowRollingHours = "rolling_hours"
	WindowDailyFixed   = "daily_fixed"
	WindowWeeklyCycle  = "weekly_cycle"
	WindowMonthlyCycle = "monthly_cycle"
	WindowManualOnly   = "manual_only"
)

// QuotaStatus reflects real-time readiness calculated by the quota engine.
const (
	StatusAvailable = "available"
	StatusWarning   = "warning"
	StatusCooldown  = "cooldown"
)

type Account struct {
	ID           int64       `json:"id"`
	Provider     string      `json:"provider"`
	Alias        string      `json:"alias"`
	Identifier   string      `json:"identifier"`
	PlanName     string      `json:"plan_name"`
	BillingCycle string      `json:"billing_cycle"`
	Cost         float64     `json:"cost"`
	Currency     string      `json:"currency"`
	RenewalDate  string      `json:"renewal_date"`
	PaymentNotes string      `json:"payment_notes"`
	Models       []string    `json:"models"`
	Apps         []string    `json:"apps"`
	Notes        string      `json:"notes"`
	SortOrder    int         `json:"sort_order"`
	Quotas       []QuotaRule `json:"quotas"`
	CreatedAt    string      `json:"created_at"`
	UpdatedAt    string      `json:"updated_at"`
}

type QuotaRule struct {
	ID               int64    `json:"id"`
	AccountID        int64    `json:"account_id"`
	GroupName        string   `json:"group_name"`
	Label            string   `json:"label"`
	ScopeType        string   `json:"scope_type"`
	Surfaces         []string `json:"surfaces"`
	Models           []string `json:"models"`
	Unit             string   `json:"unit"`
	LimitValue       float64  `json:"limit_value"`
	UsedValue        float64  `json:"used_value"`
	WindowType       string   `json:"window_type"`
	WindowHours      float64  `json:"window_hours"`
	DailyResetTime   string   `json:"daily_reset_time"`
	WeeklyResetDay   int      `json:"weekly_reset_day"`
	MonthlyResetDay  int      `json:"monthly_reset_day"`
	WindowStartedAt  string   `json:"window_started_at"`
	ResetsAt         string   `json:"resets_at"`
	Status           string   `json:"status"`
	RemainingSeconds int64    `json:"remaining_seconds"`
	UsagePercent     float64  `json:"usage_percent"`
}

type QuotaActionRequest struct {
	Action      string  `json:"action"`
	Delta       float64 `json:"delta,omitempty"`
	Value       float64 `json:"value,omitempty"`
	CustomHours float64 `json:"custom_hours,omitempty"`
	UntilTime   string  `json:"until_time,omitempty"`
	ModelUsed   string  `json:"model_used,omitempty"`
}

type ReorderAccountsRequest struct {
	AccountIDs []int64 `json:"account_ids"`
}

type QuotaEvent struct {
	ID                int64    `json:"id"`
	AccountID         int64    `json:"account_id"`
	AccountAlias      string   `json:"account_alias"`
	Provider          string   `json:"provider"`
	QuotaID           int64    `json:"quota_id"`
	QuotaLabel        string   `json:"quota_label"`
	GroupName         string   `json:"group_name"`
	Surfaces          []string `json:"surfaces"`
	Models            []string `json:"models"`
	Unit              string   `json:"unit"`
	DeltaUsed         float64  `json:"delta_used"`
	DeltaPercent      float64  `json:"delta_percent"`
	UsedAfter         float64  `json:"used_after"`
	UsagePercentAfter float64  `json:"usage_percent_after"`
	Action            string   `json:"action"`
	ModelUsed         string   `json:"model_used"`
	EventDate         string   `json:"event_date"`
	CreatedAt         string   `json:"created_at"`
}

type ActivityDay struct {
	Date       string   `json:"date"`
	Events     int      `json:"events"`
	TotalDelta float64  `json:"total_delta_pct"`
	Cooldowns  int      `json:"cooldowns"`
	Level      int      `json:"level"`
	Accounts   []string `json:"accounts"`
	Models     []string `json:"models"`
}

type ModelUsageStat struct {
	Model        string   `json:"model"`
	Events       int      `json:"events"`
	TotalPercent float64  `json:"total_percent"`
	Accounts     []string `json:"accounts"`
}

type SurfaceUsageStat struct {
	Surface      string  `json:"surface"`
	Events       int     `json:"events"`
	TotalPercent float64 `json:"total_percent"`
}

type AccountActivityStat struct {
	AccountID    int64   `json:"account_id"`
	Alias        string  `json:"alias"`
	Provider     string  `json:"provider"`
	BillingCycle string  `json:"billing_cycle"`
	Cost         float64 `json:"cost"`
	Currency     string  `json:"currency"`
	Events       int     `json:"events"`
	TotalPercent float64 `json:"total_percent"`
	Cooldowns    int     `json:"cooldowns"`
}

type ActivityStats struct {
	RangeDays        int                   `json:"range_days"`
	TotalEvents      int                   `json:"total_events"`
	Events30d        int                   `json:"events_30d"`
	ActiveDays365    int                   `json:"active_days_365"`
	ActiveDays30d    int                   `json:"active_days_30d"`
	CurrentStreak    int                   `json:"current_streak"`
	LongestStreak    int                   `json:"longest_streak"`
	CooldownsHit30d  int                   `json:"cooldowns_hit_30d"`
	TopAccount       string                `json:"top_account"`
	TopGroup         string                `json:"top_group"`
	WeeklyHeadroom   float64               `json:"weekly_headroom_pct"`
	Heatmap          []ActivityDay         `json:"heatmap"`
	TopModels        []ModelUsageStat      `json:"top_models"`
	SurfaceBreakdown []SurfaceUsageStat    `json:"surface_breakdown"`
	AccountUsage30d  []AccountActivityStat `json:"account_usage_30d"`
}

type CurrencyCostSummary struct {
	Currency               string  `json:"currency"`
	MonthlyDirect          float64 `json:"monthly_direct"`
	AnnualProratedMonthly  float64 `json:"annual_prorated_monthly"`
	MonthlyEquivalentTotal float64 `json:"monthly_equivalent_total"`
	AnnualProjectedTotal   float64 `json:"annual_projected_total"`
	PrepaidBalanceTotal    float64 `json:"prepaid_balance_total"`
	AccountCount           int     `json:"account_count"`
}

type SummaryStats struct {
	TotalAccounts   int                   `json:"total_accounts"`
	TotalQuotas     int                   `json:"total_quotas"`
	AvailableQuotas int                   `json:"available_quotas"`
	WarningQuotas   int                   `json:"warning_quotas"`
	CooldownQuotas  int                   `json:"cooldown_quotas"`
	DistinctModels  []string              `json:"distinct_models"`
	CostByCurrency  []CurrencyCostSummary `json:"cost_by_currency"`
}

type ProviderPreset struct {
	ID              string  `json:"id"`
	DisplayName     string  `json:"display_name"`
	AccountTemplate Account `json:"account_template"`
}

type ExportPayload struct {
	Version    int          `json:"version"`
	ExportedAt string       `json:"exported_at"`
	Accounts   []Account    `json:"accounts"`
	Events     []QuotaEvent `json:"events,omitempty"`
}
