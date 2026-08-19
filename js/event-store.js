(() => {
  const STORAGE_KEY = 'shelter-event-updates-v1';
  const DEMO_USER = 'user_demo';
  const DISPLAY_HISTORY_LIMIT = 3;
  const CONFIRMATION_HOURS = [9, 13, 18];
  const SUPPLY_ITEMS = ['飲料水', '食料', '毛布', '衛生用品', '簡易トイレ'];
  const SUPPLY_UNITS = ['ケース', '箱', '袋', '個', '枚', 'セット', '台'];
  const ISSUE_CATEGORIES = ['トイレ', 'ごみ・衛生', '停電', '断水', '空調', '建物', 'その他'];
  const ISSUE_SEVERITIES = {
    none: { label: '問題なし', rank: 0, color: 'green' },
    caution: { label: '注意', rank: 1, color: 'yellow' },
    urgent: { label: '至急対応', rank: 2, color: 'red' }
  };

  function createEmptyState() {
    return {
      shelters: {}, history: {}, confirmations: {}, events: [],
      supplies: {}, issues: {}, notices: {}
    };
  }

  function getState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.shelters || !saved.history) return createEmptyState();
      return {
        ...createEmptyState(),
        ...saved,
        confirmations: saved.confirmations || {},
        events: Array.isArray(saved.events) ? saved.events : [],
        supplies: saved.supplies || {},
        issues: saved.issues || {},
        notices: saved.notices || {}
      };
    } catch (error) {
      console.warn('模擬更新データを初期化しました。', error);
      return createEmptyState();
    }
  }

  function saveState(state, detail) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('shelter-event-updated', { detail }));
  }

  function formatDateTime(date) {
    const parts = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function formatDelta(delta) {
    return delta > 0 ? `＋${delta}` : `－${Math.abs(delta)}`;
  }

  function normalizeDate(value) {
    const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error('発生時刻が不正です');
    return date;
  }

  function touchShelter(state, shelterId, occurredAt, updates = {}) {
    state.shelters[shelterId] = {
      ...(state.shelters[shelterId] || {}),
      ...updates,
      updatedAt: formatDateTime(occurredAt),
      lastUpdatedBy: DEMO_USER
    };
  }

  function appendHistory(state, shelterId, historyItem) {
    state.history[shelterId] = [historyItem, ...(state.history[shelterId] || [])];
  }

  function appendCommonEvent(state, { eventType, shelterId, occurredAt, payload, status = 'confirmed' }) {
    const occurredAtText = formatDateTime(occurredAt);
    const eventRecord = {
      id: `${occurredAt.getTime()}-${state.events.length + 1}`,
      eventType,
      shelterId,
      occurredAt: occurredAtText,
      updatedBy: DEMO_USER,
      payload,
      status
    };
    state.events.unshift(eventRecord);
    return eventRecord;
  }

  function createSlotDate(baseDate, hour, dayOffset = 0) {
    const slot = new Date(baseDate);
    slot.setDate(slot.getDate() + dayOffset);
    slot.setHours(hour, 0, 0, 0);
    return slot;
  }

  function formatSlot(date) {
    return `${formatDateTime(date).slice(0, 10)} ${String(date.getHours()).padStart(2, '0')}:00`;
  }

  function getConfirmationSchedule(date = new Date()) {
    const now = normalizeDate(date);
    const hour = now.getHours();
    let currentSlot;
    let nextSlot;

    if (hour < CONFIRMATION_HOURS[0]) {
      currentSlot = createSlotDate(now, CONFIRMATION_HOURS[2], -1);
      nextSlot = createSlotDate(now, CONFIRMATION_HOURS[0]);
    } else if (hour < CONFIRMATION_HOURS[1]) {
      currentSlot = createSlotDate(now, CONFIRMATION_HOURS[0]);
      nextSlot = createSlotDate(now, CONFIRMATION_HOURS[1]);
    } else if (hour < CONFIRMATION_HOURS[2]) {
      currentSlot = createSlotDate(now, CONFIRMATION_HOURS[1]);
      nextSlot = createSlotDate(now, CONFIRMATION_HOURS[2]);
    } else {
      currentSlot = createSlotDate(now, CONFIRMATION_HOURS[2]);
      nextSlot = createSlotDate(now, CONFIRMATION_HOURS[0], 1);
    }

    const isNextDay = nextSlot.getDate() !== now.getDate();
    return {
      currentSlot: formatSlot(currentSlot),
      currentSlotLabel: `${String(currentSlot.getHours()).padStart(2, '0')}:00`,
      nextSlot: formatSlot(nextSlot),
      nextSlotLabel: `${isNextDay ? '翌日' : ''}${String(nextSlot.getHours()).padStart(2, '0')}:00`
    };
  }

  function recordEvacueeArrival({ shelterId, currentTotal, delta, occurredAt = new Date() }) {
    if (!Number.isInteger(delta) || delta === 0) throw new Error('増減人数は0以外の整数で指定してください');
    const nextTotal = currentTotal + delta;
    if (nextTotal < 0) throw new Error('避難者数を0人未満にはできません');

    const now = normalizeDate(occurredAt);
    const state = getState();
    const deltaLabel = formatDelta(delta);
    touchShelter(state, shelterId, now, { evacueesTotal: nextTotal });
    const historyItem = {
      time: formatTime(now), user: DEMO_USER,
      action: `避難者来所 ${deltaLabel}`, event: '避難者来所', content: deltaLabel
    };
    appendHistory(state, shelterId, historyItem);
    appendCommonEvent(state, {
      eventType: 'evacuee-arrival', shelterId, occurredAt: now,
      payload: { delta, total: nextTotal }
    });
    saveState(state, { shelterId, event: 'evacuee-arrival' });
    return { ...state.shelters[shelterId], history: state.history[shelterId] };
  }

  function recordScheduledConfirmation({ shelterId, currentTotal, mode, value = 0, confirmedAt = new Date() }) {
    if (!Number.isInteger(currentTotal) || currentTotal < 0) throw new Error('現在人数が不正です');
    if (!['unchanged', 'delta', 'correction'].includes(mode)) throw new Error('確認方法が不正です');

    let nextTotal = currentTotal;
    let content = '変更なし';
    if (mode === 'delta') {
      if (!Number.isInteger(value) || value === 0) throw new Error('増減人数は0以外の整数で指定してください');
      nextTotal = currentTotal + value;
      content = formatDelta(value);
    }
    if (mode === 'correction') {
      if (!Number.isInteger(value) || value < 0) throw new Error('現在人数は0以上の整数で指定してください');
      nextTotal = value;
      content = '実数訂正';
    }
    if (nextTotal < 0) throw new Error('避難者数を0人未満にはできません');

    const now = normalizeDate(confirmedAt);
    const schedule = getConfirmationSchedule(now);
    const state = getState();
    const confirmedAtText = formatDateTime(now);
    touchShelter(state, shelterId, now, { evacueesTotal: nextTotal });
    state.confirmations[shelterId] = {
      officialTotal: nextTotal, confirmedAt: confirmedAtText,
      confirmationSlot: schedule.currentSlot, lastUpdatedBy: DEMO_USER
    };
    const historyItem = {
      time: formatTime(now), user: DEMO_USER,
      action: `避難者数定時確認 ${content} ${nextTotal}名`,
      event: '避難者数定時確認', content, total: nextTotal
    };
    appendHistory(state, shelterId, historyItem);
    appendCommonEvent(state, {
      eventType: 'scheduled-evacuee-confirmation', shelterId, occurredAt: now,
      payload: { mode, value, total: nextTotal, confirmationSlot: schedule.currentSlot }
    });
    saveState(state, { shelterId, event: 'scheduled-evacuee-confirmation' });
    return {
      ...state.shelters[shelterId], officialConfirmation: state.confirmations[shelterId],
      history: state.history[shelterId]
    };
  }

  function recordSupplyReceipt({ shelterId, item, quantity, unit, occurredAt = new Date() }) {
    if (!SUPPLY_ITEMS.includes(item)) throw new Error('物資種別を選択してください');
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error('数量は0より大きい整数で入力してください');
    if (!SUPPLY_UNITS.includes(unit)) throw new Error('単位を選択してください');

    const now = normalizeDate(occurredAt);
    const state = getState();
    const receipt = { item, quantity, unit, receivedAt: formatDateTime(now), updatedBy: DEMO_USER };
    const supplyState = state.supplies[shelterId] || { latestByItem: {}, latestReceipt: null };
    supplyState.latestByItem[item] = receipt;
    supplyState.latestReceipt = receipt;
    state.supplies[shelterId] = supplyState;
    touchShelter(state, shelterId, now);
    appendHistory(state, shelterId, {
      time: formatTime(now), user: DEMO_USER,
      action: `物資受領 ${item} ${quantity}${unit}`,
      event: '物資受領', content: `${item} ${quantity}${unit}`
    });
    appendCommonEvent(state, {
      eventType: 'supply-received', shelterId, occurredAt: now,
      payload: { item, quantity, unit }
    });
    saveState(state, { shelterId, event: 'supply-received' });
    return receipt;
  }

  function calculateIssueStatusOverride(byCategory) {
    const highestRank = Math.max(0, ...Object.values(byCategory).map((issue) => ISSUE_SEVERITIES[issue.severity]?.rank || 0));
    if (highestRank === ISSUE_SEVERITIES.urgent.rank) return 'red';
    if (highestRank === ISSUE_SEVERITIES.caution.rank) return 'yellow';
    return null;
  }

  function recordFacilityIssue({ shelterId, category, severity, occurredAt = new Date() }) {
    if (!ISSUE_CATEGORIES.includes(category)) throw new Error('不具合カテゴリを選択してください');
    if (!ISSUE_SEVERITIES[severity]) throw new Error('状態を選択してください');

    const now = normalizeDate(occurredAt);
    const state = getState();
    const severityMeta = ISSUE_SEVERITIES[severity];
    const issue = {
      category, severity, severityLabel: severityMeta.label, color: severityMeta.color,
      updatedAt: formatDateTime(now), updatedBy: DEMO_USER
    };
    const issueState = state.issues[shelterId] || { byCategory: {}, latestIssue: null };
    issueState.byCategory[category] = issue;
    issueState.latestIssue = issue;
    state.issues[shelterId] = issueState;
    touchShelter(state, shelterId, now, { statusOverride: calculateIssueStatusOverride(issueState.byCategory) });
    appendHistory(state, shelterId, {
      time: formatTime(now), user: DEMO_USER,
      action: `避難所不具合 ${category} ${severityMeta.label}`,
      event: '避難所不具合', content: `${category} ${severityMeta.label}`
    });
    appendCommonEvent(state, {
      eventType: 'facility-issue', shelterId, occurredAt: now,
      payload: { category, severity, severityLabel: severityMeta.label }
    });
    saveState(state, { shelterId, event: 'facility-issue' });
    return issue;
  }

  function recordNotice({ shelterId, title, startTime, location, message, isPublic, occurredAt = new Date() }) {
    if (!String(title).trim()) throw new Error('タイトルを入力してください');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error('開始時刻を入力してください');
    if (!String(location).trim()) throw new Error('場所を入力してください');
    if (!String(message).trim()) throw new Error('短い本文を入力してください');
    if (typeof isPublic !== 'boolean') throw new Error('公開状態を選択してください');

    const now = normalizeDate(occurredAt);
    const state = getState();
    const notice = {
      title: String(title).trim(), startTime, location: String(location).trim(),
      message: String(message).trim(), isPublic,
      updatedAt: formatDateTime(now), updatedBy: DEMO_USER
    };
    state.notices[shelterId] = [notice, ...(state.notices[shelterId] || [])];
    touchShelter(state, shelterId, now);
    const visibilityLabel = isPublic ? '公開' : '非公開';
    appendHistory(state, shelterId, {
      time: formatTime(now), user: DEMO_USER,
      action: `お知らせ更新 ${notice.title} ${startTime} ${visibilityLabel}`,
      event: 'お知らせ更新', content: `${notice.title} ${startTime} ${visibilityLabel}`
    });
    appendCommonEvent(state, {
      eventType: 'notice-update', shelterId, occurredAt: now,
      payload: { title: notice.title, startTime, location: notice.location, message: notice.message, isPublic },
      status: isPublic ? 'published' : 'private'
    });
    saveState(state, { shelterId, event: 'notice-update' });
    return notice;
  }

  function applyShelterUpdates(shelters) {
    const state = getState();
    return shelters.map((shelter) => {
      const update = state.shelters[shelter.id];
      const confirmation = state.confirmations[shelter.id] || null;
      if (!update && !confirmation) return { ...shelter, officialConfirmation: null };
      return {
        ...shelter,
        status: update?.statusOverride || shelter.status,
        updatedAt: update?.updatedAt || shelter.updatedAt,
        evacuees: { ...shelter.evacuees, total: update?.evacueesTotal ?? shelter.evacuees.total },
        officialConfirmation: confirmation
      };
    });
  }

  function applyHistoryUpdates(historyRecords) {
    const state = getState();
    return historyRecords.map((record) => {
      const shelterUpdate = state.shelters[record.shelterId];
      const eventHistory = state.history[record.shelterId] || [];
      if (!shelterUpdate && !eventHistory.length) return record;
      return {
        ...record,
        lastUpdatedBy: shelterUpdate?.lastUpdatedBy || record.lastUpdatedBy,
        history: [...eventHistory, ...record.history].slice(0, DISPLAY_HISTORY_LIMIT)
      };
    });
  }

  function getLastUpdatedBy(shelterId, fallback = '未確認') {
    return getState().shelters[shelterId]?.lastUpdatedBy || fallback;
  }

  function getOfficialConfirmation(shelterId) {
    return getState().confirmations[shelterId] || null;
  }

  function getConfirmationStatus(shelterId, date = new Date()) {
    const schedule = getConfirmationSchedule(date);
    const confirmation = getOfficialConfirmation(shelterId);
    return {
      ...schedule,
      confirmation,
      isCurrentSlotConfirmed: confirmation?.confirmationSlot === schedule.currentSlot
    };
  }

  function getLatestSupplyReceipts(shelterId) {
    const latestByItem = getState().supplies[shelterId]?.latestByItem || {};
    return Object.values(latestByItem).sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  }

  function getFacilityIssues(shelterId) {
    const byCategory = getState().issues[shelterId]?.byCategory || {};
    return Object.values(byCategory).sort((left, right) => {
      const rankDifference = (ISSUE_SEVERITIES[right.severity]?.rank || 0) - (ISSUE_SEVERITIES[left.severity]?.rank || 0);
      return rankDifference || right.updatedAt.localeCompare(left.updatedAt);
    });
  }

  function getPublicNotices(shelterId) {
    return (getState().notices[shelterId] || []).filter((notice) => notice.isPublic);
  }

  function getLatestOperationalSummary(shelterId) {
    const state = getState();
    return {
      latestSupply: state.supplies[shelterId]?.latestReceipt || null,
      latestIssue: state.issues[shelterId]?.latestIssue || null
    };
  }

  function getAllEvents() {
    return [...getState().events];
  }

  function resetTestData() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('shelter-event-updated', { detail: { event: 'test-data-reset' } }));
  }

  function subscribe(listener) {
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) listener();
    });
    window.addEventListener('shelter-event-updated', listener);
  }

  window.EventStore = {
    applyHistoryUpdates,
    applyShelterUpdates,
    getAllEvents,
    getConfirmationSchedule,
    getConfirmationStatus,
    getFacilityIssues,
    getLastUpdatedBy,
    getLatestOperationalSummary,
    getLatestSupplyReceipts,
    getOfficialConfirmation,
    getPublicNotices,
    recordEvacueeArrival,
    recordFacilityIssue,
    recordNotice,
    recordScheduledConfirmation,
    recordSupplyReceipt,
    resetTestData,
    subscribe
  };
})();
