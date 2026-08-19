(() => {
  'use strict';

  const CLOCK_INTERVAL_MS = 1000;
  const DATA_REFRESH_INTERVAL_MS = 60000;
  let currentDemoContext = null;
  let currentShelter = null;
  let lastSuccessfulUpdate = null;

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function formatTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '--:--';
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo'
    }).format(date);
  }

  function updateClock() {
    const now = new Date();
    document.getElementById('current-time').textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(now);
  }

  function validateNotices(notices) {
    if (!Array.isArray(notices)) throw new Error('Public notices response is not an array');
    return notices;
  }

  function showContextGuidance(message) {
    currentDemoContext = null;
    currentShelter = null;
    document.getElementById('facility-name').textContent = '未設定';
    document.getElementById('important-message').textContent = '避難所設定を確認してください';
    document.getElementById('information-context-message').textContent = message;
    document.getElementById('information-context-guidance').hidden = false;
    document.getElementById('load-status').textContent = 'Launcherで端末設定を確認してください';
  }

  function showConfiguredContext(context, shelter) {
    currentDemoContext = context;
    currentShelter = shelter;
    document.getElementById('facility-name').textContent = shelter.name;
    document.getElementById('information-context-guidance').hidden = true;
  }

  async function resolveDemoContext() {
    const savedState = window.DemoContext.getDemoContextState();
    if (savedState.status !== 'stored') {
      showContextGuidance(savedState.status === 'invalid'
        ? '端末設定が無効です。Launcherで設定し直してください。'
        : '対象避難所を設定してください。');
      return null;
    }

    try {
      const shelters = await window.ApiClient.apiGet('/shelters');
      if (!window.DemoContext.isDemoContextConfigured(savedState.context, shelters)) {
        showContextGuidance('端末設定が無効です。Launcherで設定し直してください。');
        return null;
      }

      const shelter = shelters.find((item) => item.id === savedState.context.shelterId);
      showConfiguredContext(savedState.context, shelter);
      return savedState.context;
    } catch (error) {
      showContextGuidance('端末設定を確認できませんでした。通信状態を確認してください。');
      console.error('Information Board context load failed', {
        type: error?.type || 'unknown', status: error?.status || null, code: error?.code || null
      });
      return null;
    }
  }

  function renderPublishedNotices(notices) {
    const container = document.getElementById('published-notices');
    if (!notices.length) {
      container.innerHTML = '<p class="empty-notice">現在、公開中のお知らせはありません</p>';
      return;
    }
    container.innerHTML = notices.map((notice) => `
      <article class="published-notice-card">
        <div class="notice-time"><span>開始</span><strong>${escapeHtml(notice.startTime)}</strong></div>
        <div class="notice-content">
          <h3>${escapeHtml(notice.title)}</h3>
          <p class="notice-location">場所：${escapeHtml(notice.location)}</p>
          <p>${escapeHtml(notice.body)}</p>
        </div>
      </article>`).join('');
  }

  function renderSuccessfulUpdate(notices) {
    lastSuccessfulUpdate = new Date();
    document.getElementById('facility-name').textContent = currentShelter.name;
    document.getElementById('important-message').textContent = '現在、重要なお知らせはありません';
    document.getElementById('data-updated').textContent = formatTime(lastSuccessfulUpdate);
    document.getElementById('load-status').textContent = '確定済み生活支援情報を表示中';
    renderPublishedNotices(notices);
  }

  function renderLoadFailure() {
    const lastUpdateLabel = lastSuccessfulUpdate
      ? `最終正常更新 ${formatTime(lastSuccessfulUpdate)}`
      : '最終正常更新なし';
    document.getElementById('load-status').textContent =
      `情報を更新できませんでした。前回の表示を継続します（${lastUpdateLabel}）`;
    if (!lastSuccessfulUpdate) {
      document.getElementById('important-message').textContent = '情報を取得できませんでした';
    }
  }

  async function loadNotices() {
    if (!currentDemoContext) return;
    try {
      const response = await window.ApiClient.apiGet(
        `/shelters/${encodeURIComponent(currentDemoContext.shelterId)}/notices?public=true`
      );
      renderSuccessfulUpdate(validateNotices(response));
    } catch (error) {
      console.error('Information Board refresh failed', {
        type: error?.type || 'unknown', status: error?.status || null, code: error?.code || null
      });
      renderLoadFailure();
    }
  }

  async function start() {
    updateClock();
    const context = await resolveDemoContext();
    window.setInterval(updateClock, CLOCK_INTERVAL_MS);
    if (!context) return;
    await loadNotices();
    window.setInterval(loadNotices, DATA_REFRESH_INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', start);
})();
