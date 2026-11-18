package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"ai-accounts-hub/internal/model"
	"ai-accounts-hub/internal/quotas"

	_ "modernc.org/sqlite"
)

var ErrNotFound = errors.New("record not found")

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	// SQLite handles concurrent HTTP requests reliably when serialized on one pooled writer connection.
	conn.SetMaxOpenConns(1)

	pragmas := []string{
		"PRAGMA foreign_keys = ON;",
		"PRAGMA journal_mode = WAL;",
		"PRAGMA busy_timeout = 5000;",
	}
	for _, p := range pragmas {
		if _, err := conn.Exec(p); err != nil {
			_ = conn.Close()
			return nil, fmt.Errorf("apply pragma %q: %w", p, err)
		}
	}

	s := &Store{db: conn}
	if err := s.migrate(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	const schema = `
CREATE TABLE IF NOT EXISTS accounts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	provider TEXT NOT NULL,
	alias TEXT NOT NULL,
	identifier TEXT NOT NULL DEFAULT '',
	plan_name TEXT NOT NULL DEFAULT '',
	billing_cycle TEXT NOT NULL DEFAULT 'monthly',
	cost REAL NOT NULL DEFAULT 0,
	currency TEXT NOT NULL DEFAULT 'USD',
	renewal_date TEXT NOT NULL DEFAULT '',
	payment_notes TEXT NOT NULL DEFAULT '',
	models_json TEXT NOT NULL DEFAULT '[]',
	apps_json TEXT NOT NULL DEFAULT '[]',
	notes TEXT NOT NULL DEFAULT '',
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotas (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	account_id INTEGER NOT NULL,
	group_name TEXT NOT NULL DEFAULT '',
	label TEXT NOT NULL,
	scope_type TEXT NOT NULL DEFAULT 'shared',
	surfaces_json TEXT NOT NULL DEFAULT '[]',
	models_json TEXT NOT NULL DEFAULT '[]',
	unit TEXT NOT NULL DEFAULT 'messages',
	limit_value REAL NOT NULL DEFAULT 0,
	used_value REAL NOT NULL DEFAULT 0,
	window_type TEXT NOT NULL DEFAULT 'rolling_hours',
	window_hours REAL NOT NULL DEFAULT 5,
	daily_reset_time TEXT NOT NULL DEFAULT '00:00',
	weekly_reset_day INTEGER NOT NULL DEFAULT 0,
	monthly_reset_day INTEGER NOT NULL DEFAULT 1,
	window_started_at TEXT NOT NULL DEFAULT '',
	resets_at TEXT NOT NULL DEFAULT '',
	FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quotas_account_id ON quotas(account_id);

CREATE TABLE IF NOT EXISTS quota_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	account_id INTEGER NOT NULL,
	account_alias TEXT NOT NULL DEFAULT '',
	provider TEXT NOT NULL DEFAULT '',
	quota_id INTEGER NOT NULL DEFAULT 0,
	quota_label TEXT NOT NULL DEFAULT '',
	group_name TEXT NOT NULL DEFAULT '',
	surfaces_json TEXT NOT NULL DEFAULT '[]',
	models_json TEXT NOT NULL DEFAULT '[]',
	unit TEXT NOT NULL DEFAULT 'percent',
	delta_used REAL NOT NULL DEFAULT 0,
	delta_percent REAL NOT NULL DEFAULT 0,
	used_after REAL NOT NULL DEFAULT 0,
	usage_percent_after REAL NOT NULL DEFAULT 0,
	action TEXT NOT NULL DEFAULT '',
	model_used TEXT NOT NULL DEFAULT '',
	event_date TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quota_events_date ON quota_events(event_date);
CREATE INDEX IF NOT EXISTS idx_quota_events_account ON quota_events(account_id);
`
	if _, err := s.db.Exec(schema); err != nil {
		return fmt.Errorf("migrate sqlite schema: %w", err)
	}
	// Backfill columns added after initial schema creation.
	_, _ = s.db.Exec(`ALTER TABLE accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;`)
	_, _ = s.db.Exec(`ALTER TABLE quotas ADD COLUMN weekly_reset_day INTEGER NOT NULL DEFAULT 0;`)
	_, _ = s.db.Exec(`ALTER TABLE quotas ADD COLUMN group_name TEXT NOT NULL DEFAULT '';`)
	_, _ = s.db.Exec(`ALTER TABLE quotas ADD COLUMN models_json TEXT NOT NULL DEFAULT '[]';`)
	return nil
}

