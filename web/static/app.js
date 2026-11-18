(() => {
  'use strict';

  const SURFACES = ['Web', 'CLI', 'IDE', 'Desktop', 'Mobile', 'API'];

  const state = {
    accounts: [],
    stats: null,
    activity: null,
    presets: [],
    activeTab: 'tab-operations',
    clockPaused: false,
    theme: localStorage.getItem('ai_hub_theme') === 'dark' ? 'dark' : 'light',
    sortMode: localStorage.getItem('ai_hub_sort_mode') === 'readiness' ? 'readiness' : 'custom',
    reorderMode: false,
    dragAccountId: null,
    activityDays: Number(localStorage.getItem('ai_hub_activity_days')) || 30,
    selectedHeatmapDate: '',
    filters: {
      search: '',
      surface: '',
      scope: '',
      status: ''
    },
    matrixSearch: '',
    matrixSurface: '',
    matrixStatus: '',
    activeQuotaTarget: null,
    collapsedAccounts: new Set(loadJsonArray('ai_hub_collapsed_accounts')),
    collapsedGroups: new Set(loadJsonArray('ai_hub_collapsed_groups')),
    lastTriggerEl: null,
    clockTimerId: null,
    refreshInFlight: false
  };

  function loadJsonArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCollapseState() {
    localStorage.setItem('ai_hub_collapsed_accounts', JSON.stringify(Array.from(state.collapsedAccounts)));
    localStorage.setItem('ai_hub_collapsed_groups', JSON.stringify(Array.from(state.collapsedGroups)));
  }

  const els = {};

  document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    applyTheme(state.theme);
    bindGlobalEvents();
    startClock();
    loadInitialData();
  });

  function cacheElements() {
    els.loadingState = document.getElementById('loading-state');
    els.errorState = document.getElementById('error-state');
    els.errorMessage = document.getElementById('error-message');
    els.retryLoadBtn = document.getElementById('retry-load-btn');
    els.liveAnnouncer = document.getElementById('live-announcer');

    els.clockToggleBtn = document.getElementById('clock-toggle-btn');
    els.clockToggleLabel = document.getElementById('clock-toggle-label');
    els.themeToggleBtn = document.getElementById('theme-toggle-btn');
    els.themeToggleLabel = document.getElementById('theme-toggle-label');
    els.headerLivePulse = document.getElementById('header-live-pulse');
    els.newAccountBtn = document.getElementById('new-account-btn');

    els.tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    els.panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

    els.filterSearch = document.getElementById('filter-search');
    els.toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    els.advancedFiltersRow = document.getElementById('advanced-filters-row');
    els.filterSurface = document.getElementById('filter-surface');
    els.filterScope = document.getElementById('filter-scope');
    els.filterStatus = document.getElementById('filter-status');
    els.clearFiltersBtn = document.getElementById('clear-filters-btn');

    els.accountsCountLabel = document.getElementById('accounts-count-label');
    els.sortModeSelect = document.getElementById('sort-mode-select');
    els.reorderModeBtn = document.getElementById('reorder-mode-btn');
    els.reorderHint = document.getElementById('reorder-hint');
    els.toggleAllAccountsBtn = document.getElementById('toggle-all-accounts-btn');
    els.emptyFirstRun = document.getElementById('empty-first-run');
    els.emptyNewAccountBtn = document.getElementById('empty-new-account-btn');
    els.emptyLoadPresetBtn = document.getElementById('empty-load-preset-btn');
    els.emptyFiltered = document.getElementById('empty-filtered');
    els.emptyFilteredDetail = document.getElementById('empty-filtered-detail');
    els.emptyClearFiltersBtn = document.getElementById('empty-clear-filters-btn');
    els.accountsList = document.getElementById('accounts-list');

    els.matrixSearch = document.getElementById('matrix-search');
    els.matrixSurface = document.getElementById('matrix-surface');
    els.matrixStatus = document.getElementById('matrix-status');
    els.matrixEmpty = document.getElementById('matrix-empty');
    els.matrixGrid = document.getElementById('matrix-grid');

    els.activityRangeSelect = document.getElementById('activity-range-select');
    els.activityEmptyHint = document.getElementById('activity-empty-hint');
    els.activityKpiGrid = document.getElementById('activity-kpi-grid');
    els.heatmapSummary = document.getElementById('heatmap-summary');
    els.heatmapMonths = document.getElementById('heatmap-months');
    els.heatmapGrid = document.getElementById('heatmap-grid');
    els.heatmapDayDetail = document.getElementById('heatmap-day-detail');
    els.topModelsWindow = document.getElementById('top-models-window');
    els.topModelsList = document.getElementById('top-models-list');
    els.surfacesWindow = document.getElementById('surfaces-window');
    els.surfacePillsRow = document.getElementById('surface-pills-row');
    els.activityAccountsWrap = document.getElementById('activity-accounts-wrap');
    els.activityAccountsTbody = document.getElementById('activity-accounts-tbody');

    els.costsEmpty = document.getElementById('costs-empty');
    els.currencySummaryGrid = document.getElementById('currency-summary-grid');
    els.renewalsWrap = document.getElementById('renewals-wrap');
    els.renewalsTbody = document.getElementById('renewals-tbody');

    els.importForm = document.getElementById('import-form');
    els.importFile = document.getElementById('import-file');
    els.importMode = document.getElementById('import-mode');
    els.importFeedback = document.getElementById('import-feedback');
    els.footerStats = document.getElementById('footer-stats');

    els.accountModal = document.getElementById('account-modal');
    els.accountModalTitle = document.getElementById('account-modal-title');
    els.closeAccountModal = document.getElementById('close-account-modal');
    els.cancelAccountModal = document.getElementById('cancel-account-modal');
    els.accountForm = document.getElementById('account-form');
    els.accountFormError = document.getElementById('account-form-error');
    els.presetSelect = document.getElementById('preset-select');
    els.applyPresetBtn = document.getElementById('apply-preset-btn');
    els.accId = document.getElementById('acc-id');
    els.accProvider = document.getElementById('acc-provider');
    els.accAlias = document.getElementById('acc-alias');
    els.accIdentifier = document.getElementById('acc-identifier');
    els.accPlan = document.getElementById('acc-plan');
    els.accBillingCycle = document.getElementById('acc-billing-cycle');
    els.accCost = document.getElementById('acc-cost');
    els.accCurrency = document.getElementById('acc-currency');
    els.accRenewal = document.getElementById('acc-renewal');
    els.accPaymentNotes = document.getElementById('acc-payment-notes');
    els.accModels = document.getElementById('acc-models');
    els.syncModelsBtn = document.getElementById('sync-models-btn');
    els.accApps = document.getElementById('acc-apps');
    els.accNotes = document.getElementById('acc-notes');
    els.addQuotaPairBtn = document.getElementById('add-quota-pair-btn');
    els.addQuotaRuleBtn = document.getElementById('add-quota-rule-btn');
    els.addQuotaPairBottomBtn = document.getElementById('add-quota-pair-bottom-btn');
    els.addQuotaRuleBottomBtn = document.getElementById('add-quota-rule-bottom-btn');
    els.quotasEditorList = document.getElementById('quotas-editor-list');

    els.quotaModal = document.getElementById('quota-modal');
    els.closeQuotaModal = document.getElementById('close-quota-modal');
    els.cancelQuotaModal = document.getElementById('cancel-quota-modal');
    els.quotaForm = document.getElementById('quota-form');
    els.qmQuotaId = document.getElementById('qm-quota-id');
    els.qmContext = document.getElementById('qm-context');
    els.qmValMode = document.getElementById('qm-val-mode');
    els.qmValLabel = document.getElementById('qm-val-label');
    els.qmVal = document.getElementById('qm-val');
    els.qmTimerMode = document.getElementById('qm-timer-mode');
    els.qmDhmWrap = document.getElementById('qm-dhm-wrap');
    els.qmDays = document.getElementById('qm-days');
    els.qmHours = document.getElementById('qm-hours');
    els.qmMins = document.getElementById('qm-mins');
    els.qmTimeWrap = document.getElementById('qm-time-wrap');
    els.qmUntilDate = document.getElementById('qm-until-date');
    els.qmUntilTime = document.getElementById('qm-until-time');
    els.qmModelWrap = document.getElementById('qm-model-wrap');
    els.qmModelUsed = document.getElementById('qm-model-used');
    els.qmGroupWrap = document.getElementById('qm-group-wrap');
    els.qmApplyGroup = document.getElementById('qm-apply-group');
    els.qmApplyGroupLabel = document.getElementById('qm-apply-group-label');
    els.qmFormError = document.getElementById('qm-form-error');
    els.qmResetBtn = document.getElementById('qm-reset-btn');
    els.qmExhaustBtn = document.getElementById('qm-exhaust-btn');

    els.deleteModal = document.getElementById('delete-modal');
    els.closeDeleteModal = document.getElementById('close-delete-modal');
    els.cancelDeleteModal = document.getElementById('cancel-delete-modal');
    els.deleteAccountId = document.getElementById('delete-account-id');
    els.deleteConfirmText = document.getElementById('delete-confirm-text');
    els.confirmDeleteBtn = document.getElementById('confirm-delete-btn');
  }

  function bindGlobalEvents() {
    els.retryLoadBtn.addEventListener('click', loadInitialData);

    els.clockToggleBtn.addEventListener('click', () => {
      state.clockPaused = !state.clockPaused;
      els.clockToggleBtn.setAttribute('aria-pressed', String(state.clockPaused));
      els.clockToggleLabel.textContent = state.clockPaused ? 'Resume clock' : 'Pause clock';
      announce(state.clockPaused ? 'Countdown clock paused.' : 'Countdown clock resumed.');
    });

    els.themeToggleBtn.addEventListener('click', () => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      announce(next === 'dark' ? 'Dark theme enabled.' : 'Light theme enabled.');
    });

    els.newAccountBtn.addEventListener('click', (e) => openAccountModal(null, e.currentTarget));
    els.emptyNewAccountBtn.addEventListener('click', (e) => openAccountModal(null, e.currentTarget));
    els.emptyLoadPresetBtn.addEventListener('click', (e) => {
      openAccountModal(null, e.currentTarget);
      els.presetSelect.focus();
    });

    els.tabs.forEach((tab, idx) => {
      tab.addEventListener('click', () => switchTab(tab.id));
      tab.addEventListener('keydown', (e) => {
        let nextIdx = null;
        if (e.key === 'ArrowRight') nextIdx = (idx + 1) % els.tabs.length;
        else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + els.tabs.length) % els.tabs.length;
        else if (e.key === 'Home') nextIdx = 0;
        else if (e.key === 'End') nextIdx = els.tabs.length - 1;
        if (nextIdx !== null) {
          e.preventDefault();
          switchTab(els.tabs[nextIdx].id);
          els.tabs[nextIdx].focus();
        }
      });
    });

    els.filterSearch.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderAll();
    });
    els.filterSurface.addEventListener('change', (e) => {
      state.filters.surface = e.target.value;
      renderAll();
    });
    els.filterScope.addEventListener('change', (e) => {
      state.filters.scope = e.target.value;
      renderAll();
    });
    els.filterStatus.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      renderAll();
    });

    els.toggleFiltersBtn.addEventListener('click', () => {
      const nextOpen = els.advancedFiltersRow.hidden;
      els.advancedFiltersRow.hidden = !nextOpen;
      els.toggleFiltersBtn.setAttribute('aria-expanded', String(nextOpen));
    });

    const resetFiltersHandler = () => {
      state.filters = { search: '', surface: '', scope: '', status: '' };
      els.filterSearch.value = '';
      els.filterSurface.value = '';
      els.filterScope.value = '';
      els.filterStatus.value = '';
      renderAll();
    };
    els.clearFiltersBtn.addEventListener('click', resetFiltersHandler);
    els.emptyClearFiltersBtn.addEventListener('click', resetFiltersHandler);

    els.matrixSearch.addEventListener('input', (e) => {
      state.matrixSearch = e.target.value;
      renderMatrix();
    });
    els.matrixSurface.addEventListener('change', (e) => {
      state.matrixSurface = e.target.value;
      renderMatrix();
    });
    els.matrixStatus.addEventListener('change', (e) => {
      state.matrixStatus = e.target.value;
      renderMatrix();
    });

    els.sortModeSelect.value = state.sortMode;
    els.sortModeSelect.addEventListener('change', (e) => {
      state.sortMode = e.target.value === 'readiness' ? 'readiness' : 'custom';
      localStorage.setItem('ai_hub_sort_mode', state.sortMode);
      if (state.sortMode !== 'custom') {
        state.reorderMode = false;
      }
      renderOperations();
    });

    els.reorderModeBtn.addEventListener('click', () => {
      state.reorderMode = !state.reorderMode;
      if (state.reorderMode && state.sortMode !== 'custom') {
        state.sortMode = 'custom';
        els.sortModeSelect.value = 'custom';
        localStorage.setItem('ai_hub_sort_mode', 'custom');
      }
      renderOperations();
      announce(state.reorderMode ? 'Reorder mode enabled.' : 'Reorder mode closed.');
    });

    els.activityRangeSelect.value = String(state.activityDays);
    els.activityRangeSelect.addEventListener('change', async (e) => {
      state.activityDays = Number(e.target.value) || 30;
      localStorage.setItem('ai_hub_activity_days', String(state.activityDays));
      try {
        state.activity = await apiFetch(`/api/activity?days=${state.activityDays}`);
        renderActivity();
      } catch (err) {
        els.errorState.hidden = false;
        els.errorMessage.textContent = err.message;
      }
    });

    els.toggleAllAccountsBtn.addEventListener('click', toggleAllAccountsCollapse);

    els.importForm.addEventListener('submit', handleImportSubmit);

    // Account modal bindings
    els.closeAccountModal.addEventListener('click', () => closeDialog(els.accountModal));
    els.cancelAccountModal.addEventListener('click', () => closeDialog(els.accountModal));
    els.accountModal.addEventListener('close', restoreFocus);
    els.applyPresetBtn.addEventListener('click', applySelectedPreset);
    els.syncModelsBtn.addEventListener('click', syncAccountModelsFromGroups);
    const addPairHandler = () => addEditorGroup(defaultPairQuotaGroup(), true);
    const addSingleHandler = () => addEditorGroup(defaultSingleQuotaGroup(), true);
    els.addQuotaPairBtn.addEventListener('click', addPairHandler);
    els.addQuotaPairBottomBtn.addEventListener('click', addPairHandler);
    els.addQuotaRuleBtn.addEventListener('click', addSingleHandler);
    els.addQuotaRuleBottomBtn.addEventListener('click', addSingleHandler);
    els.accountForm.addEventListener('submit', handleAccountFormSubmit);

    // Quota quick-adjust modal bindings
    els.closeQuotaModal.addEventListener('click', () => closeDialog(els.quotaModal));
    els.cancelQuotaModal.addEventListener('click', () => closeDialog(els.quotaModal));
    els.quotaModal.addEventListener('close', restoreFocus);
    els.qmValMode.addEventListener('change', handleQuotaValModeChange);
    els.qmTimerMode.addEventListener('change', updateQuotaTimerVisibility);
    els.qmResetBtn.addEventListener('click', handleQuotaResetQuick);
    els.qmExhaustBtn.addEventListener('click', handleQuotaExhaustQuick);
    els.quotaForm.addEventListener('submit', handleQuotaFormSubmit);

    // Close account action menus on outside click or Escape
    document.addEventListener('click', (e) => {
      document.querySelectorAll('.acc-menu[open]').forEach((menu) => {
        if (!menu.contains(e.target)) {
          menu.open = false;
        }
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.acc-menu[open]').forEach((menu) => {
          menu.open = false;
        });
      }
    });

    // Delete modal bindings
    els.closeDeleteModal.addEventListener('click', () => closeDialog(els.deleteModal));
    els.cancelDeleteModal.addEventListener('click', () => closeDialog(els.deleteModal));
    els.deleteModal.addEventListener('close', restoreFocus);
    els.confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('ai_hub_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    els.themeToggleBtn.setAttribute('aria-pressed', String(theme === 'dark'));
    els.themeToggleLabel.textContent = theme === 'dark' ? 'Dark Graphite' : 'Warm Paper';
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    els.tabs.forEach((tab) => {
      const active = tab.id === tabId;
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('tabindex', active ? '0' : '-1');
      const panelId = tab.getAttribute('aria-controls');
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.hidden = !active;
      }
    });
  }

  function announce(msg) {
    els.liveAnnouncer.textContent = '';
    requestAnimationFrame(() => {
      els.liveAnnouncer.textContent = msg;
    });
  }

  async function apiFetch(url, options = {}) {
    const resp = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const text = await resp.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!resp.ok) {
      const msg = (data && data.error) ? data.error : `HTTP error ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadInitialData() {
    els.loadingState.hidden = false;
    els.errorState.hidden = true;
    els.panels.forEach((p) => { p.hidden = true; });

    try {
      const [accounts, stats, activity, presets] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/stats'),
        apiFetch(`/api/activity?days=${state.activityDays}`),
        apiFetch('/api/presets')
      ]);
      state.accounts = Array.isArray(accounts) ? accounts : [];
      state.stats = stats;
      state.activity = activity;
      state.presets = Array.isArray(presets) ? presets : [];
      populatePresetSelect();
      els.loadingState.hidden = true;
      switchTab(state.activeTab);
      renderAll();
    } catch (err) {
      els.loadingState.hidden = true;
      els.errorState.hidden = false;
      els.errorMessage.textContent = err.message || 'Check that the Go server is running.';
    }
  }

  async function refreshData() {
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      const [accounts, stats, activity] = await Promise.all([
        apiFetch('/api/accounts'),
        apiFetch('/api/stats'),
        apiFetch(`/api/activity?days=${state.activityDays}`)
      ]);
      state.accounts = Array.isArray(accounts) ? accounts : [];
      state.stats = stats;
      state.activity = activity;
      els.errorState.hidden = true;
      renderAll();
    } catch (err) {
      els.errorState.hidden = false;
      els.errorMessage.textContent = err.message;
    } finally {
      state.refreshInFlight = false;
    }
  }

  function startClock() {
    if (state.clockTimerId) clearInterval(state.clockTimerId);
    state.clockTimerId = setInterval(() => {
      if (state.clockPaused) return;
      const nowMs = Date.now();
      let needsBackendSync = false;

      document.querySelectorAll('span[data-resets-at], td[data-resets-at]').forEach((node) => {
        const resetsAt = node.getAttribute('data-resets-at');
        if (!resetsAt) return;
        const targetMs = Date.parse(resetsAt);
        if (Number.isNaN(targetMs)) return;
        const diffSec = Math.ceil((targetMs - nowMs) / 1000);
        if (diffSec <= 0) {
          node.textContent = 'Resetting window...';
          needsBackendSync = true;
        } else {
          node.textContent = `Resets in ${formatDuration(diffSec)} (${formatLocalClock(targetMs)})`;
        }
      });

      if (needsBackendSync) {
        refreshData();
      }
    }, 1000);
  }

  function populatePresetSelect() {
    els.presetSelect.innerHTML = '';
    const baseOpt = document.createElement('option');
    baseOpt.value = '';
    baseOpt.textContent = 'Select a template to autofill...';
    els.presetSelect.appendChild(baseOpt);

    state.presets.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.display_name;
      els.presetSelect.appendChild(opt);
    });
  }

  function renderAll() {
    renderOperations();
    renderMatrix();
    renderActivity();
    renderCosts();
    renderFooter();
    renderHeaderPulse();
  }

  function renderHeaderPulse() {
    if (!state.stats || state.accounts.length === 0) {
      els.headerLivePulse.textContent = 'Local ledger of accounts, limits, and resets';
      return;
    }
    const parts = [
      `${state.stats.total_accounts} ${state.stats.total_accounts === 1 ? 'account' : 'accounts'}`,
      `${state.stats.available_quotas} ready`,
      `${state.stats.cooldown_quotas} cooldown`
    ];
    if (state.stats.cost_by_currency && state.stats.cost_by_currency.length > 0) {
      const c = state.stats.cost_by_currency[0];
      parts.push(`${formatMoney(c.monthly_equivalent_total)} ${c.currency}/mo`);
    }
    els.headerLivePulse.textContent = parts.join(' · ');
  }

  function renderFooter() {
    if (!state.stats) {
      els.footerStats.textContent = '';
      return;
    }
    const accLabel = state.stats.total_accounts === 1 ? 'account' : 'accounts';
    els.footerStats.textContent =
      `${state.stats.total_accounts} ${accLabel} | ${state.stats.available_quotas} quotas ready | ${state.stats.cooldown_quotas} on cooldown`;
  }

  function hasActiveFilters() {
    const f = state.filters;
    return Boolean(f.search.trim() || f.surface || f.scope || f.status);
  }

  function filterAccounts(accounts) {
    const q = state.filters.search.trim().toLowerCase();
    const surface = state.filters.surface;
    const scope = state.filters.scope;
    const status = state.filters.status;

    return accounts.filter((acc) => {
      if (q) {
        const quotaTokens = (acc.quotas || []).flatMap((rule) => [
          rule.group_name || '',
          rule.label || '',
          ...(rule.models || [])
        ]);
        const haystack = [
          acc.provider,
          acc.alias,
          acc.identifier,
          acc.plan_name,
          ...(acc.models || []),
          ...(acc.apps || []),
          ...quotaTokens
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (surface || scope || status) {
        const quotas = acc.quotas || [];
        if (quotas.length === 0) {
          if (scope || status) return false;
          if (surface) {
            const appMatch = (acc.apps || []).some((a) => a.toLowerCase().includes(surface.toLowerCase()));
            if (!appMatch) return false;
          }
          return true;
        }
        const matchesQuota = quotas.some((rule) => {
          if (surface && !(rule.surfaces || []).includes(surface)) return false;
          if (scope && rule.scope_type !== scope) return false;
          if (status && rule.status !== status) return false;
          return true;
        });
        if (!matchesQuota) return false;
      }
      return true;
    });
  }

  function sortAccountsByReadiness(accounts) {
    const score = (acc) => {
      const quotas = acc.quotas || [];
      if (quotas.length === 0) return 1;
      if (quotas.some((q) => q.status === 'available')) return 0;
      if (quotas.some((q) => q.status === 'warning')) return 1;
      return 2;
    };
    return [...accounts].sort((a, b) => score(a) - score(b));
  }

  function sortAccountsByMode(accounts) {
    if (state.sortMode === 'readiness') {
      return sortAccountsByReadiness(accounts);
    }
    return [...accounts];
  }

  function renderOperations() {
    els.clearFiltersBtn.hidden = !hasActiveFilters();
    const advCount = [state.filters.surface, state.filters.scope, state.filters.status].filter(Boolean).length;
    els.toggleFiltersBtn.textContent = advCount > 0 ? `Filters (${advCount})` : 'Filters';
    if (advCount > 0 && els.advancedFiltersRow.hidden) {
      els.advancedFiltersRow.hidden = false;
      els.toggleFiltersBtn.setAttribute('aria-expanded', 'true');
    }

    const total = state.accounts.length;
    if (total === 0) {
      state.reorderMode = false;
      els.emptyFirstRun.hidden = false;
      els.emptyFiltered.hidden = true;
      els.accountsList.innerHTML = '';
      els.accountsCountLabel.textContent = '0 accounts';
      els.toggleAllAccountsBtn.hidden = true;
      els.reorderModeBtn.hidden = true;
      els.reorderHint.hidden = true;
      return;
    }

    els.emptyFirstRun.hidden = true;
    const filtered = sortAccountsByMode(filterAccounts(state.accounts));
    const accWord = total === 1 ? 'account' : 'accounts';
    els.accountsCountLabel.textContent = filtered.length === total
      ? `${total} ${accWord}`
      : `${filtered.length} of ${total}`;

    const canReorder = filtered.length > 1 && !hasActiveFilters();
    if (!canReorder) state.reorderMode = false;
    els.reorderModeBtn.hidden = !canReorder;
    els.reorderModeBtn.textContent = state.reorderMode ? 'Done ordering' : 'Reorder';
    els.reorderModeBtn.setAttribute('aria-pressed', String(state.reorderMode));
    els.reorderHint.hidden = !state.reorderMode;

    const collapsible = filtered.filter((acc) => (acc.quotas || []).length > 0);
    if (collapsible.length > 0 && !hasActiveFilters()) {
      const allCollapsed = collapsible.every((acc) => state.collapsedAccounts.has(acc.id));
      els.toggleAllAccountsBtn.hidden = false;
      els.toggleAllAccountsBtn.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
      els.toggleAllAccountsBtn.setAttribute('aria-pressed', String(allCollapsed));
    } else {
      els.toggleAllAccountsBtn.hidden = true;
    }

    if (filtered.length === 0) {
      els.emptyFiltered.hidden = false;
      els.emptyFilteredDetail.textContent = 'No accounts match the active filters. Adjust your criteria or clear the search.';
      els.accountsList.innerHTML = '';
      return;
    }

    els.emptyFiltered.hidden = true;
    els.accountsList.innerHTML = '';
    filtered.forEach((acc, idx) => {
      els.accountsList.appendChild(buildAccountCard(acc, idx, filtered.length));
    });
  }

  async function moveAccountByDelta(accountId, delta) {
    const ids = state.accounts.map((a) => a.id);
    const idx = ids.indexOf(accountId);
    const nextIdx = idx + delta;
    if (idx < 0 || nextIdx < 0 || nextIdx >= ids.length) return;
    [ids[idx], ids[nextIdx]] = [ids[nextIdx], ids[idx]];
    await persistAccountOrder(ids);
  }

  async function reorderAccountToTarget(dragId, targetId) {
    if (!dragId || !targetId || dragId === targetId) return;
    const ids = state.accounts.map((a) => a.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, moved);
    await persistAccountOrder(ids);
  }

  async function persistAccountOrder(orderedIDs) {
    if (state.sortMode !== 'custom') {
      state.sortMode = 'custom';
      els.sortModeSelect.value = 'custom';
      localStorage.setItem('ai_hub_sort_mode', 'custom');
    }
    const byId = new Map(state.accounts.map((a) => [a.id, a]));
    const nextAccounts = [];
    orderedIDs.forEach((id, i) => {
      const acc = byId.get(id);
      if (acc) nextAccounts.push({ ...acc, sort_order: i + 1 });
    });
    state.accounts = nextAccounts;
    renderAll();

    try {
      const updated = await apiFetch('/api/accounts/reorder', {
        method: 'PUT',
        body: JSON.stringify({ account_ids: orderedIDs })
      });
      if (Array.isArray(updated)) {
        state.accounts = updated;
        renderAll();
      }
      announce('Account order saved.');
    } catch (err) {
      els.errorState.hidden = false;
      els.errorMessage.textContent = err.message;
      await refreshData();
    }
  }

  function toggleAllAccountsCollapse() {
    const collapsible = filterAccounts(state.accounts).filter((acc) => (acc.quotas || []).length > 0);
    if (collapsible.length === 0) return;
    const allCollapsed = collapsible.every((acc) => state.collapsedAccounts.has(acc.id));
    collapsible.forEach((acc) => {
      if (allCollapsed) state.collapsedAccounts.delete(acc.id);
      else state.collapsedAccounts.add(acc.id);
    });
    saveCollapseState();
    renderOperations();
  }

  function groupQuotas(acc) {
    const groups = [];
    const byName = new Map();

    (acc.quotas || []).forEach((q) => {
      const name = (q.group_name || '').trim() || 'General';
      const key = name.toLowerCase();
      let grp = byName.get(key);
      if (!grp) {
        grp = {
          name,
          quotas: [],
          surfaceSet: new Set(),
          modelSet: new Set(),
          scopeTypes: new Set()
        };
        byName.set(key, grp);
        groups.push(grp);
      }
      grp.quotas.push(q);
      (q.surfaces || []).forEach((s) => grp.surfaceSet.add(s));
      (q.models || []).forEach((m) => grp.modelSet.add(m));
      grp.scopeTypes.add(q.scope_type || 'shared');
    });

    return groups.map((g) => {
      const surfaces = Array.from(g.surfaceSet);
      const models = Array.from(g.modelSet);
      let status = 'available';
      if (g.quotas.some((q) => q.status === 'cooldown')) status = 'cooldown';
      else if (g.quotas.some((q) => q.status === 'warning')) status = 'warning';

      let scopeLabel = 'Shared';
      if (g.scopeTypes.size === 1 && g.scopeTypes.has('isolated')) {
        scopeLabel = 'Exclusive';
      } else if (g.scopeTypes.size > 1) {
        scopeLabel = 'Mixed';
      }

      const activeTimers = g.quotas
        .filter((q) => q.resets_at && q.remaining_seconds > 0)
        .sort((a, b) => a.remaining_seconds - b.remaining_seconds);

      return {
        name: g.name,
        quotas: g.quotas,
        surfaces,
        models,
        scopeLabel: surfaces.length > 0 ? `${scopeLabel}: ${surfaces.join(', ')}` : scopeLabel,
        status,
        shortestCooldown: activeTimers.length > 0 ? activeTimers[0] : null
      };
    });
  }

  function buildAccountCard(acc, idx = 0, totalFiltered = 1) {
    const card = document.createElement('article');
    card.className = 'account-card';
    if (state.reorderMode) {
      card.classList.add('is-reordering');
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        state.dragAccountId = acc.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(acc.id));
        }
      });
      card.addEventListener('dragover', (e) => {
        if (!state.dragAccountId || state.dragAccountId === acc.id) return;
        e.preventDefault();
        card.classList.add('is-drag-over');
      });
      card.addEventListener('dragleave', () => {
        card.classList.remove('is-drag-over');
      });
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('is-drag-over');
        const dragId = state.dragAccountId;
        state.dragAccountId = null;
        if (dragId && dragId !== acc.id) {
          reorderAccountToTarget(dragId, acc.id);
        }
      });
      card.addEventListener('dragend', () => {
        state.dragAccountId = null;
        document.querySelectorAll('.account-card.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'));
      });
    }

    const groups = groupQuotas(acc);
    const isAccountCollapsed = state.collapsedAccounts.has(acc.id) && !hasActiveFilters();
    if (isAccountCollapsed) card.classList.add('is-collapsed');

    // Header
    const header = document.createElement('div');
    header.className = 'account-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'account-header-left';

    if (groups.length > 0) {
      const toggleAccBtn = document.createElement('button');
      toggleAccBtn.type = 'button';
      toggleAccBtn.className = 'acc-collapse-btn';
      toggleAccBtn.setAttribute('aria-expanded', String(!isAccountCollapsed));
      toggleAccBtn.setAttribute('aria-label', isAccountCollapsed ? `Expand ${acc.alias}` : `Collapse ${acc.alias}`);
      toggleAccBtn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 4l4 4-4 4"></path></svg>';
      toggleAccBtn.addEventListener('click', () => {
        if (state.collapsedAccounts.has(acc.id)) state.collapsedAccounts.delete(acc.id);
        else state.collapsedAccounts.add(acc.id);
        saveCollapseState();
        renderOperations();
      });
      headerLeft.appendChild(toggleAccBtn);
    }

    const titleGroup = document.createElement('div');
    titleGroup.className = 'account-title-group';

    const titleLine = document.createElement('div');
    titleLine.className = 'account-title-row';

    const nameEl = document.createElement('h3');
    nameEl.className = 'account-name';
    nameEl.textContent = acc.alias;
    titleLine.appendChild(nameEl);

    const providerPill = document.createElement('span');
    providerPill.className = 'account-plan-pill';
    providerPill.textContent = acc.plan_name ? `${acc.provider} · ${acc.plan_name}` : acc.provider;
    titleLine.appendChild(providerPill);

    const metaParts = [formatAccountCost(acc)];
    if (acc.identifier) metaParts.push(acc.identifier);
    if (acc.renewal_date) metaParts.push(`Renews ${acc.renewal_date}`);
    const metaEl = document.createElement('p');
    metaEl.className = 'account-meta mono-num';
    metaEl.textContent = metaParts.join(' · ');

    titleGroup.append(titleLine, metaEl);
    headerLeft.appendChild(titleGroup);

    // Kebab menu (···) replacing repetitive text buttons
    const menu = document.createElement('details');
    menu.className = 'acc-menu';

    const menuTrigger = document.createElement('summary');
    menuTrigger.className = 'btn-icon acc-menu-btn';
    menuTrigger.setAttribute('aria-label', `Options for ${acc.alias}`);
    menuTrigger.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.5" cy="8" r="1.25"/></svg>';

    const menuList = document.createElement('div');
    menuList.className = 'acc-menu-popover';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'acc-menu-item';
    editBtn.textContent = 'Edit account';
    editBtn.addEventListener('click', (e) => {
      menu.open = false;
      openAccountModal(acc, menuTrigger);
    });

    const duplicateBtn = document.createElement('button');
    duplicateBtn.type = 'button';
    duplicateBtn.className = 'acc-menu-item';
    duplicateBtn.textContent = 'Duplicate account';
    duplicateBtn.addEventListener('click', (e) => {
      menu.open = false;
      openDuplicateAccountModal(acc, menuTrigger);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'acc-menu-item is-danger';
    deleteBtn.textContent = 'Delete account';
    deleteBtn.addEventListener('click', (e) => {
      menu.open = false;
      openDeleteModal(acc, menuTrigger);
    });

    menuList.append(editBtn, duplicateBtn);
    if (state.sortMode === 'custom' && !hasActiveFilters() && totalFiltered > 1) {
      if (idx > 0) {
        const upMenuBtn = document.createElement('button');
        upMenuBtn.type = 'button';
        upMenuBtn.className = 'acc-menu-item';
        upMenuBtn.textContent = 'Move up';
        upMenuBtn.addEventListener('click', () => {
          menu.open = false;
          moveAccountByDelta(acc.id, -1);
        });
        menuList.appendChild(upMenuBtn);
      }
      if (idx < totalFiltered - 1) {
        const downMenuBtn = document.createElement('button');
        downMenuBtn.type = 'button';
        downMenuBtn.className = 'acc-menu-item';
        downMenuBtn.textContent = 'Move down';
        downMenuBtn.addEventListener('click', () => {
          menu.open = false;
          moveAccountByDelta(acc.id, 1);
        });
        menuList.appendChild(downMenuBtn);
      }
    }
    menuList.appendChild(deleteBtn);
    menu.append(menuTrigger, menuList);

    const headerActions = document.createElement('div');
    headerActions.className = 'acc-header-actions';
    if (state.reorderMode && totalFiltered > 1) {
      const reorderCtrls = document.createElement('div');
      reorderCtrls.className = 'acc-reorder-controls';

      const handle = document.createElement('span');
      handle.className = 'acc-drag-handle';
      handle.setAttribute('aria-hidden', 'true');
      handle.title = 'Drag card to reorder';
      handle.textContent = '::';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn btn-secondary btn-xs';
      upBtn.setAttribute('aria-label', `Move ${acc.alias} up`);
      upBtn.textContent = '↑';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => moveAccountByDelta(acc.id, -1));

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn btn-secondary btn-xs';
      downBtn.setAttribute('aria-label', `Move ${acc.alias} down`);
      downBtn.textContent = '↓';
      downBtn.disabled = idx >= totalFiltered - 1;
      downBtn.addEventListener('click', () => moveAccountByDelta(acc.id, 1));

      reorderCtrls.append(handle, upBtn, downBtn);
      headerActions.appendChild(reorderCtrls);
    }
    headerActions.appendChild(menu);

    header.append(headerLeft, headerActions);
    card.appendChild(header);

    if (isAccountCollapsed) {
      const summaryLine = document.createElement('div');
      summaryLine.className = 'account-collapsed-summary';
      groups.forEach((grp) => {
        const item = document.createElement('span');
        item.className = 'collapsed-group-pill';
        const capped = (grp.quotas || []).filter((q) => q.limit_value > 0);
        const minRem = capped.length > 0
          ? Math.min(...capped.map((q) => Math.max(0, 100 - (q.usage_percent || 0))))
          : (grp.status === 'cooldown' ? 0 : 100);
        const statusHint = grp.status === 'cooldown' && grp.shortestCooldown
          ? formatDuration(grp.shortestCooldown.remaining_seconds)
          : `${minRem}%`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'cg-name';
        nameSpan.textContent = grp.name;

        const valSpan = document.createElement('span');
        valSpan.className = 'cg-val mono-num';
        valSpan.textContent = statusHint;

        item.append(nameSpan, buildQuotaRingSvg(minRem, grp.status, 14), valSpan);
        summaryLine.appendChild(item);
      });
      card.appendChild(summaryLine);
      return card;
    }

    // Compact 2-column Quota Tiles Grid
    const tilesGrid = document.createElement('div');
    tilesGrid.className = 'quota-tiles-grid';

    if (groups.length === 0) {
      const noQuota = document.createElement('p');
      noQuota.className = 'account-meta';
      noQuota.textContent = 'No quota rules configured yet. Edit this account to define limits and windows.';
      tilesGrid.appendChild(noQuota);
    } else {
      groups.forEach((grp) => {
        tilesGrid.appendChild(buildQuotaTile(acc, grp, groups.length));
      });
    }
    card.appendChild(tilesGrid);

    // Models & Apps (only list ungrouped models if quota tiles already show group models)
    const governedModels = new Set();
    groups.forEach((grp) => grp.models.forEach((m) => governedModels.add(m.trim().toLowerCase())));
    const extraModels = (acc.models || []).filter((m) => !governedModels.has((m || '').trim().toLowerCase()));

    const capBlock = document.createElement('div');
    capBlock.className = 'capabilities-block';

    if (extraModels.length > 0) {
      const mRow = document.createElement('div');
      mRow.className = 'models-inline-row';
      const mLabel = document.createElement('span');
      mLabel.className = 'cap-inline-label';
      mLabel.textContent = groups.length > 0 ? 'Other models:' : 'Account models:';
      mRow.appendChild(mLabel);
      extraModels.forEach((modelName) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'model-chip';
        chip.textContent = modelName;
        chip.addEventListener('click', () => {
          state.filters.search = modelName;
          els.filterSearch.value = modelName;
          renderAll();
        });
        mRow.appendChild(chip);
      });
      capBlock.appendChild(mRow);
    }

    if (acc.apps && acc.apps.length > 0) {
      const appLine = document.createElement('p');
      appLine.className = 'account-apps-line';
      appLine.textContent = `Apps: ${acc.apps.join(' · ')}`;
      capBlock.appendChild(appLine);
    }

    if (capBlock.childElementCount > 0) {
      card.appendChild(capBlock);
    }

    if (acc.notes) {
      const notes = document.createElement('p');
      notes.className = 'account-notes';
      notes.textContent = acc.notes;
      card.appendChild(notes);
    }

    return card;
  }

  function getQuotaTone(remPct, status) {
    if (status === 'cooldown' || remPct <= 15) return 'danger';
    if (status === 'warning' || remPct < 50) return 'warn';
    return 'ok';
  }

  function buildQuotaTile(acc, grp, totalGroups) {
    const tile = document.createElement('section');
    const capped = (grp.quotas || []).filter((q) => q.limit_value > 0);
    const minRem = capped.length > 0
      ? Math.min(...capped.map((q) => Math.max(0, 100 - (q.usage_percent || 0))))
      : (grp.status === 'cooldown' ? 0 : 100);
    const tileTone = getQuotaTone(minRem, grp.status);
    const tileStateCls = tileTone === 'danger' ? 'is-cooldown' : tileTone === 'warn' ? 'is-warning' : 'is-available';
    tile.className = `quota-tile ${tileStateCls}`;

    const head = document.createElement('div');
    head.className = 'qt-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'qt-title-wrap';

    const title = document.createElement('h4');
    title.className = 'qt-title';
    title.textContent = (grp.name === 'General' && totalGroups === 1) ? 'Primary quotas' : grp.name;

    const scopeLine = document.createElement('span');
    scopeLine.className = 'qt-scope';
    const surfTxt = grp.surfaces && grp.surfaces.length > 0 ? grp.surfaces.join(', ') : 'General';
    const scopeWord = grp.scopeLabel.startsWith('Exclusive') ? 'Exclusive' : grp.scopeLabel.startsWith('Mixed') ? 'Mixed' : 'Shared';
    scopeLine.textContent = `${surfTxt} · ${scopeWord}`;
    titleWrap.append(title, scopeLine);

    head.append(titleWrap);
    if (grp.status !== 'available') {
      const statusTag = document.createElement('span');
      statusTag.className = `tag ${statusTagClass(grp.status)}`;
      statusTag.textContent = statusLabelText(grp.status);
      head.append(statusTag);
    }
    tile.appendChild(head);

    if (grp.models.length > 0) {
      const modelsLine = document.createElement('p');
      modelsLine.className = 'qt-models';
      modelsLine.textContent = grp.models.join(', ');
      tile.appendChild(modelsLine);
    }

    const rowsWrap = document.createElement('div');
    rowsWrap.className = 'qt-rows';
    grp.quotas.forEach((q) => {
      rowsWrap.appendChild(buildQuotaTileRow(acc, q));
    });
    tile.appendChild(rowsWrap);

    return tile;
  }

  function buildQuotaTileRow(acc, q) {
    const remPct = q.limit_value > 0
      ? Math.max(0, Math.min(100, 100 - (q.usage_percent || 0)))
      : (q.status === 'cooldown' ? 0 : 100);
    const tone = getQuotaTone(remPct, q.status);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `qt-row is-${q.status || 'available'} tone-${tone}`;
    const unitLabel = formatUnit(q.unit);
    let valText = '';
    if (q.limit_value > 0) {
      if (q.unit === 'percent') {
        valText = `${remPct}% left`;
      } else {
        const remVal = Math.max(0, q.limit_value - (q.used_value || 0));
        valText = `${formatNumber(remVal)}/${formatNumber(q.limit_value)} (${remPct}%)`;
      }
    } else {
      valText = `${formatNumber(q.used_value)} ${unitLabel}`;
    }

    let timerText = describeCompactIdleWindow(q);
    if (q.resets_at && q.remaining_seconds > 0) {
      timerText = `Resets in ${formatDuration(q.remaining_seconds)}`;
    }

    btn.setAttribute('aria-label', `Adjust ${q.label}, ${valText}, ${timerText}`);
    btn.addEventListener('click', (e) => openQuotaModal(acc, q, e.currentTarget));

    const left = document.createElement('div');
    left.className = 'qt-row-left';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'qt-row-name';
    nameSpan.textContent = q.label;

    const timerSpan = document.createElement('span');
    timerSpan.className = `qt-row-timer mono-num ${q.status === 'cooldown' ? 'is-danger' : ''}`;
    if (q.resets_at && q.remaining_seconds > 0) {
      timerSpan.setAttribute('data-resets-at', q.resets_at);
      const targetMs = Date.parse(q.resets_at);
      timerSpan.textContent = `Resets in ${formatDuration(q.remaining_seconds)} (${formatLocalClock(targetMs)})`;
    } else {
      timerSpan.textContent = timerText;
    }

    left.append(nameSpan, timerSpan);

    const right = document.createElement('div');
    right.className = 'qt-row-right';

    const valSpan = document.createElement('span');
    valSpan.className = 'qt-row-val mono-num';
    valSpan.textContent = q.limit_value > 0 && q.unit === 'percent' ? `${remPct}% left` : valText;

    right.append(valSpan, buildQuotaRingSvg(remPct, q.status));

    btn.append(left, right);
    return btn;
  }

  function describeCompactIdleWindow(q) {
    switch (q.window_type) {
      case 'rolling_hours':
        return `Ready · ${formatNumber(q.window_hours || 5)}h window`;
      case 'daily_fixed':
        return `Ready · daily ${q.daily_reset_time || '00:00'}`;
      case 'weekly_cycle':
        if (q.weekly_reset_day >= 1 && q.weekly_reset_day <= 7) {
          return `Ready · ${weekdayName(q.weekly_reset_day)} ${q.daily_reset_time || '00:00'}`;
        }
        return 'Ready · weekly 7d';
      case 'monthly_cycle':
        return `Ready · monthly day ${q.monthly_reset_day || 1}`;
      default:
        return 'Manual balance';
    }
  }

  function groupMatchesActiveFilters(grp) {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();
    return grp.quotas.some((rule) => {
      if (f.surface && !(rule.surfaces || []).includes(f.surface)) return false;
      if (f.scope && rule.scope_type !== f.scope) return false;
      if (f.status && rule.status !== f.status) return false;
      if (q) {
        const hay = [grp.name, rule.label, ...(rule.models || [])].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function buildQuotaRingSvg(remPct, status, size = 20) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('quota-ring');
    const tone = getQuotaTone(remPct, status);
    svg.classList.add(`is-${tone}`);

    const radius = 9;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, remPct));
    const offset = circumference * (1 - clamped / 100);

    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', '12');
    track.setAttribute('cy', '12');
    track.setAttribute('r', String(radius));
    track.setAttribute('class', 'ring-track');

    const fill = document.createElementNS(svgNS, 'circle');
    fill.setAttribute('cx', '12');
    fill.setAttribute('cy', '12');
    fill.setAttribute('r', String(radius));
    fill.setAttribute('class', 'ring-fill');
    fill.setAttribute('stroke-dasharray', circumference.toFixed(2));
    fill.setAttribute('stroke-dashoffset', offset.toFixed(2));

    svg.append(track, fill);
    return svg;
  }

  async function executeQuotaAction(quotaId, payload) {
    try {
      await apiFetch(`/api/quotas/${quotaId}/action`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await refreshData();
      announce('Quota status updated.');
    } catch (err) {
      els.errorState.hidden = false;
      els.errorMessage.textContent = err.message;
    }
  }

  function renderMatrix() {
    const qFilter = state.matrixSearch.trim().toLowerCase();
    const surfFilter = state.matrixSurface;
    const statusFilter = state.matrixStatus;
    const modelMap = new Map();

    const addModelSource = (rawModelName, source) => {
      const cleanName = (rawModelName || '').trim();
      if (!cleanName) return;
      const modelKey = cleanName.toLowerCase();
      let entry = modelMap.get(modelKey);
      if (!entry) {
        entry = {
          displayName: cleanName,
          sources: [],
          sourceKeys: new Set(),
          appSet: new Set()
        };
        modelMap.set(modelKey, entry);
      }

      const sourceKey = `${source.acc.id}:${(source.groupName || '').toLowerCase()}:${source.ungrouped ? 'u' : 'g'}`;
      if (!entry.sourceKeys.has(sourceKey)) {
        entry.sourceKeys.add(sourceKey);
        entry.sources.push(source);
      }
      (source.acc.apps || []).forEach((app) => {
        const cleanApp = (app || '').trim();
        if (cleanApp) entry.appSet.add(cleanApp);
      });
    };

    const getGroupRemainingPct = (grp) => {
      const capped = (grp.quotas || []).filter((q) => q.limit_value > 0);
      if (capped.length === 0) return grp.status === 'cooldown' ? 0 : 100;
      return Math.min(...capped.map((q) => Math.max(0, Math.min(100, 100 - (q.usage_percent || 0)))));
    };

    state.accounts.forEach((acc) => {
      const groups = groupQuotas(acc);
      const governed = new Set();

      groups.forEach((grp) => {
        if (grp.models.length === 0) return;
        const remPct = getGroupRemainingPct(grp);
        grp.models.forEach((modelName) => {
          const clean = (modelName || '').trim();
          if (!clean) return;
          governed.add(clean.toLowerCase());
          addModelSource(clean, {
            acc,
            groupName: grp.name,
            status: grp.status,
            remPct,
            surfaces: grp.surfaces || [],
            scopeText: grp.scopeLabel,
            activeTimer: grp.shortestCooldown,
            fallbackRule: grp.quotas[0] || null,
            ungrouped: false
          });
        });
      });

      const allSurfaces = Array.from(new Set((acc.quotas || []).flatMap((q) => q.surfaces || [])));
      (acc.models || []).forEach((modelName) => {
        const clean = (modelName || '').trim();
        if (!clean || governed.has(clean.toLowerCase())) return;
        const ovStatus = getAccountOverallStatus(acc);
        addModelSource(clean, {
          acc,
          groupName: '',
          status: ovStatus,
          remPct: ovStatus === 'cooldown' ? 0 : 100,
          surfaces: allSurfaces,
          scopeText: 'No dedicated quota group',
          activeTimer: null,
          fallbackRule: null,
          ungrouped: true
        });
      });
    });

    const filteredModels = [];
    modelMap.forEach((entry) => {
      const modelMatches = !qFilter || entry.displayName.toLowerCase().includes(qFilter);
      const matchingSources = entry.sources.filter((src) => {
        if (!modelMatches) {
          const haystack = [
            src.acc.provider,
            src.acc.alias,
            src.groupName,
            src.scopeText,
            ...(src.acc.apps || [])
          ].join(' ').toLowerCase();
          if (!haystack.includes(qFilter)) return false;
        }
        if (surfFilter && !(src.surfaces || []).includes(surfFilter)) return false;
        if (statusFilter === 'ready' && src.status === 'cooldown') return false;
        return true;
      });

      if (matchingSources.length > 0) {
        matchingSources.sort((a, b) => (
          a.acc.provider.localeCompare(b.acc.provider) ||
          a.acc.alias.localeCompare(b.acc.alias) ||
          a.groupName.localeCompare(b.groupName)
        ));

        const byAcc = [];
        const accMap = new Map();
        const surfaceSet = new Set();
        matchingSources.forEach((src) => {
          (src.surfaces || []).forEach((s) => surfaceSet.add(s));
          let grp = accMap.get(src.acc.id);
          if (!grp) {
            grp = { acc: src.acc, items: [] };
            accMap.set(src.acc.id, grp);
            byAcc.push(grp);
          }
          grp.items.push(src);
        });

        filteredModels.push({
          displayName: entry.displayName,
          accountGroups: byAcc,
          surfaces: Array.from(surfaceSet),
          apps: Array.from(entry.appSet)
        });
      }
    });

    filteredModels.sort((a, b) => a.displayName.localeCompare(b.displayName));

    if (filteredModels.length === 0) {
      els.matrixEmpty.hidden = false;
      els.matrixGrid.hidden = true;
      els.matrixGrid.innerHTML = '';
      return;
    }

    els.matrixEmpty.hidden = true;
    els.matrixGrid.hidden = false;
    els.matrixGrid.innerHTML = '';

    filteredModels.forEach(({ displayName, accountGroups, surfaces, apps }) => {
      const card = document.createElement('article');
      card.className = 'model-dir-card';

      const head = document.createElement('div');
      head.className = 'md-head';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'md-title-wrap';
      const title = document.createElement('h3');
      title.className = 'md-title';
      title.textContent = displayName;

      const envLine = document.createElement('span');
      envLine.className = 'md-envs';
      envLine.textContent = surfaces.length > 0 ? surfaces.join(' · ') : 'General';
      titleWrap.append(title, envLine);

      const totalAcc = accountGroups.length;
      const readyAcc = accountGroups.filter((ag) => ag.items.some((s) => s.status !== 'cooldown')).length;
      const readyTag = document.createElement('span');
      readyTag.className = `tag ${readyAcc === 0 ? 'tag-danger' : readyAcc < totalAcc ? 'tag-warn' : 'tag-ok'}`;
      readyTag.textContent = totalAcc === 1
        ? (readyAcc === 1 ? '1 ready' : 'Cooldown')
        : `${readyAcc}/${totalAcc} ready`;

      head.append(titleWrap, readyTag);
      card.appendChild(head);

      const accList = document.createElement('div');
      accList.className = 'md-accounts';

      accountGroups.forEach(({ acc, items }) => {
        const rowBtn = document.createElement('button');
        rowBtn.type = 'button';
        rowBtn.className = 'md-acc-row';
        rowBtn.addEventListener('click', () => {
          state.filters = { search: acc.alias, surface: surfFilter || '', scope: '', status: '' };
          els.filterSearch.value = state.filters.search;
          els.filterSurface.value = state.filters.surface;
          els.filterScope.value = '';
          els.filterStatus.value = '';
          switchTab('tab-operations');
          renderOperations();
          els.filterSearch.focus();
        });

        const left = document.createElement('div');
        left.className = 'md-acc-left';

        const aliasEl = document.createElement('span');
        aliasEl.className = 'md-acc-alias';
        aliasEl.textContent = acc.alias;

        const hasUngroupedOnly = items.every((i) => i.ungrouped);
        const subEl = document.createElement('span');
        subEl.className = 'md-acc-sub';
        if (hasUngroupedOnly) {
          subEl.textContent = `${acc.provider} · No group assigned`;
        } else {
          const shortScopes = items.map((i) => {
            const env = (i.surfaces && i.surfaces.length > 0) ? i.surfaces.join('+') : 'General';
            return items.length > 1 ? `${env}: ${i.remPct}%` : `${acc.provider} · ${env}`;
          });
          subEl.textContent = shortScopes.join(' · ');
        }

        left.append(aliasEl, subEl);

        const right = document.createElement('div');
        right.className = 'md-acc-right';

        const bestRem = Math.max(...items.map((i) => i.remPct));
        const worstStatus = items.every((i) => i.status === 'cooldown')
          ? 'cooldown'
          : items.some((i) => i.status === 'warning')
            ? 'warning'
            : 'available';

        const matrixTone = hasUngroupedOnly ? '' : getQuotaTone(bestRem, worstStatus);
        const pctEl = document.createElement('span');
        pctEl.className = `md-acc-pct mono-num ${matrixTone ? `is-${matrixTone}` : ''}`;
        if (hasUngroupedOnly) {
          pctEl.textContent = 'No group';
        } else if (worstStatus === 'cooldown') {
          const soonest = items
            .filter((i) => i.activeTimer)
            .sort((a, b) => a.activeTimer.remaining_seconds - b.activeTimer.remaining_seconds)[0];
          pctEl.textContent = soonest ? formatDuration(soonest.activeTimer.remaining_seconds) : '0%';
        } else {
          pctEl.textContent = `${bestRem}% left`;
        }

        right.append(pctEl);
        if (!hasUngroupedOnly) {
          right.append(buildQuotaRingSvg(bestRem, worstStatus, 16));
        }

        rowBtn.append(left, right);
        accList.appendChild(rowBtn);
      });

      card.appendChild(accList);

      // Collapsible details for groups, scopes & apps
      const details = document.createElement('details');
      details.className = 'md-details';
      const summary = document.createElement('summary');
      summary.className = 'md-details-summary';
      summary.textContent = apps.length > 0
        ? `Scopes & apps (${apps.length})`
        : 'Group & scope details';
      details.appendChild(summary);

      const detailsBody = document.createElement('div');
      detailsBody.className = 'md-details-body';

      accountGroups.forEach(({ acc, items }) => {
        items.forEach(({ groupName, scopeText, activeTimer, fallbackRule, ungrouped }) => {
          const line = document.createElement('div');
          line.className = 'md-detail-line';
          const timerTxt = ungrouped
            ? 'No direct rule'
            : activeTimer
              ? `Resets in ${formatDuration(activeTimer.remaining_seconds)}`
              : fallbackRule
                ? describeCompactIdleWindow(fallbackRule)
                : '';
          const groupTxt = groupName ? `${acc.alias} · ${groupName}` : acc.alias;
          line.textContent = [groupTxt, scopeText, timerTxt].filter(Boolean).join(' | ');
          detailsBody.appendChild(line);
        });
      });

      if (apps.length > 0) {
        const appsLine = document.createElement('div');
        appsLine.className = 'md-detail-apps';
        appsLine.textContent = `Apps: ${apps.join(', ')}`;
        detailsBody.appendChild(appsLine);
      }

      details.appendChild(detailsBody);
      card.appendChild(details);
      els.matrixGrid.appendChild(card);
    });
  }

  function renderActivity() {
    const act = state.activity;
    if (!act) return;

    const rangeLabel = act.range_days === 365 ? '12m' : `${act.range_days || 30}d`;
    els.activityEmptyHint.hidden = act.total_events > 0;

    // 4 KPI blocks
    els.activityKpiGrid.innerHTML = '';
    const topModel = (act.top_models && act.top_models.length > 0) ? act.top_models[0] : null;
    const kpis = [
      {
        label: `Active days (${rangeLabel})`,
        value: `${act.active_days_30d}d`,
        sub: `Streak ${act.current_streak}d · Best ${act.longest_streak}d`
      },
      {
        label: `Usage logs (${rangeLabel})`,
        value: String(act.events_30d || 0),
        sub: `${act.cooldowns_hit_30d || 0} ${(act.cooldowns_hit_30d || 0) === 1 ? 'cooldown' : 'cooldowns'} hit`
      },
      {
        label: `Top model (${rangeLabel})`,
        value: topModel ? topModel.model : 'None yet',
        sub: topModel ? `${formatNumber(topModel.share_percent || 0)}% share (${topModel.events} ${topModel.events === 1 ? 'log' : 'logs'})` : 'Log usage to rank'
      },
      {
        label: 'Most active account',
        value: act.top_account || 'None yet',
        sub: `Weekly headroom: ${formatNumber(act.weekly_headroom_pct || 0)}%`
      }
    ];

    kpis.forEach((item) => {
      const wrap = document.createElement('div');
      const lbl = document.createElement('span');
      lbl.className = 'metric-label';
      lbl.textContent = item.label;
      const val = document.createElement('span');
      val.className = 'metric-value mono-num';
      val.textContent = item.value;
      const sub = document.createElement('span');
      sub.className = 'activity-sub';
      sub.textContent = item.sub;
      wrap.append(lbl, val, sub);
      els.activityKpiGrid.appendChild(wrap);
    });

    // 52-week Heatmap
    const days = Array.isArray(act.heatmap) ? act.heatmap : [];
    const totalYearEvents = days.reduce((s, d) => s + (d.events || 0), 0);
    const activeYr = act.active_days_365 || 0;
    els.heatmapSummary.textContent = `${totalYearEvents} ${totalYearEvents === 1 ? 'log' : 'logs'} across ${activeYr} ${activeYr === 1 ? 'active day' : 'active days'} in the last 12 months`;

    els.heatmapMonths.innerHTML = '';
    els.heatmapGrid.innerHTML = '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const totalCols = Math.ceil(days.length / 7);
    let lastMonth = -1;
    for (let c = 0; c < totalCols; c++) {
      const cellDay = days[c * 7];
      const slot = document.createElement('span');
      slot.className = 'heatmap-month-label';
      if (cellDay) {
        const parts = cellDay.date.split('-').map(Number);
        const mIdx = (parts[1] || 1) - 1;
        if (mIdx !== lastMonth && (c === 0 || (parts[2] || 0) <= 14)) {
          slot.textContent = monthNames[mIdx] || '';
          lastMonth = mIdx;
        }
      }
      els.heatmapMonths.appendChild(slot);
    }

    const showDayDetail = (dayObj, btnEl) => {
      state.selectedHeatmapDate = dayObj.date;
      els.heatmapGrid.querySelectorAll('.hm-cell.is-selected').forEach((n) => n.classList.remove('is-selected'));
      if (btnEl) btnEl.classList.add('is-selected');
      if (!dayObj.events) {
        els.heatmapDayDetail.textContent = `${dayObj.date}: No AI quota activity logged.`;
        return;
      }
      const parts = [
        `${dayObj.date}`,
        `${dayObj.events} ${dayObj.events === 1 ? 'log' : 'logs'}`
      ];
      if (dayObj.cooldowns > 0) parts.push(`${dayObj.cooldowns} ${dayObj.cooldowns === 1 ? 'cooldown' : 'cooldowns'}`);
      if (dayObj.models && dayObj.models.length > 0) parts.push(`Models: ${dayObj.models.join(', ')}`);
      else if (dayObj.accounts && dayObj.accounts.length > 0) parts.push(`Accounts: ${dayObj.accounts.join(', ')}`);
      els.heatmapDayDetail.textContent = parts.join(' · ');
    };

    let defaultDay = days.length > 0 ? days[days.length - 1] : null;
    days.forEach((d) => {
      if (d.date === state.selectedHeatmapDate) defaultDay = d;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `hm-cell hm-lvl-${d.level || 0}`;
      const label = d.events > 0
        ? `${d.date}: ${d.events} ${d.events === 1 ? 'log' : 'logs'}`
        : `${d.date}: no logs`;
      cell.setAttribute('aria-label', label);
      cell.title = label;
      cell.addEventListener('mouseenter', () => showDayDetail(d, cell));
      cell.addEventListener('focus', () => showDayDetail(d, cell));
      cell.addEventListener('click', () => showDayDetail(d, cell));
      els.heatmapGrid.appendChild(cell);
      if (defaultDay && d.date === defaultDay.date) {
        showDayDetail(d, cell);
      }
    });

    // Most Used Models
    els.topModelsWindow.textContent = `Last ${rangeLabel}`;
    els.topModelsList.innerHTML = '';
    const topModels = Array.isArray(act.top_models) ? act.top_models.slice(0, 8) : [];
    if (topModels.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'activity-sub';
      empty.textContent = 'No model usage recorded in this period yet.';
      els.topModelsList.appendChild(empty);
    } else {
      const maxVal = Math.max(...topModels.map((m) => m.share_percent || m.events || 1), 1);
      topModels.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'insight-bar-row';

        const head = document.createElement('div');
        head.className = 'insight-bar-head';
        const name = document.createElement('span');
        name.className = 'insight-bar-name';
        name.textContent = m.model;
        const meta = document.createElement('span');
        meta.className = 'insight-bar-meta';
        meta.textContent = `${m.events} ${m.events === 1 ? 'log' : 'logs'} · ${formatNumber(m.share_percent || 0)}% share`;
        head.append(name, meta);

        const track = document.createElement('div');
        track.className = 'insight-bar-track';
        const fill = document.createElement('div');
        fill.className = 'insight-bar-fill';
        const pctWidth = Math.max(4, Math.min(100, Math.round(((m.share_percent || m.events) / maxVal) * 100)));
        fill.style.width = `${pctWidth}%`;
        track.appendChild(fill);

        row.append(head, track);
        els.topModelsList.appendChild(row);
      });
    }

    // Surfaces & Per-account activity
    els.surfacesWindow.textContent = `Last ${rangeLabel}`;
    els.surfacePillsRow.innerHTML = '';
    const surfs = Array.isArray(act.surface_breakdown) ? act.surface_breakdown : [];
    if (surfs.length === 0) {
      const emptySurf = document.createElement('p');
      emptySurf.className = 'activity-sub';
      emptySurf.textContent = 'Surface breakdown appears as you log usage across Web, CLI, or IDE.';
      els.surfacePillsRow.appendChild(emptySurf);
    } else {
      surfs.forEach((s) => {
        const pill = document.createElement('span');
        pill.className = 'surface-stat-pill';
        const sName = document.createElement('span');
        sName.className = 'surface-stat-name';
        sName.textContent = s.surface;
        const sVal = document.createElement('span');
        sVal.className = 'surface-stat-val';
        sVal.textContent = `${s.events} · ${formatNumber(s.share_percent || 0)}%`;
        pill.append(sName, sVal);
        els.surfacePillsRow.appendChild(pill);
      });
    }

    els.activityAccountsTbody.innerHTML = '';
    const accRows = Array.isArray(act.account_usage_30d) ? act.account_usage_30d : [];
    if (accRows.length === 0) {
      els.activityAccountsWrap.hidden = true;
    } else {
      els.activityAccountsWrap.hidden = false;
      accRows.forEach((r) => {
        const tr = document.createElement('tr');

        const tdAcc = document.createElement('td');
        tdAcc.setAttribute('data-label', 'Account');
        tdAcc.textContent = r.alias;

        const tdLogs = document.createElement('td');
        tdLogs.setAttribute('data-label', 'Logs');
        tdLogs.className = 'mono-num';
        tdLogs.textContent = String(r.events || 0);

        const tdPct = document.createElement('td');
        tdPct.setAttribute('data-label', 'Share');
        tdPct.className = 'mono-num';
        tdPct.textContent = `${formatNumber(r.share_percent || 0)}%`;

        const tdCd = document.createElement('td');
        tdCd.setAttribute('data-label', 'Cooldowns');
        tdCd.className = 'mono-num';
        tdCd.textContent = String(r.cooldowns || 0);

        const tdCost = document.createElement('td');
        tdCost.setAttribute('data-label', 'Cost');
        tdCost.className = 'mono-num';
        tdCost.textContent = formatAccountCost(r);

        tr.append(tdAcc, tdLogs, tdPct, tdCd, tdCost);
        els.activityAccountsTbody.appendChild(tr);
      });
    }
  }

  function renderCosts() {
    const costSummaries = (state.stats && state.stats.cost_by_currency) ? state.stats.cost_by_currency : [];
    if (state.accounts.length === 0 || costSummaries.length === 0) {
      els.costsEmpty.hidden = false;
      els.currencySummaryGrid.innerHTML = '';
      els.renewalsWrap.hidden = true;
      els.renewalsTbody.innerHTML = '';
      return;
    }

    els.costsEmpty.hidden = true;
    els.currencySummaryGrid.innerHTML = '';

    costSummaries.forEach((cs) => {
      const card = document.createElement('article');
      card.className = 'currency-block';

      const title = document.createElement('h3');
      title.className = 'currency-code';
      const accNoun = cs.account_count === 1 ? 'account' : 'accounts';
      title.textContent = `${cs.currency} summary (${cs.account_count} ${accNoun})`;

      const annualDirectTotal = state.accounts
        .filter((a) => (a.currency || 'USD').toUpperCase() === cs.currency && a.billing_cycle === 'annual')
        .reduce((sum, a) => sum + (Number(a.cost) || 0), 0);

      const metrics = document.createElement('div');
      metrics.className = 'currency-metrics';

      metrics.append(
        buildMetricBlock('Monthly equivalent spend', `${formatMoney(cs.monthly_equivalent_total)} ${cs.currency}`),
        buildMetricBlock('Direct monthly', `${formatMoney(cs.monthly_direct)} ${cs.currency}`),
        buildMetricBlock('Direct annual', `${formatMoney(annualDirectTotal)} ${cs.currency}`),
        buildMetricBlock('Annual projection', `${formatMoney(cs.annual_projected_total)} ${cs.currency}`)
      );

      if ((cs.prepaid_balance_total || 0) > 0) {
        metrics.append(
          buildMetricBlock('Prepaid balance', `${formatMoney(cs.prepaid_balance_total)} ${cs.currency}`)
        );
      }

      card.append(title, metrics);
      els.currencySummaryGrid.appendChild(card);
    });

    const sortedAccounts = [...state.accounts].sort((a, b) => {
      if (!a.renewal_date && !b.renewal_date) return a.provider.localeCompare(b.provider);
      if (!a.renewal_date) return 1;
      if (!b.renewal_date) return -1;
      return a.renewal_date.localeCompare(b.renewal_date);
    });

    els.renewalsWrap.hidden = false;
    els.renewalsTbody.innerHTML = '';

    sortedAccounts.forEach((acc) => {
      const tr = document.createElement('tr');

      const tdAcc = document.createElement('td');
      tdAcc.setAttribute('data-label', 'Account');
      tdAcc.textContent = `${acc.provider} (${acc.alias})`;

      const tdPlan = document.createElement('td');
      tdPlan.setAttribute('data-label', 'Plan & cycle');
      tdPlan.textContent = `${acc.plan_name || 'No plan'} | ${formatBillingCycle(acc.billing_cycle)}`;

      const tdCost = document.createElement('td');
      tdCost.setAttribute('data-label', 'Amount');
      tdCost.className = 'mono-num';
      tdCost.textContent = formatAccountCost(acc);

      const tdDate = document.createElement('td');
      tdDate.setAttribute('data-label', 'Renewal date');
      tdDate.className = 'mono-num';
      tdDate.textContent = acc.renewal_date || 'Not set';

      const tdCountdown = document.createElement('td');
      tdCountdown.setAttribute('data-label', 'Due');
      const urgency = getRenewalUrgency(acc.renewal_date);
      if (urgency.cls) {
        const badge = document.createElement('span');
        badge.className = `tag ${urgency.cls}`;
        badge.textContent = urgency.text;
        tdCountdown.appendChild(badge);
      } else {
        tdCountdown.textContent = urgency.text;
      }

      const tdNotes = document.createElement('td');
      tdNotes.setAttribute('data-label', 'Payment notes');
      tdNotes.textContent = acc.payment_notes || 'No notes';

      const tdAction = document.createElement('td');
      tdAction.setAttribute('data-label', 'Action');
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-ghost btn-xs';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', (e) => openAccountModal(acc, e.currentTarget));
      tdAction.appendChild(editBtn);

      tr.append(tdAcc, tdPlan, tdCost, tdDate, tdCountdown, tdNotes, tdAction);
      els.renewalsTbody.appendChild(tr);
    });
  }

  function buildMetricBlock(label, value) {
    const wrap = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.textContent = label;
    const val = document.createElement('span');
    val.className = 'metric-value mono-num';
    val.textContent = value;
    wrap.append(lbl, val);
    return wrap;
  }

  // Account modal logic
  function openAccountModal(account, triggerEl, opts = {}) {
    state.lastTriggerEl = triggerEl || document.activeElement;
    els.accountFormError.hidden = true;
    els.accountFormError.textContent = '';
    els.presetSelect.value = '';
    clearInvalidMarkers(els.accountForm);

    if (account && opts.duplicate) {
      els.accountModalTitle.textContent = `Duplicate account: ${account.alias}`;
      const clonedQuotas = (account.quotas || []).map((q) => ({
        ...q,
        id: 0,
        used_value: 0,
        window_started_at: '',
        resets_at: ''
      }));
      fillAccountForm({
        ...account,
        id: 0,
        alias: `${account.alias} (copy)`,
        identifier: '',
        quotas: clonedQuotas
      });
      els.accountModal.showModal();
      els.accAlias.focus();
      els.accAlias.select();
      return;
    }

    if (account) {
      els.accountModalTitle.textContent = `Edit account: ${account.alias}`;
      fillAccountForm(account);
    } else {
      els.accountModalTitle.textContent = 'Add AI account';
      fillAccountForm({
        id: 0,
        provider: '',
        alias: '',
        identifier: '',
        plan_name: '',
        billing_cycle: 'monthly',
        cost: 0,
        currency: 'USD',
        renewal_date: '',
        payment_notes: '',
        models: [],
        apps: [],
        notes: '',
        quotas: [defaultQuotaRule()]
      });
    }
    els.accountModal.showModal();
  }

  function openDuplicateAccountModal(account, triggerEl) {
    openAccountModal(account, triggerEl, { duplicate: true });
  }

  function fillAccountForm(acc) {
    els.accId.value = acc.id ? String(acc.id) : '';
    els.accProvider.value = acc.provider || '';
    els.accAlias.value = acc.alias || '';
    els.accIdentifier.value = acc.identifier || '';
    els.accPlan.value = acc.plan_name || '';
    els.accBillingCycle.value = acc.billing_cycle || 'monthly';
    els.accCost.value = String(acc.cost ?? 0);
    els.accCurrency.value = acc.currency || 'USD';
    els.accRenewal.value = acc.renewal_date || '';
    els.accPaymentNotes.value = acc.payment_notes || '';
    els.accModels.value = (acc.models || []).join(', ');
    els.accApps.value = (acc.apps || []).join(', ');
    els.accNotes.value = acc.notes || '';

    els.quotasEditorList.innerHTML = '';
    const groups = groupRulesForEditor(acc.quotas || []);
    const startExpanded = groups.length <= 1;
    groups.forEach((grp) => {
      els.quotasEditorList.appendChild(buildEditorGroupCard(grp, startExpanded));
    });
  }

  function applySelectedPreset() {
    const presetId = els.presetSelect.value;
    if (!presetId) return;
    const preset = state.presets.find((p) => p.id === presetId);
    if (!preset) return;
    const existingId = els.accId.value;
    const existingIdentifier = els.accIdentifier.value;
    fillAccountForm({
      ...preset.account_template,
      id: existingId ? Number(existingId) : 0,
      identifier: existingIdentifier
    });
    announce(`Template ${preset.display_name} applied to form.`);
  }

  function defaultQuotaRule(overrides = {}) {
    return {
      id: 0,
      group_name: '',
      label: 'Primary usage window',
      scope_type: 'shared',
      surfaces: ['Web'],
      models: [],
      unit: 'percent',
      limit_value: 100,
      used_value: 0,
      window_type: 'rolling_hours',
      window_hours: 5,
      daily_reset_time: '00:00',
      weekly_reset_day: 0,
      monthly_reset_day: 1,
      window_started_at: '',
      resets_at: '',
      ...overrides
    };
  }

  function defaultSingleQuotaGroup() {
    return {
      name: '',
      scope_type: 'shared',
      surfaces: ['Web'],
      models: [],
      rules: [defaultQuotaRule()]
    };
  }

  function defaultPairQuotaGroup() {
    return {
      name: '',
      scope_type: 'isolated',
      surfaces: ['CLI', 'IDE'],
      models: [],
      rules: [
        defaultQuotaRule({ label: '5h window', window_type: 'rolling_hours', window_hours: 5 }),
        defaultQuotaRule({ label: 'Weekly limit', window_type: 'weekly_cycle', weekly_reset_day: 0 })
      ]
    };
  }

  function groupRulesForEditor(rules) {
    const groups = [];
    const byKey = new Map();
    rules.forEach((q) => {
      const name = (q.group_name || '').trim();
      const key = (name || 'General').toLowerCase();
      let grp = byKey.get(key);
      if (!grp) {
        grp = {
          name,
          scope_type: q.scope_type || 'shared',
          surfaceSet: new Set(),
          modelSet: new Set(),
          rules: []
        };
        byKey.set(key, grp);
        groups.push(grp);
      }
      (q.surfaces || []).forEach((s) => grp.surfaceSet.add(s));
      (q.models || []).forEach((m) => grp.modelSet.add(m));
      grp.rules.push(q);
    });

    return groups.map((g) => ({
      name: g.name,
      scope_type: g.scope_type,
      surfaces: Array.from(g.surfaceSet),
      models: Array.from(g.modelSet),
      rules: g.rules
    }));
  }

  function addEditorGroup(groupData, focusName = false) {
    const card = buildEditorGroupCard(groupData, true);
    els.quotasEditorList.appendChild(card);
    if (focusName) {
      const inp = card.querySelector('.qge-group');
      if (inp) inp.focus();
    }
    return card;
  }

  function syncAccountModelsFromGroups() {
    const seen = new Set();
    const collected = [];
    els.quotasEditorList.querySelectorAll('.qge-models').forEach((ta) => {
      splitCommaList(ta.value).forEach((m) => {
        const key = m.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          collected.push(m);
        }
      });
    });
    if (collected.length === 0) {
      announce('No models defined in quota groups yet.');
      return;
    }
    els.accModels.value = collected.join(', ');
    announce(`Synced ${collected.length} models from quota groups.`);
  }

  function readEditorGroupState(card, asCopy = false) {
    const rawName = card.querySelector('.qge-group').value.trim();
    const scope_type = card.querySelector('.qge-scope').value;
    const models = splitCommaList(card.querySelector('.qge-models').value);
    const surfaces = Array.from(card.querySelectorAll('.qge-surface:checked')).map((cb) => cb.value);
    const rules = Array.from(card.querySelectorAll('.qge-rule-row')).map((row) => {
      const used = asCopy ? 0 : (parseFloat(row.querySelector('.qer-used').value) || 0);
      return {
        id: asCopy ? 0 : (Number(row.dataset.quotaId) || 0),
        group_name: asCopy ? (rawName ? `${rawName} (copy)` : '') : rawName,
        label: row.querySelector('.qer-label').value.trim() || 'Primary quota',
        scope_type,
        surfaces,
        models,
        unit: row.querySelector('.qer-unit').value,
        limit_value: parseFloat(row.querySelector('.qer-limit').value) || 0,
        used_value: used,
        window_type: row.querySelector('.qer-wintype').value,
        window_hours: parseFloat(row.querySelector('.qer-hours').value) || 5,
        daily_reset_time: row.querySelector('.qer-daily').value || '00:00',
        weekly_reset_day: parseInt(row.querySelector('.qer-weeklyday').value, 10) || 0,
        monthly_reset_day: parseInt(row.querySelector('.qer-monthly').value, 10) || 1,
        window_started_at: asCopy || used === 0 ? '' : (row.dataset.windowStartedAt || ''),
        resets_at: asCopy || used === 0 ? '' : (row.dataset.savedResetsAt || '')
      };
    });
    return {
      name: asCopy ? (rawName ? `${rawName} (copy)` : 'New group') : rawName,
      scope_type,
      surfaces,
      models,
      rules
    };
  }

  function buildEditorGroupCard(grp, expanded = false) {
    const card = document.createElement('div');
    card.className = 'qge-card';
    const uid = `qg-${Math.random().toString(36).slice(2, 9)}`;

    const head = document.createElement('div');
    head.className = 'qge-card-head';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'qge-toggle';
    toggleBtn.setAttribute('aria-expanded', String(expanded));

    const caret = document.createElement('span');
    caret.className = 'qge-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = expanded ? 'v' : '>';

    const summaryText = document.createElement('div');
    summaryText.className = 'qge-summary-text';
    const titleEl = document.createElement('strong');
    titleEl.className = 'qge-summary-title';
    const metaEl = document.createElement('span');
    metaEl.className = 'qge-summary-meta';
    summaryText.append(titleEl, metaEl);
    toggleBtn.append(caret, summaryText);

    const headActions = document.createElement('div');
    headActions.className = 'qge-head-actions';

    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'btn btn-ghost btn-xs';
    dupBtn.textContent = 'Duplicate group';
    dupBtn.addEventListener('click', () => {
      const copyState = readEditorGroupState(card, true);
      const copyCard = buildEditorGroupCard(copyState, true);
      card.after(copyCard);
      const inp = copyCard.querySelector('.qge-group');
      if (inp) {
        inp.focus();
        inp.select();
      }
    });

    const removeGroupBtn = document.createElement('button');
    removeGroupBtn.type = 'button';
    removeGroupBtn.className = 'btn btn-ghost btn-xs';
    removeGroupBtn.textContent = 'Remove';
    removeGroupBtn.addEventListener('click', () => card.remove());

    headActions.append(dupBtn, removeGroupBtn);
    head.append(toggleBtn, headActions);

    const body = document.createElement('div');
    body.className = 'qge-body';
    body.hidden = !expanded;

    toggleBtn.addEventListener('click', () => {
      const nextOpen = body.hidden;
      body.hidden = !nextOpen;
      toggleBtn.setAttribute('aria-expanded', String(nextOpen));
      caret.textContent = nextOpen ? 'v' : '>';
    });

    // Shared group settings
    const sharedGrid = document.createElement('div');
    sharedGrid.className = 'form-grid-2';

    const fGroup = makeInputField(`${uid}-group`, 'Group / pool name', 'text', grp.name || '', 'e.g. Web (Gemini App), Antigravity: External models');
    fGroup.input.classList.add('qge-group');

    const fScope = makeSelectField(`${uid}-scope`, 'Web vs App/CLI relationship', [
      { value: 'shared', label: 'Shared across selected surfaces' },
      { value: 'isolated', label: 'Exclusive / separate (independent limit)' }
    ], grp.scope_type || 'shared');
    fScope.select.classList.add('qge-scope');

    sharedGrid.append(fGroup.wrap, fScope.wrap);

    const fModelsWrap = document.createElement('div');
    fModelsWrap.className = 'form-field';
    const modelsLbl = document.createElement('label');
    modelsLbl.setAttribute('for', `${uid}-models`);
    modelsLbl.textContent = 'Models in this group (comma-separated)';
    const modelsTa = document.createElement('textarea');
    modelsTa.id = `${uid}-models`;
    modelsTa.rows = 2;
    modelsTa.className = 'qge-models';
    modelsTa.placeholder = 'e.g. Claude Sonnet 4.6, Claude Opus 4.6';
    modelsTa.value = (grp.models || []).join(', ');
    fModelsWrap.append(modelsLbl, modelsTa);

    const surfGroup = document.createElement('div');
    const surfLabel = document.createElement('span');
    surfLabel.className = 'cap-group-label';
    surfLabel.textContent = 'Surfaces covered by this group:';
    const surfGrid = document.createElement('div');
    surfGrid.className = 'surfaces-grid';
    const selectedSet = new Set(grp.surfaces || []);

    SURFACES.forEach((surfName) => {
      const lbl = document.createElement('label');
      lbl.className = 'check-pill';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = surfName;
      cb.className = 'qge-surface';
      cb.checked = selectedSet.has(surfName);
      const txt = document.createElement('span');
      txt.textContent = surfName;
      lbl.append(cb, txt);
      surfGrid.appendChild(lbl);
    });
    surfGroup.append(surfLabel, surfGrid);

    const rulesSection = document.createElement('div');
    rulesSection.className = 'qge-rules-section';

    const rulesHead = document.createElement('div');
    rulesHead.className = 'qge-rules-head';
    const rulesTitle = document.createElement('span');
    rulesTitle.className = 'cap-group-label';
    rulesTitle.textContent = 'Limit windows in this group:';
    const addWinBtn = document.createElement('button');
    addWinBtn.type = 'button';
    addWinBtn.className = 'btn btn-secondary btn-xs';
    addWinBtn.textContent = '+ Add window';
    rulesHead.append(rulesTitle, addWinBtn);

    const rulesList = document.createElement('div');
    rulesList.className = 'qge-rules-list';

    const updateSummary = () => {
      const gName = fGroup.input.value.trim() || 'General group';
      const scopeTxt = fScope.select.value === 'isolated' ? 'Exclusive' : 'Shared';
      const surfList = Array.from(surfGrid.querySelectorAll('.qge-surface:checked')).map((c) => c.value);
      const modelCount = splitCommaList(modelsTa.value).length;
      const winLabels = Array.from(rulesList.querySelectorAll('.qer-label'))
        .map((inp) => inp.value.trim())
        .filter(Boolean);
      titleEl.textContent = gName;
      const parts = [
        winLabels.length > 0 ? winLabels.join(' + ') : `${rulesList.children.length} window(s)`,
        surfList.length > 0 ? `${scopeTxt}: ${surfList.join(', ')}` : scopeTxt
      ];
      if (modelCount > 0) parts.push(`${modelCount} model(s)`);
      metaEl.textContent = parts.join(' · ');
    };

    const appendRuleRow = (q) => {
      const r = buildEditorRuleRow(q, updateSummary, () => {
        if (rulesList.children.length <= 1) {
          card.remove();
        } else {
          updateSummary();
        }
      });
      rulesList.appendChild(r);
    };

    addWinBtn.addEventListener('click', () => {
      const existingTypes = Array.from(rulesList.querySelectorAll('.qer-wintype')).map((s) => s.value);
      const hasRolling = existingTypes.includes('rolling_hours');
      const firstUnit = rulesList.querySelector('.qer-unit')?.value || 'percent';
      const firstLimit = parseFloat(rulesList.querySelector('.qer-limit')?.value) || 100;
      const nextRule = hasRolling
        ? defaultQuotaRule({ label: 'Weekly limit', window_type: 'weekly_cycle', unit: firstUnit, limit_value: firstLimit })
        : defaultQuotaRule({ label: '5h window', window_type: 'rolling_hours', window_hours: 5, unit: firstUnit, limit_value: firstLimit });
      appendRuleRow(nextRule);
      updateSummary();
    });

    (grp.rules && grp.rules.length > 0 ? grp.rules : [defaultQuotaRule()]).forEach(appendRuleRow);

    fGroup.input.addEventListener('input', updateSummary);
    fScope.select.addEventListener('change', updateSummary);
    modelsTa.addEventListener('input', updateSummary);
    surfGrid.addEventListener('change', updateSummary);
    updateSummary();

    rulesSection.append(rulesHead, rulesList);
    body.append(sharedGrid, fModelsWrap, surfGroup, rulesSection);
    card.append(head, body);
    return card;
  }

  function buildEditorRuleRow(q, onChange, onRemove) {
    const row = document.createElement('div');
    row.className = 'qge-rule-row';
    row.dataset.quotaId = String(q.id || 0);
    row.dataset.windowStartedAt = q.window_started_at || '';
    row.dataset.savedResetsAt = q.resets_at || '';

    const uid = `qr-${Math.random().toString(36).slice(2, 9)}`;

    const topBar = document.createElement('div');
    topBar.className = 'qge-rule-top';
    const fLabel = makeInputField(`${uid}-label`, 'Window name', 'text', q.label || '', 'e.g. 5h window, Weekly limit');
    fLabel.input.classList.add('qer-label');
    fLabel.input.addEventListener('input', onChange);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost btn-xs';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      row.remove();
      onRemove();
    });
    topBar.append(fLabel.wrap, removeBtn);

    const grid = document.createElement('div');
    grid.className = 'form-grid-2';

    const fWinType = makeSelectField(`${uid}-wintype`, 'Window type', [
      { value: 'rolling_hours', label: 'Rolling hours window (e.g. 5h, 3h)' },
      { value: 'daily_fixed', label: 'Daily reset at fixed time' },
      { value: 'weekly_cycle', label: 'Weekly (7 days or fixed weekday)' },
      { value: 'monthly_cycle', label: 'Monthly reset by day of month' },
      { value: 'manual_only', label: 'Manual only / prepaid balance' }
    ], q.window_type || 'rolling_hours');
    fWinType.select.classList.add('qer-wintype');

    const fUnit = makeSelectField(`${uid}-unit`, 'Unit', [
      { value: 'percent', label: 'Percentage (%)' },
      { value: 'messages', label: 'Messages' },
      { value: 'requests', label: 'Requests (Fast requests)' },
      { value: 'credits', label: 'Credits (AI / Flow)' },
      { value: 'credits_usd', label: 'Credits (USD)' },
      { value: 'tokens_k', label: 'Thousands of tokens (k)' }
    ], q.unit || 'messages');
    fUnit.select.classList.add('qer-unit');

    const fLimits = document.createElement('div');
    fLimits.className = 'form-grid-inline';
    const fLimit = makeInputField(`${uid}-limit`, 'Limit', 'number', String(q.limit_value ?? 0));
    fLimit.input.min = '0';
    fLimit.input.step = 'any';
    fLimit.input.classList.add('qer-limit');
    const fUsed = makeInputField(`${uid}-used`, 'Current usage', 'number', String(q.used_value ?? 0));
    fUsed.input.min = '0';
    fUsed.input.step = 'any';
    fUsed.input.classList.add('qer-used');
    fLimits.append(fLimit.wrap, fUsed.wrap);

    const fHours = makeInputField(`${uid}-hours`, 'Hours', 'number', String(q.window_hours || 5));
    fHours.input.min = '0.5';
    fHours.input.step = '0.5';
    fHours.input.classList.add('qer-hours');

    const fWeeklyDay = makeSelectField(`${uid}-weeklyday`, 'Weekly schedule', [
      { value: '0', label: 'Rolling 7 days (168h)' },
      { value: '1', label: 'Every Monday' },
      { value: '2', label: 'Every Tuesday' },
      { value: '3', label: 'Every Wednesday' },
      { value: '4', label: 'Every Thursday' },
      { value: '5', label: 'Every Friday' },
      { value: '6', label: 'Every Saturday' },
      { value: '7', label: 'Every Sunday' }
    ], String(q.weekly_reset_day || 0));
    fWeeklyDay.select.classList.add('qer-weeklyday');

    const fDaily = makeInputField(`${uid}-daily`, 'Reset time', 'time', q.daily_reset_time || '00:00');
    fDaily.input.classList.add('qer-daily');

    const fMonthly = makeInputField(`${uid}-monthly`, 'Day of month (1-31)', 'number', String(q.monthly_reset_day || 1));
    fMonthly.input.min = '1';
    fMonthly.input.max = '31';
    fMonthly.input.classList.add('qer-monthly');

    const syncWinFields = () => {
      const wt = fWinType.select.value;
      const weeklyFixed = wt === 'weekly_cycle' && Number(fWeeklyDay.select.value) > 0;
      fHours.wrap.hidden = wt !== 'rolling_hours';
      fWeeklyDay.wrap.hidden = wt !== 'weekly_cycle';
      fDaily.wrap.hidden = wt !== 'daily_fixed' && !weeklyFixed;
      fMonthly.wrap.hidden = wt !== 'monthly_cycle';
    };
    fWinType.select.addEventListener('change', syncWinFields);
    fWeeklyDay.select.addEventListener('change', syncWinFields);
    syncWinFields();

    grid.append(fWinType.wrap, fHours.wrap, fWeeklyDay.wrap, fDaily.wrap, fMonthly.wrap, fUnit.wrap, fLimits);
    row.append(topBar, grid);
    return row;
  }

  function makeInputField(id, labelText, type, value, placeholder = '') {
    const wrap = document.createElement('div');
    wrap.className = 'form-field';
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.value = value;
    if (placeholder) input.placeholder = placeholder;
    wrap.append(label, input);
    return { wrap, input };
  }

  function makeSelectField(id, labelText, options, value) {
    const wrap = document.createElement('div');
    wrap.className = 'form-field';
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    const select = document.createElement('select');
    select.id = id;
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    });
    wrap.append(label, select);
    return { wrap, select };
  }

  async function handleAccountFormSubmit(e) {
    e.preventDefault();
    clearInvalidMarkers(els.accountForm);
    els.accountFormError.hidden = true;

    const provider = els.accProvider.value.trim();
    const alias = els.accAlias.value.trim();
    const missing = [];
    if (!provider) {
      els.accProvider.setAttribute('aria-invalid', 'true');
      missing.push(els.accProvider);
    }
    if (!alias) {
      els.accAlias.setAttribute('aria-invalid', 'true');
      missing.push(els.accAlias);
    }
    if (missing.length > 0) {
      els.accountFormError.textContent = 'Fill in the required fields: Provider and Account alias.';
      els.accountFormError.hidden = false;
      missing[0].focus();
      return;
    }

    const quotas = [];
    els.quotasEditorList.querySelectorAll('.qge-card').forEach((card) => {
      const grpState = readEditorGroupState(card, false);
      grpState.rules.forEach((r) => quotas.push(r));
    });

    const payload = {
      provider,
      alias,
      identifier: els.accIdentifier.value.trim(),
      plan_name: els.accPlan.value.trim(),
      billing_cycle: els.accBillingCycle.value,
      cost: parseFloat(els.accCost.value) || 0,
      currency: els.accCurrency.value.trim().toUpperCase() || 'USD',
      renewal_date: els.accRenewal.value,
      payment_notes: els.accPaymentNotes.value.trim(),
      models: splitCommaList(els.accModels.value),
      apps: splitCommaList(els.accApps.value),
      notes: els.accNotes.value.trim(),
      quotas
    };

    const existingId = els.accId.value;
    try {
      if (existingId) {
        await apiFetch(`/api/accounts/${existingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        announce(`Account ${alias} updated.`);
      } else {
        await apiFetch('/api/accounts', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        announce(`Account ${alias} saved.`);
      }
      closeDialog(els.accountModal);
      await refreshData();
    } catch (err) {
      els.accountFormError.textContent = err.message;
      els.accountFormError.hidden = false;
    }
  }

  // Unified quota quick-adjust modal logic
  function openQuotaModal(acc, q, triggerEl) {
    state.lastTriggerEl = triggerEl || document.activeElement;
    els.qmFormError.hidden = true;
    els.qmQuotaId.value = String(q.id);

    const grpName = (q.group_name || '').trim();
    els.qmContext.textContent = grpName
      ? `${acc.provider} (${acc.alias}) · ${grpName} · ${q.label}`
      : `${acc.provider} (${acc.alias}) · ${q.label}`;

    const hasCap = q.limit_value > 0;
    const unitLabel = formatUnit(q.unit);
    els.qmValMode.innerHTML = '';
    if (hasCap) {
      const oRem = document.createElement('option');
      oRem.value = 'remaining';
      oRem.textContent = 'Remaining';
      els.qmValMode.appendChild(oRem);
    }
    const oUsed = document.createElement('option');
    oUsed.value = 'used';
    oUsed.textContent = 'Used';
    els.qmValMode.appendChild(oUsed);

    if (hasCap) {
      els.qmValMode.value = 'remaining';
      els.qmVal.max = String(q.limit_value);
      els.qmVal.value = formatNumber(Math.max(0, q.limit_value - (q.used_value || 0)));
      els.qmValLabel.textContent = `Remaining (${unitLabel})`;
    } else {
      els.qmValMode.value = 'used';
      els.qmVal.removeAttribute('max');
      els.qmVal.value = String(q.used_value || 0);
      els.qmValLabel.textContent = `Used (${unitLabel})`;
    }

    const autoOpt = els.qmTimerMode.querySelector('option[value="auto"]');
    if (autoOpt) {
      autoOpt.textContent = q.resets_at
        ? 'Keep current timer'
        : `Automatic (${describeIdleWindow(q)})`;
    }
    els.qmTimerMode.value = 'auto';

    const remSec = Math.max(0, Math.floor(q.remaining_seconds || 0));
    els.qmDays.value = String(Math.floor(remSec / 86400));
    els.qmHours.value = String(Math.floor((remSec % 86400) / 3600));
    els.qmMins.value = String(Math.floor((remSec % 3600) / 60));
    els.qmUntilDate.value = '';
    els.qmUntilTime.value = '';

    const siblingRules = (acc.quotas || []).filter((other) => (
      other.id !== q.id &&
      ((other.group_name || '').trim() || 'General').toLowerCase() === (grpName || 'General').toLowerCase()
    ));
    state.activeQuotaTarget = { acc, q, siblingIds: siblingRules.map((s) => s.id) };
    els.qmApplyGroup.checked = false;
    if (siblingRules.length > 0) {
      els.qmGroupWrap.hidden = false;
      els.qmApplyGroupLabel.textContent = `Also apply this adjustment to ${siblingRules.length} other window(s) in "${grpName || 'General'}"`;
    } else {
      els.qmGroupWrap.hidden = true;
    }

    els.qmResetBtn.hidden = !(q.used_value > 0 || Boolean(q.resets_at));
    els.qmExhaustBtn.hidden = q.status === 'cooldown';

    const groupModels = Array.isArray(q.models) ? q.models.filter(Boolean) : [];
    els.qmModelUsed.innerHTML = '';
    if (groupModels.length > 1) {
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = `All models in group (${groupModels.length})`;
      els.qmModelUsed.appendChild(allOpt);
      groupModels.forEach((mName) => {
        const opt = document.createElement('option');
        opt.value = mName;
        opt.textContent = mName;
        els.qmModelUsed.appendChild(opt);
      });
      els.qmModelUsed.value = '';
      els.qmModelWrap.hidden = false;
    } else if (groupModels.length === 1) {
      const onlyOpt = document.createElement('option');
      onlyOpt.value = groupModels[0];
      onlyOpt.textContent = groupModels[0];
      els.qmModelUsed.appendChild(onlyOpt);
      els.qmModelUsed.value = groupModels[0];
      els.qmModelWrap.hidden = true;
    } else {
      els.qmModelWrap.hidden = true;
    }

    updateQuotaTimerVisibility();
    els.quotaModal.showModal();
    els.qmVal.focus();
    els.qmVal.select();
  }

  function handleQuotaValModeChange() {
    if (!state.activeQuotaTarget) return;
    const { q } = state.activeQuotaTarget;
    if (q.limit_value <= 0) return;
    const cur = parseFloat(els.qmVal.value);
    if (!Number.isNaN(cur)) {
      els.qmVal.value = formatNumber(Math.max(0, q.limit_value - cur));
    }
    const unitLabel = formatUnit(q.unit);
    els.qmValLabel.textContent = els.qmValMode.value === 'remaining'
      ? `Remaining (${unitLabel})`
      : `Used (${unitLabel})`;
  }

  function updateQuotaTimerVisibility() {
    const mode = els.qmTimerMode.value;
    els.qmDhmWrap.hidden = mode !== 'duration';
    els.qmTimeWrap.hidden = mode !== 'until_time';
  }

  function buildQuotaTimerFields() {
    const mode = els.qmTimerMode.value;
    if (mode === 'duration') {
      const dd = parseInt(els.qmDays.value, 10) || 0;
      const hh = parseInt(els.qmHours.value, 10) || 0;
      const mm = parseInt(els.qmMins.value, 10) || 0;
      const totalHours = (dd * 24) + hh + (mm / 60);
      if (totalHours <= 0) {
        return { error: 'Enter at least 1 minute or switch to Automatic.', focusEl: els.qmHours };
      }
      return { fields: { custom_hours: totalHours } };
    }
    if (mode === 'until_time') {
      if (!els.qmUntilTime.value) {
        return { error: 'Select the exact reset time.', focusEl: els.qmUntilTime };
      }
      const untilTime = els.qmUntilDate.value
        ? `${els.qmUntilDate.value}T${els.qmUntilTime.value}`
        : els.qmUntilTime.value;
      return { fields: { until_time: untilTime } };
    }
    return { fields: {} };
  }

  async function runQuotaModalActions(makePayload) {
    if (!state.activeQuotaTarget) return;
    const { q, siblingIds } = state.activeQuotaTarget;
    const targetIds = [q.id];
    if (els.qmApplyGroup.checked && siblingIds.length > 0) {
      targetIds.push(...siblingIds);
    }
    try {
      for (let i = 0; i < targetIds.length; i++) {
        const id = targetIds[i];
        const body = makePayload(id);
        if (i > 0) body.skip_activity = true;
        await apiFetch(`/api/quotas/${id}/action`, {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
      closeDialog(els.quotaModal);
      await refreshData();
      announce(targetIds.length > 1
        ? `${targetIds.length} quotas updated.`
        : 'Quota and timer updated.');
    } catch (err) {
      els.qmFormError.textContent = err.message;
      els.qmFormError.hidden = false;
    }
  }

  async function handleQuotaFormSubmit(e) {
    e.preventDefault();
    els.qmFormError.hidden = true;
    if (!state.activeQuotaTarget) return;
    const { q } = state.activeQuotaTarget;
    const enteredVal = parseFloat(els.qmVal.value);
    if (Number.isNaN(enteredVal) || enteredVal < 0) {
      els.qmFormError.textContent = 'Enter a valid number greater than or equal to 0.';
      els.qmFormError.hidden = false;
      els.qmVal.focus();
      return;
    }

    const timerRes = buildQuotaTimerFields();
    if (timerRes.error) {
      els.qmFormError.textContent = timerRes.error;
      els.qmFormError.hidden = false;
      if (timerRes.focusEl) timerRes.focusEl.focus();
      return;
    }

    const usedVal = (q.limit_value > 0 && els.qmValMode.value === 'remaining')
      ? Math.max(0, Math.round((q.limit_value - enteredVal) * 1000) / 1000)
      : enteredVal;
    const modelUsed = els.qmModelUsed ? els.qmModelUsed.value : '';

    await runQuotaModalActions(() => ({
      action: 'set_usage',
      value: usedVal,
      model_used: modelUsed,
      ...timerRes.fields
    }));
  }

  async function handleQuotaExhaustQuick() {
    els.qmFormError.hidden = true;
    const timerRes = buildQuotaTimerFields();
    if (timerRes.error) {
      els.qmFormError.textContent = timerRes.error;
      els.qmFormError.hidden = false;
      if (timerRes.focusEl) timerRes.focusEl.focus();
      return;
    }
    const modelUsed = els.qmModelUsed ? els.qmModelUsed.value : '';
    await runQuotaModalActions(() => ({
      action: 'exhaust_now',
      model_used: modelUsed,
      ...timerRes.fields
    }));
  }

  async function handleQuotaResetQuick() {
    els.qmFormError.hidden = true;
    await runQuotaModalActions(() => ({ action: 'reset_now' }));
  }

  // Delete modal logic
  function openDeleteModal(acc, triggerEl) {
    state.lastTriggerEl = triggerEl || document.activeElement;
    els.deleteAccountId.value = String(acc.id);
    els.deleteConfirmText.textContent = `This will permanently delete the "${acc.alias}" (${acc.provider}) account and its quota rules.`;
    els.deleteModal.showModal();
  }

  async function handleConfirmDelete() {
    const id = els.deleteAccountId.value;
    if (!id) return;
    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      closeDialog(els.deleteModal);
      await refreshData();
      announce('Account deleted.');
    } catch (err) {
      els.errorState.hidden = false;
      els.errorMessage.textContent = err.message;
      closeDialog(els.deleteModal);
    }
  }

  async function handleImportSubmit(e) {
    e.preventDefault();
    const file = els.importFile.files && els.importFile.files[0];
    if (!file) {
      els.importFeedback.textContent = 'Select a JSON file first.';
      return;
    }
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const mode = els.importMode.value;
      const result = await apiFetch(`/api/import?mode=${encodeURIComponent(mode)}`, {
        method: 'POST',
        body: JSON.stringify(parsed)
      });
      const importedName = file.name;
      const accNoun = result.imported === 1 ? 'account' : 'accounts';
      els.importFeedback.textContent = `Import of "${importedName}" complete: ${result.imported} ${accNoun} processed (${result.mode}).`;
      els.importFile.value = '';
      await refreshData();
    } catch (err) {
      els.importFeedback.textContent = `Import failed: ${err.message}`;
    }
  }

  function closeDialog(dialogEl) {
    if (dialogEl.open) dialogEl.close();
  }

  function restoreFocus() {
    if (state.lastTriggerEl && typeof state.lastTriggerEl.focus === 'function') {
      state.lastTriggerEl.focus();
      state.lastTriggerEl = null;
    }
  }

  function clearInvalidMarkers(formEl) {
    formEl.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function splitCommaList(str) {
    return str.split(',').map((s) => s.trim()).filter(Boolean);
  }

  function getAccountOverallStatus(acc) {
    const qs = acc.quotas || [];
    if (qs.length === 0) return 'none';
    if (qs.some((q) => q.status === 'available')) return 'available';
    if (qs.some((q) => q.status === 'warning')) return 'warning';
    return 'cooldown';
  }

  function statusTagClass(status) {
    if (status === 'cooldown') return 'tag-danger';
    if (status === 'warning') return 'tag-warn';
    if (status === 'available') return 'tag-ok';
    return '';
  }

  function statusLabelText(status) {
    if (status === 'cooldown') return '[COOLDOWN]';
    if (status === 'warning') return '[NEAR LIMIT]';
    return '[READY]';
  }

  function describeIdleWindow(q) {
    switch (q.window_type) {
      case 'rolling_hours':
        return `${formatNumber(q.window_hours || 5)}h window ready to start`;
      case 'daily_fixed':
        return `Daily reset (${q.daily_reset_time || '00:00'})`;
      case 'weekly_cycle':
        if (q.weekly_reset_day >= 1 && q.weekly_reset_day <= 7) {
          return `Weekly reset: every ${weekdayName(q.weekly_reset_day)} (${q.daily_reset_time || '00:00'})`;
        }
        return '7-day weekly window ready';
      case 'monthly_cycle':
        return `Monthly reset on day ${q.monthly_reset_day || 1}`;
      default:
        return 'Manual tracking (no timer)';
    }
  }

  function weekdayName(day) {
    const names = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return names[day] || '';
  }

  function formatUnit(unit) {
    const map = {
      messages: 'messages',
      requests: 'requests',
      credits: 'credits',
      percent: '%',
      credits_usd: 'USD',
      tokens_k: 'k tokens'
    };
    return map[unit] || unit;
  }

  function formatBillingCycle(cycle) {
    const map = {
      monthly: 'Monthly',
      annual: 'Annual',
      prepaid: 'Prepaid',
      free: 'Free'
    };
    return map[cycle] || cycle;
  }

  function formatAccountCost(acc) {
    if (acc.billing_cycle === 'free' || acc.cost === 0) {
      return 'Free';
    }
    const suffix = acc.billing_cycle === 'annual' ? '/ yr' : acc.billing_cycle === 'prepaid' ? 'prepaid' : '/ mo';
    return `${formatMoney(acc.cost)} ${acc.currency || 'USD'} ${suffix}`;
  }

  function getRenewalUrgency(dateStr) {
    const text = formatRenewalRemaining(dateStr);
    if (!dateStr) return { text, cls: '' };
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3) return { text, cls: '' };
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const targetUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const diffDays = Math.round((targetUtc - todayUtc) / 86400000);
    if (diffDays <= 0) return { text, cls: 'tag-danger' };
    if (diffDays <= 7) return { text, cls: 'tag-warn' };
    return { text, cls: '' };
  }

  function formatRenewalRemaining(dateStr) {
    if (!dateStr) return 'N/A';
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3) return dateStr;
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const targetUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const diffDays = Math.round((targetUtc - todayUtc) / 86400000);
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays > 1) return `In ${diffDays} days`;
    const ago = Math.abs(diffDays);
    return `${ago} ${ago === 1 ? 'day' : 'days'} overdue`;
  }

  function formatDuration(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(mins).padStart(2, '0');
    const ss = String(secs).padStart(2, '0');
    if (days > 0) return `${days}d ${hh}h ${mm}m`;
    return `${hh}h ${mm}m ${ss}s`;
  }

  function formatLocalClock(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatNumber(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    const rounded = Math.round(num * 100) / 100;
    const isWhole = Math.abs(rounded - Math.round(rounded)) < 0.001;
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: 2
    });
  }
})();
