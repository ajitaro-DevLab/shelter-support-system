(() => {
  const EVENTS_PATH = 'data/events.json';
  const PRIORITY_CLASSES = {
    '緊急': 'priority-urgent',
    '高': 'priority-high',
    '通常': 'priority-normal'
  };
  let currentDemoContext = null;
  let currentShelter = null;
  let selectedDelta = 1;
  let routineMode = 'unchanged';
  let routineValue = 0;

  function getEventOccurredAt() {
    const value = document.getElementById('test-occurred-at').value;
    return value ? new Date(value) : new Date();
  }

  function showSuccess(message) {
    const success = document.getElementById('event-success');
    success.textContent = message;
    success.hidden = false;
    window.setTimeout(() => { success.hidden = true; }, 4000);
    updateStoredEventCount();
  }

  function updateStoredEventCount() {
    const count = document.getElementById('stored-event-count');
    if (count) count.textContent = currentShelter?.history?.length ?? 0;
  }

  function formatDateTime(value) {
    if (!value) return '未確認';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未確認';
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  function showContextGuidance(message) {
    currentDemoContext = null;
    currentShelter = null;
    document.getElementById('event-current-shelter').textContent = '未設定';
    document.getElementById('event-current-user').textContent = '未設定';
    document.getElementById('event-context-message').textContent = message;
    document.getElementById('event-context-guidance').hidden = false;
  }

  function showConfiguredContext(context, shelter) {
    const user = window.DemoContext.getDemoUsers().find((item) => item.id === context.userId);
    document.getElementById('event-current-shelter').textContent = shelter.name;
    document.getElementById('event-current-user').textContent = user
      ? `${user.displayName}（${user.id}）`
      : context.userId;
    document.querySelectorAll('[data-event-context-shelter]').forEach((element) => {
      element.textContent = shelter.name;
    });
    document.querySelectorAll('[data-event-context-updater]').forEach((element) => {
      element.textContent = context.userId;
    });
    document.getElementById('event-context-guidance').hidden = true;
  }

  async function resolveDemoContext() {
    const savedState = window.DemoContext.getDemoContextState();
    if (savedState.status !== 'stored') {
      showContextGuidance(savedState.status === 'invalid'
        ? '端末設定が無効です。Launcherで設定し直してください。'
        : '対象避難所と利用者を設定してください。');
      return null;
    }

    try {
      const shelters = await window.ApiClient.apiGet('/shelters');
      if (!window.DemoContext.isDemoContextConfigured(savedState.context, shelters)) {
        showContextGuidance('端末設定が無効です。Launcherで設定し直してください。');
        return null;
      }

      const shelter = shelters.find((item) => item.id === savedState.context.shelterId);
      currentDemoContext = savedState.context;
      showConfiguredContext(currentDemoContext, shelter);
      return currentDemoContext;
    } catch (error) {
      showContextGuidance('端末設定を確認できませんでした。通信状態を確認してください。');
      console.error('Event Centerの端末設定確認に失敗しました。', {
        type: error?.type ?? 'unknown',
        status: error?.status ?? null,
        code: error?.code ?? null,
        requestId: error?.requestId ?? null
      });
      return null;
    }
  }

  async function loadCurrentShelter() {
    if (!currentDemoContext) throw new Error('端末設定が必要です');
    currentShelter = await window.ApiClient.apiGet(
      `/shelters/${encodeURIComponent(currentDemoContext.shelterId)}`
    );
    updateStoredEventCount();
    return currentShelter;
  }

  function showApiError(error, validationId) {
    document.getElementById(validationId).textContent =
      '保存されていません。通信状態を確認して、もう一度実行してください。';
    console.error('Event Center APIの保存に失敗しました。', {
      type: error?.type ?? 'unknown',
      status: error?.status ?? null,
      code: error?.code ?? null,
      requestId: error?.requestId ?? null
    });
  }

  function clearEventError() {
    const errorElement = document.getElementById('event-error');
    errorElement.textContent = '';
    errorElement.hidden = true;
  }

  async function postEvent({ path, body, confirmId, validationId }) {
    const confirmButton = document.getElementById(confirmId);
    const defaultLabel = confirmButton.textContent;
    confirmButton.disabled = true;
    confirmButton.textContent = '保存中…';
    document.getElementById(validationId).textContent = '';
    try {
      const result = await window.ApiClient.apiPost(path, body);
      try {
        await loadCurrentShelter();
        clearEventError();
      } catch (refreshError) {
        const errorElement = document.getElementById('event-error');
        errorElement.textContent = '保存しましたが、最新データを再取得できませんでした。';
        errorElement.hidden = false;
        console.error('Event Center APIの再取得に失敗しました。', {
          type: refreshError?.type ?? 'unknown',
          status: refreshError?.status ?? null,
          code: refreshError?.code ?? null,
          requestId: refreshError?.requestId ?? null
        });
      }
      return result;
    } catch (error) {
      showApiError(error, validationId);
      return null;
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = defaultLabel;
    }
  }

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function releaseModalFocus() {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }
  }

  function validateEvent(event) {
    return event && event.id && event.name && event.description && event.targetScreen
      && Array.isArray(event.updateTargets) && Array.isArray(event.impactScreens)
      && event.priority && event.lastUpdaterPolicy;
  }

  function renderDetail(event) {
    document.querySelectorAll('[data-event-id]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.eventId === event.id);
      button.setAttribute('aria-pressed', String(button.dataset.eventId === event.id));
    });
    document.getElementById('event-detail-title').textContent = event.name;
    document.getElementById('event-priority').textContent = `優先度 ${event.priority}`;
    document.getElementById('event-description').textContent = event.description;
    document.getElementById('event-update-targets').textContent = event.updateTargets.join('、');
    document.getElementById('event-impact-screens').textContent = event.impactScreens.join('、');
    document.getElementById('event-target-screen').textContent = event.targetScreen;
    document.getElementById('event-last-updater').textContent = currentDemoContext
      ? `${currentDemoContext.userId}（端末設定）`
      : event.lastUpdaterPolicy;
  }

  function renderEvents(events) {
    const eventList = document.getElementById('event-list');
    eventList.innerHTML = events.map((event, index) => `
      <button class="event-button ${PRIORITY_CLASSES[event.priority] || 'priority-normal'}" type="button" data-event-id="${escapeHtml(event.id)}" aria-pressed="${index === 0}">
        <span class="event-symbol" aria-hidden="true">${escapeHtml(event.symbol)}</span>
        <span><strong>${escapeHtml(event.name)}</strong><small>${escapeHtml(event.summary)}</small></span>
      </button>`).join('');
    eventList.querySelectorAll('[data-event-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const event = events.find((item) => item.id === button.dataset.eventId);
        renderDetail(event);
        if (event.id === 'evacuee-arrival') openArrivalModal();
        if (event.id === 'supply-received') openSupplyModal();
        if (event.id === 'notice-update') openNoticeModal();
        if (event.id === 'facility-issue') openIssueModal();
        if (event.id === 'shelter-routine-update') openRoutineModal();
      });
    });
    renderDetail(events[0]);
  }

  function updateArrivalPreview() {
    const nextTotal = currentShelter.currentCount + selectedDelta;
    const validation = document.getElementById('arrival-validation');
    const isValid = Number.isInteger(selectedDelta) && selectedDelta !== 0 && nextTotal >= 0;
    document.getElementById('arrival-next-total').textContent = isValid ? nextTotal : '--';
    document.getElementById('arrival-confirm').disabled = !isValid;
    validation.textContent = !Number.isInteger(selectedDelta)
      ? '整数で入力してください'
      : selectedDelta === 0
        ? '0以外の人数を指定してください'
        : nextTotal < 0 ? '避難者数を0人未満にはできません' : '';
  }

  function setDelta(delta) {
    selectedDelta = delta;
    document.querySelectorAll('[data-delta]').forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset.delta) === delta);
    });
    document.getElementById('arrival-direct-input').value = '';
    updateArrivalPreview();
  }

  function openArrivalModal() {
    selectedDelta = 1;
    document.getElementById('arrival-current-total').textContent = currentShelter.currentCount;
    document.getElementById('arrival-modal').hidden = false;
    setDelta(1);
    document.querySelector('[data-delta="1"]').focus();
  }

  function closeArrivalModal() {
    releaseModalFocus();
    document.getElementById('arrival-modal').hidden = true;
  }

  async function confirmArrival() {
    if (!Number.isInteger(selectedDelta) || selectedDelta === 0 || currentShelter.currentCount + selectedDelta < 0) {
      updateArrivalPreview();
      return;
    }
    const result = await postEvent({
      path: `/shelters/${encodeURIComponent(currentShelter.id)}/events/visitor-change`,
      body: {
        delta: selectedDelta,
        occurredAt: getEventOccurredAt().toISOString(),
        updatedBy: currentDemoContext.userId
      },
      confirmId: 'arrival-confirm',
      validationId: 'arrival-validation'
    });
    if (result) {
      closeArrivalModal();
      showSuccess(`避難者来所 ${selectedDelta > 0 ? '＋' : '－'}${Math.abs(selectedDelta)}人を記録しました`);
    }
  }

  function updateRoutinePreview() {
    const validation = document.getElementById('routine-validation');
    let nextTotal = currentShelter.currentCount;
    let message = '';

    if (routineMode === 'delta') {
      nextTotal += routineValue;
      if (!Number.isInteger(routineValue) || routineValue === 0) message = '増減人数を選択してください';
      if (nextTotal < 0) message = '避難者数を0人未満にはできません';
    }
    if (routineMode === 'correction') {
      if (routineValue === null) message = '現在人数を入力してください';
      else if (!Number.isInteger(routineValue)) message = '0以上の整数で入力してください';
      else if (routineValue < 0) message = '負数は入力できません';
      else nextTotal = routineValue;
    }

    const isValid = message === '';
    document.getElementById('routine-next-total').textContent = isValid ? nextTotal : '--';
    document.getElementById('routine-confirm').disabled = !isValid;
    validation.textContent = message;
  }

  function selectRoutineMode(mode, value = 0) {
    routineMode = mode;
    routineValue = value;
    document.getElementById('routine-unchanged').classList.toggle('is-selected', mode === 'unchanged');
    document.querySelectorAll('[data-routine-delta]').forEach((button) => {
      button.classList.toggle('is-selected', mode === 'delta' && Number(button.dataset.routineDelta) === value);
    });
    if (mode !== 'correction') document.getElementById('routine-direct-input').value = '';
    updateRoutinePreview();
  }

  function openRoutineModal() {
    const schedule = window.ConfirmationSchedule.getConfirmationSchedule(getEventOccurredAt());
    document.getElementById('routine-current-total').textContent = currentShelter.currentCount;
    document.getElementById('routine-previous-total').textContent = currentShelter.confirmedCount ?? '--';
    document.getElementById('routine-previous-unit').hidden = currentShelter.confirmedCount === null;
    document.getElementById('routine-previous-time').textContent = formatDateTime(currentShelter.confirmedAt);
    document.getElementById('routine-current-slot').textContent = schedule.currentSlotLabel;
    document.getElementById('routine-next-slot').textContent = schedule.nextSlotLabel;
    document.getElementById('routine-modal').hidden = false;
    selectRoutineMode('unchanged');
    document.getElementById('routine-unchanged').focus();
  }

  function closeRoutineModal() {
    releaseModalFocus();
    document.getElementById('routine-modal').hidden = true;
  }

  function getRoutineContentLabel() {
    if (routineMode === 'unchanged') return '変更なし';
    if (routineMode === 'correction') return '実数訂正';
    return routineValue > 0 ? `＋${routineValue}` : `－${Math.abs(routineValue)}`;
  }

  async function confirmRoutine() {
    updateRoutinePreview();
    if (document.getElementById('routine-confirm').disabled) return;
    const content = getRoutineContentLabel();
    const occurredAt = getEventOccurredAt();
    const confirmedCount = routineMode === 'correction'
      ? routineValue
      : currentShelter.currentCount + (routineMode === 'delta' ? routineValue : 0);
    const result = await postEvent({
      path: `/shelters/${encodeURIComponent(currentShelter.id)}/confirmations`,
      body: {
        mode: routineMode,
        confirmedCount,
        confirmationSlot: window.ConfirmationSchedule.getConfirmationSchedule(occurredAt).currentSlot,
        occurredAt: occurredAt.toISOString(),
        updatedBy: currentDemoContext.userId
      },
      confirmId: 'routine-confirm',
      validationId: 'routine-validation'
    });
    if (result) {
      closeRoutineModal();
      showSuccess(`避難者数定時確認 ${content}・${result.currentCount}名を記録しました`);
    }
  }

  function openSupplyModal() {
    document.getElementById('supply-item').value = '';
    document.getElementById('supply-quantity').value = '';
    document.getElementById('supply-unit').value = '';
    document.getElementById('supply-validation').textContent = '';
    document.getElementById('supply-modal').hidden = false;
    document.getElementById('supply-item').focus();
  }

  function closeSupplyModal() {
    releaseModalFocus();
    document.getElementById('supply-modal').hidden = true;
  }

  async function confirmSupply() {
    const item = document.getElementById('supply-item').value;
    const quantityValue = document.getElementById('supply-quantity').value;
    const quantity = quantityValue === '' ? 0 : Number(quantityValue);
    const unit = document.getElementById('supply-unit').value;
    if (!item || !Number.isInteger(quantity) || quantity < 1 || !unit) {
      document.getElementById('supply-validation').textContent = '物資種別・1以上の整数・単位を入力してください';
      return;
    }
    const result = await postEvent({
      path: `/shelters/${encodeURIComponent(currentShelter.id)}/supplies`,
      body: {
        supplyType: item,
        quantity,
        unit,
        occurredAt: getEventOccurredAt().toISOString(),
        updatedBy: currentDemoContext.userId
      },
      confirmId: 'supply-confirm',
      validationId: 'supply-validation'
    });
    if (result) {
      closeSupplyModal();
      showSuccess(`物資受領 ${document.getElementById('supply-item').selectedOptions[0].textContent} ${quantity}${unit}を記録しました`);
    }
  }

  function openIssueModal() {
    document.getElementById('issue-category').value = '';
    document.getElementById('issue-severity').value = '';
    document.getElementById('issue-validation').textContent = '';
    document.getElementById('issue-modal').hidden = false;
    document.getElementById('issue-category').focus();
  }

  function closeIssueModal() {
    releaseModalFocus();
    document.getElementById('issue-modal').hidden = true;
  }

  async function confirmIssue() {
    const category = document.getElementById('issue-category').value;
    const severity = document.getElementById('issue-severity').value;
    if (!category || !severity) {
      document.getElementById('issue-validation').textContent = 'カテゴリと状態を選択してください';
      return;
    }
    const categoryLabel = document.getElementById('issue-category').selectedOptions[0].textContent;
    const severityLabel = document.getElementById('issue-severity').selectedOptions[0].textContent;
    const result = await postEvent({
      path: `/shelters/${encodeURIComponent(currentShelter.id)}/issues`,
      body: {
        category,
        severity,
        occurredAt: getEventOccurredAt().toISOString(),
        updatedBy: currentDemoContext.userId
      },
      confirmId: 'issue-confirm',
      validationId: 'issue-validation'
    });
    if (result) {
      closeIssueModal();
      showSuccess(`避難所不具合 ${categoryLabel}・${severityLabel}を記録しました`);
    }
  }

  function openNoticeModal() {
    document.getElementById('notice-title').value = '';
    document.getElementById('notice-start-time').value = '';
    document.getElementById('notice-location').value = '';
    document.getElementById('notice-message').value = '';
    document.getElementById('notice-public').value = '';
    document.getElementById('notice-validation').textContent = '';
    document.getElementById('notice-modal').hidden = false;
    document.getElementById('notice-title').focus();
  }

  function closeNoticeModal() {
    releaseModalFocus();
    document.getElementById('notice-modal').hidden = true;
  }

  async function confirmNotice() {
    const title = document.getElementById('notice-title').value.trim();
    const startTime = document.getElementById('notice-start-time').value;
    const location = document.getElementById('notice-location').value.trim();
    const message = document.getElementById('notice-message').value.trim();
    const visibility = document.getElementById('notice-public').value;
    const isPublic = visibility === 'public' ? true : visibility === 'private' ? false : null;
    if (!title || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !location || !message || isPublic === null) {
      document.getElementById('notice-validation').textContent = 'タイトル・開始時刻・場所・本文・公開状態を入力してください';
      return;
    }
    const result = await postEvent({
      path: `/shelters/${encodeURIComponent(currentShelter.id)}/notices`,
      body: {
        title,
        startTime,
        location,
        body: message,
        isPublic,
        occurredAt: getEventOccurredAt().toISOString(),
        updatedBy: currentDemoContext.userId
      },
      confirmId: 'notice-confirm',
      validationId: 'notice-validation'
    });
    if (result) {
      closeNoticeModal();
      showSuccess(`お知らせ「${result.title}」を${result.isPublic ? '公開' : '非公開'}で記録しました`);
    }
  }

  function initializeModalControls(modalId, closeId, cancelId, confirmId, closeHandler, confirmHandler) {
    document.getElementById(closeId).addEventListener('click', closeHandler);
    document.getElementById(cancelId).addEventListener('click', closeHandler);
    document.getElementById(confirmId).addEventListener('click', confirmHandler);
    document.getElementById(modalId).addEventListener('click', (event) => {
      if (event.target.id === modalId) closeHandler();
    });
  }

  function initAdditionalEventControls() {
    initializeModalControls('supply-modal', 'supply-close', 'supply-cancel', 'supply-confirm', closeSupplyModal, confirmSupply);
    initializeModalControls('issue-modal', 'issue-close', 'issue-cancel', 'issue-confirm', closeIssueModal, confirmIssue);
    initializeModalControls('notice-modal', 'notice-close', 'notice-cancel', 'notice-confirm', closeNoticeModal, confirmNotice);
    document.getElementById('test-reload').addEventListener('click', async () => {
      try {
        await loadCurrentShelter();
        clearEventError();
        showSuccess('APIデータを再読込しました');
      } catch (error) {
        const errorElement = document.getElementById('event-error');
        errorElement.textContent = 'APIデータを取得できませんでした。';
        errorElement.hidden = false;
      }
    });
  }

  function initArrivalControls() {
    document.querySelectorAll('[data-delta]').forEach((button) => {
      button.addEventListener('click', () => setDelta(Number(button.dataset.delta)));
    });
    document.getElementById('arrival-direct-input').addEventListener('input', (event) => {
      selectedDelta = event.target.value === '' ? 0 : Number(event.target.value);
      document.querySelectorAll('[data-delta]').forEach((button) => button.classList.remove('is-selected'));
      updateArrivalPreview();
    });
    document.getElementById('arrival-close').addEventListener('click', closeArrivalModal);
    document.getElementById('arrival-cancel').addEventListener('click', closeArrivalModal);
    document.getElementById('arrival-confirm').addEventListener('click', confirmArrival);
    document.getElementById('arrival-modal').addEventListener('click', (event) => {
      if (event.target.id === 'arrival-modal') closeArrivalModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !document.getElementById('arrival-modal').hidden) closeArrivalModal();
      if (event.key === 'Escape' && !document.getElementById('routine-modal').hidden) closeRoutineModal();
      if (event.key === 'Escape' && !document.getElementById('supply-modal').hidden) closeSupplyModal();
      if (event.key === 'Escape' && !document.getElementById('issue-modal').hidden) closeIssueModal();
      if (event.key === 'Escape' && !document.getElementById('notice-modal').hidden) closeNoticeModal();
    });
  }

  function initRoutineControls() {
    document.getElementById('routine-unchanged').addEventListener('click', () => selectRoutineMode('unchanged'));
    document.querySelectorAll('[data-routine-delta]').forEach((button) => {
      button.addEventListener('click', () => selectRoutineMode('delta', Number(button.dataset.routineDelta)));
    });
    document.getElementById('routine-direct-input').addEventListener('input', (event) => {
      const value = event.target.value;
      routineMode = 'correction';
      routineValue = value === '' ? null : Number(value);
      document.getElementById('routine-unchanged').classList.remove('is-selected');
      document.querySelectorAll('[data-routine-delta]').forEach((button) => button.classList.remove('is-selected'));
      updateRoutinePreview();
    });
    document.getElementById('routine-close').addEventListener('click', closeRoutineModal);
    document.getElementById('routine-cancel').addEventListener('click', closeRoutineModal);
    document.getElementById('routine-confirm').addEventListener('click', confirmRoutine);
    document.getElementById('routine-modal').addEventListener('click', (event) => {
      if (event.target.id === 'routine-modal') closeRoutineModal();
    });
  }

  async function start() {
    const context = await resolveDemoContext();
    if (!context) return;

    try {
      const [eventsResponse] = await Promise.all([
        fetch(EVENTS_PATH, { cache: 'no-store' }),
        loadCurrentShelter()
      ]);
      if (!eventsResponse.ok) throw new Error('初期データを読み込めません');
      const events = await eventsResponse.json();
      if (!Array.isArray(events) || events.length !== 6 || !events.every(validateEvent)) {
        throw new Error('イベント定義が不正です');
      }
      initArrivalControls();
      initRoutineControls();
      initAdditionalEventControls();
      renderEvents(events);
      updateStoredEventCount();
      clearEventError();
    } catch (error) {
      console.error('Event Centerの初期データ読み込みに失敗しました。', {
        type: error?.type ?? 'unknown',
        status: error?.status ?? null,
        code: error?.code ?? null,
        requestId: error?.requestId ?? null
      });
      const errorElement = document.getElementById('event-error');
      errorElement.textContent = 'イベント定義またはAPIデータを読み込めませんでした。';
      errorElement.hidden = false;
    }
  }

  window.addEventListener('DOMContentLoaded', start);
})();