func (s *Store) ListAccounts(ctx context.Context, now time.Time) ([]model.Account, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, provider, alias, identifier, plan_name, billing_cycle, cost, currency,
		       renewal_date, payment_notes, models_json, apps_json, notes, sort_order, created_at, updated_at
		FROM accounts
		ORDER BY CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC, id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]model.Account, 0)
	accountIndex := make(map[int64]int)

	for rows.Next() {
		var acc model.Account
		var modelsJSON, appsJSON string
		if err := rows.Scan(
			&acc.ID, &acc.Provider, &acc.Alias, &acc.Identifier, &acc.PlanName,
			&acc.BillingCycle, &acc.Cost, &acc.Currency, &acc.RenewalDate, &acc.PaymentNotes,
			&modelsJSON, &appsJSON, &acc.Notes, &acc.SortOrder, &acc.CreatedAt, &acc.UpdatedAt,
		); err != nil {
			return nil, err
		}
		acc.Models = decodeStringSlice(modelsJSON)
		acc.Apps = decodeStringSlice(appsJSON)
		acc.Quotas = make([]model.QuotaRule, 0)
		accountIndex[acc.ID] = len(accounts)
		accounts = append(accounts, acc)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(accounts) == 0 {
		return accounts, nil
	}

	qRows, err := s.db.QueryContext(ctx, `
		SELECT id, account_id, group_name, label, scope_type, surfaces_json, models_json, unit, limit_value, used_value,
		       window_type, window_hours, daily_reset_time, weekly_reset_day, monthly_reset_day, window_started_at, resets_at
		FROM quotas
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer qRows.Close()

	var expired []model.QuotaRule
	for qRows.Next() {
		var q model.QuotaRule
		var surfacesJSON, qModelsJSON string
		if err := qRows.Scan(
			&q.ID, &q.AccountID, &q.GroupName, &q.Label, &q.ScopeType, &surfacesJSON, &qModelsJSON, &q.Unit,
			&q.LimitValue, &q.UsedValue, &q.WindowType, &q.WindowHours,
			&q.DailyResetTime, &q.WeeklyResetDay, &q.MonthlyResetDay, &q.WindowStartedAt, &q.ResetsAt,
		); err != nil {
			return nil, err
		}
		q.Surfaces = decodeStringSlice(surfacesJSON)
		q.Models = decodeStringSlice(qModelsJSON)
		if quotas.EvaluateQuota(&q, now) {
			expired = append(expired, q)
		}
		if idx, ok := accountIndex[q.AccountID]; ok {
			accounts[idx].Quotas = append(accounts[idx].Quotas, q)
		}
	}
	if err := qRows.Err(); err != nil {
		return nil, err
	}

	for _, q := range expired {
		if err := s.persistQuotaState(ctx, q); err != nil {
			return nil, err
		}
	}

	return accounts, nil
}

func (s *Store) GetAccount(ctx context.Context, id int64, now time.Time) (model.Account, error) {
	var acc model.Account
	var modelsJSON, appsJSON string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, provider, alias, identifier, plan_name, billing_cycle, cost, currency,
		       renewal_date, payment_notes, models_json, apps_json, notes, sort_order, created_at, updated_at
		FROM accounts WHERE id = ?
	`, id).Scan(
		&acc.ID, &acc.Provider, &acc.Alias, &acc.Identifier, &acc.PlanName,
		&acc.BillingCycle, &acc.Cost, &acc.Currency, &acc.RenewalDate, &acc.PaymentNotes,
		&modelsJSON, &appsJSON, &acc.Notes, &acc.SortOrder, &acc.CreatedAt, &acc.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return acc, ErrNotFound
	}
	if err != nil {
		return acc, err
	}
	acc.Models = decodeStringSlice(modelsJSON)
	acc.Apps = decodeStringSlice(appsJSON)

	qRows, err := s.db.QueryContext(ctx, `
		SELECT id, account_id, group_name, label, scope_type, surfaces_json, models_json, unit, limit_value, used_value,
		       window_type, window_hours, daily_reset_time, weekly_reset_day, monthly_reset_day, window_started_at, resets_at
		FROM quotas WHERE account_id = ? ORDER BY id ASC
	`, id)
	if err != nil {
		return acc, err
	}
	defer qRows.Close()

	acc.Quotas = make([]model.QuotaRule, 0)
	var expired []model.QuotaRule
	for qRows.Next() {
		var q model.QuotaRule
		var surfacesJSON, qModelsJSON string
		if err := qRows.Scan(
			&q.ID, &q.AccountID, &q.GroupName, &q.Label, &q.ScopeType, &surfacesJSON, &qModelsJSON, &q.Unit,
			&q.LimitValue, &q.UsedValue, &q.WindowType, &q.WindowHours,
			&q.DailyResetTime, &q.WeeklyResetDay, &q.MonthlyResetDay, &q.WindowStartedAt, &q.ResetsAt,
		); err != nil {
			return acc, err
		}
		q.Surfaces = decodeStringSlice(surfacesJSON)
		q.Models = decodeStringSlice(qModelsJSON)
		if quotas.EvaluateQuota(&q, now) {
			expired = append(expired, q)
		}
		acc.Quotas = append(acc.Quotas, q)
	}
	if err := qRows.Err(); err != nil {
		return acc, err
	}

	for _, q := range expired {
		if err := s.persistQuotaState(ctx, q); err != nil {
			return acc, err
		}
	}

	return acc, nil
}

func (s *Store) CreateAccount(ctx context.Context, acc model.Account, now time.Time) (model.Account, error) {
	if err := normalizeAndValidateAccount(&acc); err != nil {
		return acc, err
	}
	ts := now.UTC().Format(time.RFC3339)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return acc, err
	}
	defer func() { _ = tx.Rollback() }()

	id, err := insertAccountTx(ctx, tx, acc, ts)
	if err != nil {
		return acc, err
	}
	if err := tx.Commit(); err != nil {
		return acc, err
	}

	return s.GetAccount(ctx, id, now)
}

func (s *Store) UpdateAccount(ctx context.Context, id int64, acc model.Account, now time.Time) (model.Account, error) {
	if err := normalizeAndValidateAccount(&acc); err != nil {
		return acc, err
	}
	ts := now.UTC().Format(time.RFC3339)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return acc, err
	}
	defer func() { _ = tx.Rollback() }()

	res, err := tx.ExecContext(ctx, `
		UPDATE accounts
		SET provider = ?, alias = ?, identifier = ?, plan_name = ?, billing_cycle = ?,
		    cost = ?, currency = ?, renewal_date = ?, payment_notes = ?,
		    models_json = ?, apps_json = ?, notes = ?,
		    sort_order = CASE WHEN ? > 0 THEN ? ELSE sort_order END,
		    updated_at = ?
		WHERE id = ?
	`,
		acc.Provider, acc.Alias, acc.Identifier, acc.PlanName, acc.BillingCycle,
		acc.Cost, acc.Currency, acc.RenewalDate, acc.PaymentNotes,
		encodeStringSlice(acc.Models), encodeStringSlice(acc.Apps), acc.Notes,
		acc.SortOrder, acc.SortOrder, ts, id,
	)
	if err != nil {
		return acc, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return acc, err
	}
	if affected == 0 {
		return acc, ErrNotFound
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM quotas WHERE account_id = ?`, id); err != nil {
		return acc, err
	}
	for _, q := range acc.Quotas {
		normalizeQuota(&q)
		if err := insertQuotaTx(ctx, tx, id, q); err != nil {
			return acc, err
		}
	}

	if err := tx.Commit(); err != nil {
		return acc, err
	}
	return s.GetAccount(ctx, id, now)
}

func (s *Store) DeleteAccount(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM accounts WHERE id = ?`, id)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ReorderAccounts(ctx context.Context, orderedIDs []int64, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, `
		SELECT id FROM accounts
		ORDER BY CASE WHEN sort_order > 0 THEN sort_order ELSE 999999 END ASC, id ASC
	`)
	if err != nil {
		return err
	}
	existing := make([]int64, 0)
	existingSet := make(map[int64]struct{})
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			_ = rows.Close()
			return err
		}
		existing = append(existing, id)
		existingSet[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	_ = rows.Close()

	finalOrder := make([]int64, 0, len(existing))
	seen := make(map[int64]struct{}, len(existing))
	for _, id := range orderedIDs {
		if _, exists := existingSet[id]; !exists {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		finalOrder = append(finalOrder, id)
	}
	for _, id := range existing {
		if _, ok := seen[id]; !ok {
			finalOrder = append(finalOrder, id)
		}
	}

	ts := now.UTC().Format(time.RFC3339)
	for i, id := range finalOrder {
		if _, err := tx.ExecContext(ctx, `UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?`, i+1, ts, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) ApplyQuotaAction(ctx context.Context, quotaID int64, req model.QuotaActionRequest, now time.Time) (model.QuotaRule, error) {
	var q model.QuotaRule
	var surfacesJSON, qModelsJSON, accAlias, accProvider string
	err := s.db.QueryRowContext(ctx, `
		SELECT q.id, q.account_id, q.group_name, q.label, q.scope_type, q.surfaces_json, q.models_json, q.unit, q.limit_value, q.used_value,
		       q.window_type, q.window_hours, q.daily_reset_time, q.weekly_reset_day, q.monthly_reset_day, q.window_started_at, q.resets_at,
		       a.alias, a.provider
		FROM quotas q
		JOIN accounts a ON a.id = q.account_id
		WHERE q.id = ?
	`, quotaID).Scan(
		&q.ID, &q.AccountID, &q.GroupName, &q.Label, &q.ScopeType, &surfacesJSON, &qModelsJSON, &q.Unit,
		&q.LimitValue, &q.UsedValue, &q.WindowType, &q.WindowHours,
		&q.DailyResetTime, &q.WeeklyResetDay, &q.MonthlyResetDay, &q.WindowStartedAt, &q.ResetsAt,
		&accAlias, &accProvider,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return q, ErrNotFound
	}
	if err != nil {
		return q, err
	}
	q.Surfaces = decodeStringSlice(surfacesJSON)
	q.Models = decodeStringSlice(qModelsJSON)

	// Evaluate pending auto-reset before applying a new manual action.
	quotas.EvaluateQuota(&q, now)
	prevUsed := q.UsedValue
	prevPct := q.UsagePercent

	if err := quotas.ApplyAction(&q, req, now); err != nil {
		return q, err
	}

	if err := s.persistQuotaState(ctx, q); err != nil {
		return q, err
	}

	deltaUsed := q.UsedValue - prevUsed
	deltaPct := q.UsagePercent - prevPct
	if deltaPct < 0 {
		deltaPct = 0
	}
	shouldRecord := deltaUsed > 0.0001 || (req.Action == "exhaust_now" && prevPct < 100)
	if shouldRecord {
		if deltaUsed < 0 {
			deltaUsed = 0
		}
		ev := model.QuotaEvent{
			AccountID:         q.AccountID,
			AccountAlias:      accAlias,
			Provider:          accProvider,
			QuotaID:           q.ID,
			QuotaLabel:        q.Label,
			GroupName:         q.GroupName,
			Surfaces:          q.Surfaces,
			Models:            q.Models,
			Unit:              q.Unit,
			DeltaUsed:         deltaUsed,
			DeltaPercent:      deltaPct,
			UsedAfter:         q.UsedValue,
			UsagePercentAfter: q.UsagePercent,
			Action:            req.Action,
			ModelUsed:         strings.TrimSpace(req.ModelUsed),
			EventDate:         now.Format("2006-01-02"),
			CreatedAt:         now.UTC().Format(time.RFC3339),
		}
		if err := s.insertQuotaEvent(ctx, ev); err != nil {
			return q, err
		}
	}
	return q, nil
}

func (s *Store) insertQuotaEvent(ctx context.Context, ev model.QuotaEvent) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO quota_events (
			account_id, account_alias, provider, quota_id, quota_label, group_name,
			surfaces_json, models_json, unit, delta_used, delta_percent,
			used_after, usage_percent_after, action, model_used, event_date, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		ev.AccountID, ev.AccountAlias, ev.Provider, ev.QuotaID, ev.QuotaLabel, ev.GroupName,
		encodeStringSlice(ev.Surfaces), encodeStringSlice(ev.Models), ev.Unit,
		ev.DeltaUsed, ev.DeltaPercent, ev.UsedAfter, ev.UsagePercentAfter,
		ev.Action, ev.ModelUsed, ev.EventDate, ev.CreatedAt,
	)
	return err
}

func (s *Store) ListQuotaEvents(ctx context.Context, sinceDate string) ([]model.QuotaEvent, error) {
	query := `
		SELECT id, account_id, account_alias, provider, quota_id, quota_label, group_name,
		       surfaces_json, models_json, unit, delta_used, delta_percent,
		       used_after, usage_percent_after, action, model_used, event_date, created_at
		FROM quota_events
	`
	args := make([]any, 0, 1)
	if strings.TrimSpace(sinceDate) != "" {
		query += ` WHERE event_date >= ?`
		args = append(args, sinceDate)
	}
	query += ` ORDER BY event_date ASC, id ASC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]model.QuotaEvent, 0)
	for rows.Next() {
		var ev model.QuotaEvent
		var surfacesJSON, modelsJSON string
		if err := rows.Scan(
			&ev.ID, &ev.AccountID, &ev.AccountAlias, &ev.Provider, &ev.QuotaID, &ev.QuotaLabel, &ev.GroupName,
			&surfacesJSON, &modelsJSON, &ev.Unit, &ev.DeltaUsed, &ev.DeltaPercent,
			&ev.UsedAfter, &ev.UsagePercentAfter, &ev.Action, &ev.ModelUsed, &ev.EventDate, &ev.CreatedAt,
		); err != nil {
			return nil, err
		}
		ev.Surfaces = decodeStringSlice(surfacesJSON)
		ev.Models = decodeStringSlice(modelsJSON)
		events = append(events, ev)
	}
	return events, rows.Err()
}

func (s *Store) ExportAll(ctx context.Context, now time.Time) (model.ExportPayload, error) {
	accounts, err := s.ListAccounts(ctx, now)
	if err != nil {
		return model.ExportPayload{}, err
	}
	events, err := s.ListQuotaEvents(ctx, "")
	if err != nil {
		return model.ExportPayload{}, err
	}
	return model.ExportPayload{
		Version:    1,
		ExportedAt: now.UTC().Format(time.RFC3339),
		Accounts:   accounts,
		Events:     events,
	}, nil
}

func (s *Store) ImportAll(ctx context.Context, payload model.ExportPayload, replace bool, now time.Time) (int, error) {
	for i := range payload.Accounts {
		if err := normalizeAndValidateAccount(&payload.Accounts[i]); err != nil {
			return 0, fmt.Errorf("invalid account %d: %w", i+1, err)
		}
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	if replace {
		if _, err := tx.ExecContext(ctx, `DELETE FROM accounts`); err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM quota_events`); err != nil {
			return 0, err
		}
	}

	ts := now.UTC().Format(time.RFC3339)
	idMap := make(map[int64]int64, len(payload.Accounts))
	for _, acc := range payload.Accounts {
		oldID := acc.ID
		newID, err := insertAccountTx(ctx, tx, acc, ts)
		if err != nil {
			return 0, err
		}
		if oldID > 0 {
			idMap[oldID] = newID
		}
	}

	for _, ev := range payload.Events {
		mappedAccID := ev.AccountID
		if newID, ok := idMap[ev.AccountID]; ok {
			mappedAccID = newID
		}
		if ev.EventDate == "" {
			if t, err := time.Parse(time.RFC3339, ev.CreatedAt); err == nil {
				ev.EventDate = t.In(now.Location()).Format("2006-01-02")
			} else {
				ev.EventDate = now.Format("2006-01-02")
			}
		}
		if !replace {
			var dup int
			_ = tx.QueryRowContext(ctx, `
				SELECT COUNT(1) FROM quota_events
				WHERE created_at = ? AND account_alias = ? AND quota_label = ? AND action = ?
			`, ev.CreatedAt, ev.AccountAlias, ev.QuotaLabel, ev.Action).Scan(&dup)
			if dup > 0 {
				continue
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO quota_events (
				account_id, account_alias, provider, quota_id, quota_label, group_name,
				surfaces_json, models_json, unit, delta_used, delta_percent,
				used_after, usage_percent_after, action, model_used, event_date, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			mappedAccID, ev.AccountAlias, ev.Provider, ev.QuotaID, ev.QuotaLabel, ev.GroupName,
			encodeStringSlice(ev.Surfaces), encodeStringSlice(ev.Models), ev.Unit,
			ev.DeltaUsed, ev.DeltaPercent, ev.UsedAfter, ev.UsagePercentAfter,
			ev.Action, ev.ModelUsed, ev.EventDate, ev.CreatedAt,
		); err != nil {
			return 0, err
		}
	}

	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return len(payload.Accounts), nil
}

func (s *Store) persistQuotaState(ctx context.Context, q model.QuotaRule) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE quotas
		SET used_value = ?, window_started_at = ?, resets_at = ?
		WHERE id = ?
	`, q.UsedValue, q.WindowStartedAt, q.ResetsAt, q.ID)
	return err
}

func insertAccountTx(ctx context.Context, tx *sql.Tx, acc model.Account, ts string) (int64, error) {
	sortOrder := acc.SortOrder
	if sortOrder <= 0 {
		var maxOrder int
		_ = tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(sort_order), 0) FROM accounts`).Scan(&maxOrder)
		sortOrder = maxOrder + 1
	}
	res, err := tx.ExecContext(ctx, `
		INSERT INTO accounts (
			provider, alias, identifier, plan_name, billing_cycle, cost, currency,
			renewal_date, payment_notes, models_json, apps_json, notes, sort_order, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		acc.Provider, acc.Alias, acc.Identifier, acc.PlanName, acc.BillingCycle,
		acc.Cost, acc.Currency, acc.RenewalDate, acc.PaymentNotes,
		encodeStringSlice(acc.Models), encodeStringSlice(acc.Apps), acc.Notes, sortOrder, ts, ts,
	)
	if err != nil {
		return 0, err
	}
	accID, err := res.LastInsertId()
	if err != nil {
		return 0, err
	}
	for _, q := range acc.Quotas {
		normalizeQuota(&q)
		if err := insertQuotaTx(ctx, tx, accID, q); err != nil {
			return 0, err
		}
	}
	return accID, nil
}

func insertQuotaTx(ctx context.Context, tx *sql.Tx, accountID int64, q model.QuotaRule) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO quotas (
			account_id, group_name, label, scope_type, surfaces_json, models_json, unit, limit_value, used_value,
			window_type, window_hours, daily_reset_time, weekly_reset_day, monthly_reset_day, window_started_at, resets_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		accountID, q.GroupName, q.Label, q.ScopeType, encodeStringSlice(q.Surfaces), encodeStringSlice(q.Models), q.Unit,
		q.LimitValue, q.UsedValue, q.WindowType, q.WindowHours,
		q.DailyResetTime, q.WeeklyResetDay, q.MonthlyResetDay, q.WindowStartedAt, q.ResetsAt,
	)
	return err
}

func normalizeAndValidateAccount(acc *model.Account) error {
	acc.Provider = strings.TrimSpace(acc.Provider)
	acc.Alias = strings.TrimSpace(acc.Alias)
	if acc.Provider == "" {
		return errors.New("provider is required")
	}
	if acc.Alias == "" {
		return errors.New("account alias is required")
	}
	if acc.BillingCycle == "" {
		acc.BillingCycle = model.BillingMonthly
	}
	if acc.Currency == "" {
		acc.Currency = "USD"
	}
	acc.Currency = strings.ToUpper(strings.TrimSpace(acc.Currency))
	if acc.Cost < 0 {
		return errors.New("cost cannot be negative")
	}
	acc.Models = cleanSlice(acc.Models)
	acc.Apps = cleanSlice(acc.Apps)
	return nil
}

func normalizeQuota(q *model.QuotaRule) {
	q.GroupName = strings.TrimSpace(q.GroupName)
	q.Label = strings.TrimSpace(q.Label)
	if q.Label == "" {
		q.Label = "Primary quota"
	}
	if q.ScopeType != model.ScopeIsolated {
		q.ScopeType = model.ScopeShared
	}
	if q.Unit == "" {
		q.Unit = "messages"
	}
	if q.WindowType == "" {
		q.WindowType = model.WindowRollingHours
	}
	if q.WindowType == model.WindowRollingHours && q.WindowHours <= 0 {
		q.WindowHours = 5
	}
	if (q.WindowType == model.WindowDailyFixed || q.WindowType == model.WindowWeeklyCycle) && strings.TrimSpace(q.DailyResetTime) == "" {
		q.DailyResetTime = "00:00"
	}
	if q.WindowType == model.WindowWeeklyCycle && (q.WeeklyResetDay < 0 || q.WeeklyResetDay > 7) {
		q.WeeklyResetDay = 0
	}
	if q.WindowType == model.WindowMonthlyCycle && (q.MonthlyResetDay < 1 || q.MonthlyResetDay > 31) {
		q.MonthlyResetDay = 1
	}
	if q.LimitValue < 0 {
		q.LimitValue = 0
	}
	if q.UsedValue < 0 {
		q.UsedValue = 0
	}
	q.Surfaces = cleanSlice(q.Surfaces)
	q.Models = cleanSlice(q.Models)
}

func cleanSlice(items []string) []string {
	out := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, raw := range items {
		v := strings.TrimSpace(raw)
		if v == "" {
			continue
		}
		if _, dup := seen[v]; dup {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func encodeStringSlice(items []string) string {
	if items == nil {
		items = []string{}
	}
	b, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func decodeStringSlice(raw string) []string {
	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err != nil || items == nil {
		return []string{}
	}
	return items
}
