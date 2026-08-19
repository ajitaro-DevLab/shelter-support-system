(() => {
  'use strict';

  const HQ_API_PATH = '/hq/shelters';
  const MAP_LOCATION_PATH = 'data/shelters.json';
  const CLOCK_INTERVAL_MS = 1000;
  const POLLING_INTERVAL_MS = 15000;
  const MAP_CENTER = [35.832, 140.145];
  const MAP_ZOOM = 12;
  const STATUS_META = {
    green: { label: '正常', className: 'status-green' },
    yellow: { label: '注意', className: 'status-yellow' },
    red: { label: '要支援', className: 'status-red' },
    gray: { label: '未更新', className: 'status-gray' }
  };
  const FRESHNESS_META = {
    green: { className: 'freshness-green' },
    yellow: { className: 'freshness-yellow' },
    orange: { className: 'freshness-orange' },
    black: { className: 'freshness-black' }
  };
  const CONFIDENCE_META = {
    confirmed: { label: '確定', rank: 1 },
    estimated: { label: '推定', rank: 2 },
    unconfirmed: { label: '未確認', rank: 3 }
  };
  const SUPPLY_LABELS = {
    water: '水', food: '食料', blanket: '毛布', hygiene: '衛生用品', toilet: '簡易トイレ'
  };
  const ISSUE_LABELS = {
    power: '電力', water: '水道', sanitation: '衛生', building: '建物', other: 'その他'
  };
  const SEVERITY_LABELS = {
    normal: '正常', caution: '注意', urgent: '緊急'
  };
  const EVENT_LABELS = {
    visitor_change: '避難者来所',
    confirmation: '避難者数定時確認',
    supply_received: '物資受領',
    issue_update: '避難所不具合',
    notice_update: 'お知らせ更新'
  };

  let map = null;
  let mapLocationsById = new Map();
  let markersById = new Map();
  let sheltersById = new Map();
  let allShelters = [];
  let selectedShelterId = null;
  let currentFilter = 'all';
  let currentSort = { key: 'freshness', direction: 'desc' };
  let controlsInitialized = false;
  let refreshInProgress = false;
  let dashboardErrorSource = null;

  function escapeHtml(value) {
    const element = document.createElement('span');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function updateClock() {
    const now = new Date();
    document.getElementById('current-time').textContent = new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(now);
    document.getElementById('current-date').textContent = new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
    }).format(now);
  }

  function formatDateTime(value) {
    if (!value) return '未確認';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未確認';
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Tokyo'
    }).format(date);
  }

  function formatTime(value) {
    if (!value) return '未確認';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未確認';
    return new Intl.DateTimeFormat('ja-JP', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo'
    }).format(date);
  }

  async function loadMapLocations() {
    const response = await fetch(MAP_LOCATION_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error(`map-locations: HTTP ${response.status}`);
    const shelters = await response.json();
    if (!Array.isArray(shelters)) throw new Error('map-locations: invalid response');
    mapLocationsById = new Map(shelters.map((shelter) => [shelter.id, {
      latitude: Number(shelter.latitude),
      longitude: Number(shelter.longitude)
    }]));
  }

  function normalizeHqShelter(shelter) {
    return {
      id: shelter.shelterId,
      name: shelter.name,
      status: shelter.status,
      currentCount: shelter.currentCount,
      confirmedCount: shelter.confirmedCount,
      confirmedAt: shelter.confirmedAt,
      confidence: shelter.confidence,
      updatedAt: shelter.updatedAt,
      updatedBy: shelter.updatedBy,
      freshness: shelter.freshness
    };
  }

  function validateHqResponse(response) {
    if (!Array.isArray(response)) throw new Error('HQ API response is not an array');
    return response.map(normalizeHqShelter);
  }

  function renderSummary(shelters) {
    document.getElementById('total-count').textContent = shelters.length;
    document.getElementById('normal-count').textContent = shelters.filter((item) => item.status === 'green').length;
    document.getElementById('warning-count').textContent = shelters.filter((item) => item.status === 'yellow').length;
    document.getElementById('support-count').textContent = shelters.filter((item) => item.status === 'red').length;
    document.getElementById('stale-count').textContent = shelters.filter((item) => item.status === 'gray').length;
    document.getElementById('delay-count').textContent = shelters.filter((item) => item.freshness?.delayed === true).length;
  }

  function getFilteredShelters() {
    return allShelters.filter((shelter) => {
      if (currentFilter === 'normal') return shelter.status === 'green';
      if (currentFilter === 'attention') return shelter.status === 'yellow' || shelter.status === 'red';
      if (currentFilter === 'support') return shelter.status === 'red';
      if (currentFilter === 'stale') return shelter.status === 'gray';
      if (currentFilter === 'delayed') return shelter.freshness?.delayed === true;
      return true;
    });
  }

  function getSortValue(shelter, key) {
    const statusRank = { green: 1, yellow: 2, red: 3, gray: 4 };
    if (key === 'name') return shelter.name;
    if (key === 'evacuees') return Number(shelter.currentCount);
    if (key === 'status') return statusRank[shelter.status] ?? 5;
    if (key === 'updatedAt') return shelter.updatedAt ? new Date(shelter.updatedAt).getTime() : 0;
    if (key === 'officialConfirmedAt') return shelter.confirmedAt ? new Date(shelter.confirmedAt).getTime() : 0;
    if (key === 'confidence') return CONFIDENCE_META[shelter.confidence]?.rank ?? 4;
    return Number.isFinite(shelter.freshness?.elapsedMinutes)
      ? shelter.freshness.elapsedMinutes
      : Number.POSITIVE_INFINITY;
  }

  function sortShelters(shelters) {
    const direction = currentSort.direction === 'asc' ? 1 : -1;
    return [...shelters].sort((left, right) => {
      const leftValue = getSortValue(left, currentSort.key);
      const rightValue = getSortValue(right, currentSort.key);
      const result = typeof leftValue === 'string'
        ? leftValue.localeCompare(rightValue, 'ja')
        : leftValue - rightValue;
      return result * direction;
    });
  }

  function updateSortIndicators() {
    document.querySelectorAll('[data-sort-column]').forEach((header) => {
      const isActive = header.dataset.sortColumn === currentSort.key;
      header.setAttribute('aria-sort', isActive ? (currentSort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      header.querySelector('.sort-mark').textContent = isActive ? (currentSort.direction === 'asc' ? '▲' : '▼') : '';
    });
  }

  function renderTable() {
    const shelters = sortShelters(getFilteredShelters());
    document.getElementById('visible-count').textContent = shelters.length;
    updateSortIndicators();
    if (!shelters.length) {
      document.getElementById('shelter-table-body').innerHTML = '<tr class="empty-table"><td colspan="6">該当する避難所はありません</td></tr>';
      return;
    }

    document.getElementById('shelter-table-body').innerHTML = shelters.map((shelter) => {
      const status = STATUS_META[shelter.status] || STATUS_META.gray;
      const freshness = FRESHNESS_META[shelter.freshness?.level] || FRESHNESS_META.black;
      const confidence = CONFIDENCE_META[shelter.confidence] || CONFIDENCE_META.unconfirmed;
      const confirmationDisplay = shelter.confidence === 'unconfirmed'
        ? '<span class="confirmation-missed"><strong>確認未実施</strong></span>'
        : `<time class="confirmation-time">${escapeHtml(formatTime(shelter.confirmedAt))}</time>`;
      const freshnessLabel = shelter.freshness?.display || '未確認';
      return `
        <tr tabindex="0" role="button" data-shelter-id="${escapeHtml(shelter.id)}" aria-label="${escapeHtml(shelter.name)}の詳細を表示">
          <td class="facility-cell">${escapeHtml(shelter.name)}</td>
          <td><span class="status-badge ${status.className}"><i class="status-dot ${status.className}"></i>${status.label}</span></td>
          <td class="number-cell">${escapeHtml(shelter.currentCount)}人</td>
          <td>${confirmationDisplay}</td>
          <td><span class="freshness-badge ${freshness.className}"><i class="freshness-dot ${freshness.className}"></i>${escapeHtml(freshnessLabel)}</span></td>
          <td><span class="confidence-badge">${confidence.label}</span></td>
        </tr>`;
    }).join('');

    document.querySelectorAll('[data-shelter-id]').forEach((row) => {
      const select = () => selectShelter(row.dataset.shelterId);
      row.addEventListener('click', select);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });
    });
    if (selectedShelterId && shelters.some((item) => item.id === selectedShelterId)) {
      document.querySelector(`[data-shelter-id="${selectedShelterId}"]`)?.classList.add('is-selected');
    } else {
      selectedShelterId = shelters[0].id;
      setSelectedRow(selectedShelterId);
      renderDetailSummary(shelters[0]);
      resetOperationalDetail();
    }
  }

  function initListControls() {
    if (controlsInitialized) return;
    document.querySelectorAll('[data-sort-key]').forEach((button) => {
      button.addEventListener('click', () => {
        const key = button.dataset.sortKey;
        currentSort = currentSort.key === key
          ? { key, direction: currentSort.direction === 'asc' ? 'desc' : 'asc' }
          : { key, direction: 'asc' };
        renderTable();
      });
    });
    document.getElementById('status-filter').addEventListener('change', (event) => {
      currentFilter = event.target.value;
      renderTable();
    });
    controlsInitialized = true;
  }

  function createMarkerIcon(status) {
    const safeStatus = STATUS_META[status] ? status : 'gray';
    return L.divIcon({
      className: '',
      html: `<div class="hq-marker status-${safeStatus}"><span>避</span></div>`,
      iconSize: [28, 28], iconAnchor: [14, 26]
    });
  }

  function showMapError(message) {
    const error = document.getElementById('map-error');
    error.textContent = message;
    error.hidden = false;
  }

  function initMap() {
    if (map || !mapLocationsById.size) return;
    if (typeof L === 'undefined') {
      showMapError('地図を読み込めませんでした。一覧はそのまま利用できます。');
      return;
    }
    try {
      map = L.map('hq-map', { center: MAP_CENTER, zoom: MAP_ZOOM, zoomControl: true });
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      });
      tileLayer.on('tileerror', () => showMapError('地図タイルを取得できません。一覧はそのまま利用できます。'));
      tileLayer.addTo(map);
    } catch {
      map = null;
      showMapError('地図を初期化できませんでした。一覧はそのまま利用できます。');
    }
  }

  function updateMapMarkers() {
    if (!map) return;
    allShelters.forEach((shelter) => {
      const location = mapLocationsById.get(shelter.id);
      if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
      const existingMarker = markersById.get(shelter.id);
      if (existingMarker) {
        existingMarker.setIcon(createMarkerIcon(shelter.status));
        return;
      }
      const marker = L.marker([location.latitude, location.longitude], {
        icon: createMarkerIcon(shelter.status),
        keyboard: true,
        title: shelter.name
      }).addTo(map);
      marker.on('click', () => selectShelter(shelter.id));
      markersById.set(shelter.id, marker);
    });
  }

  function setSelectedRow(shelterId) {
    document.querySelectorAll('[data-shelter-id]').forEach((row) => {
      row.classList.toggle('is-selected', row.dataset.shelterId === shelterId);
    });
  }

  function renderDetailSummary(shelter) {
    const status = STATUS_META[shelter.status] || STATUS_META.gray;
    const confidence = CONFIDENCE_META[shelter.confidence] || CONFIDENCE_META.unconfirmed;
    document.getElementById('detail-title').textContent = shelter.name;
    const statusElement = document.getElementById('detail-status');
    statusElement.className = `status-badge ${status.className}`;
    statusElement.textContent = status.label;
    document.getElementById('detail-evacuees').textContent = `${shelter.currentCount}人`;
    document.getElementById('detail-official-total').textContent = shelter.confirmedCount === null
      ? '未確認'
      : `${shelter.confirmedCount}人`;
    document.getElementById('detail-official-at').textContent = formatDateTime(shelter.confirmedAt);
    document.getElementById('detail-confirmation-status').textContent = shelter.confidence === 'unconfirmed'
      ? '確認未実施'
      : shelter.confidence === 'estimated' ? '確認後に人数増減あり' : '確認済';
    document.getElementById('detail-updated').textContent = formatDateTime(shelter.updatedAt);
    document.getElementById('detail-confidence').textContent = confidence.label;
    document.getElementById('detail-updater').textContent = shelter.updatedBy || '未確認';
  }

  function renderOperationalDetail(detail) {
    const supply = detail.latestSupply;
    const issue = detail.latestIssue;
    const supplyLabel = supply ? (SUPPLY_LABELS[supply.supplyType] || supply.supplyType) : null;
    const issueLabel = issue ? (ISSUE_LABELS[issue.category] || issue.category) : null;
    const severityLabel = issue ? (SEVERITY_LABELS[issue.severity] || issue.severity) : null;

    document.getElementById('detail-supplies').textContent = supply
      ? `${supplyLabel} ${supply.quantity}${supply.unit}`
      : '記録なし';
    document.getElementById('detail-supply-receipts').innerHTML = supply
      ? `<li>${escapeHtml(supplyLabel)} ${escapeHtml(supply.quantity)}${escapeHtml(supply.unit)} <span>${escapeHtml(formatTime(supply.occurredAt))}・${escapeHtml(supply.updatedBy)}</span></li>`
      : '<li>記録なし</li>';
    document.getElementById('detail-facility-issues').innerHTML = issue
      ? `<li class="issue-${escapeHtml(issue.severity)}">${escapeHtml(issueLabel)}・${escapeHtml(severityLabel)} <span>${escapeHtml(formatTime(issue.occurredAt))}・${escapeHtml(issue.updatedBy)}</span></li>`
      : '<li>記録なし</li>';

    const shelter = sheltersById.get(detail.id);
    const contactReasons = issue && (issue.severity === 'caution' || issue.severity === 'urgent')
      ? [`${issueLabel} ${severityLabel}`]
      : shelter?.confidence === 'unconfirmed' ? ['情報更新なし'] : ['現在、連絡推奨なし'];
    document.getElementById('detail-reasons').innerHTML = contactReasons
      .map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
    document.getElementById('detail-history').innerHTML = (detail.history || []).slice(0, 3)
      .map((item) => `<li><time class="history-time">${escapeHtml(formatTime(item.occurredAt))}</time><span class="history-user">${escapeHtml(item.updatedBy)}</span><span>${escapeHtml(EVENT_LABELS[item.eventType] || item.eventType)}</span></li>`).join('')
      || '<li>履歴はありません</li>';
  }

  function resetOperationalDetail() {
    document.getElementById('detail-supplies').textContent = '読込中';
    document.getElementById('detail-supply-receipts').innerHTML = '<li>読込中</li>';
    document.getElementById('detail-facility-issues').innerHTML = '<li>読込中</li>';
    document.getElementById('detail-reasons').innerHTML = '<li>読込中</li>';
    document.getElementById('detail-history').innerHTML = '<li>読込中</li>';
  }

  async function loadSelectedDetail(shelterId) {
    try {
      const detail = await window.ApiClient.apiGet(`/shelters/${encodeURIComponent(shelterId)}`);
      if (selectedShelterId !== shelterId) return;
      renderOperationalDetail(detail);
      clearError('detail');
    } catch (error) {
      if (selectedShelterId !== shelterId) return;
      showError('避難所詳細の更新に失敗しました。一覧と直前の詳細表示を維持しています。', 'detail');
      console.error('HQ detail refresh failed', {
        type: error?.type || 'unknown', status: error?.status || null, code: error?.code || null
      });
    }
  }

  function selectShelter(shelterId) {
    const shelter = sheltersById.get(shelterId);
    if (!shelter) return;
    const selectionChanged = selectedShelterId !== shelterId;
    selectedShelterId = shelterId;
    setSelectedRow(shelterId);
    renderDetailSummary(shelter);
    if (selectionChanged) resetOperationalDetail();
    loadSelectedDetail(shelterId);
    markersById.get(shelterId)?.openPopup?.();
  }

  function showError(message, source = 'list') {
    const error = document.getElementById('dashboard-error');
    error.textContent = message;
    error.hidden = false;
    dashboardErrorSource = source;
  }

  function clearError(source) {
    if (source && dashboardErrorSource !== source) return;
    const error = document.getElementById('dashboard-error');
    error.textContent = '';
    error.hidden = true;
    dashboardErrorSource = null;
  }

  async function refreshDashboard() {
    if (refreshInProgress) return;
    refreshInProgress = true;
    try {
      const response = await window.ApiClient.apiGet(HQ_API_PATH);
      const shelters = validateHqResponse(response);
      allShelters = shelters;
      sheltersById = new Map(shelters.map((item) => [item.id, item]));
      renderSummary(shelters);
      initListControls();
      renderTable();
      initMap();
      updateMapMarkers();
      if (selectedShelterId && sheltersById.has(selectedShelterId)) {
        renderDetailSummary(sheltersById.get(selectedShelterId));
        loadSelectedDetail(selectedShelterId);
      }
      clearError('list');
    } catch (error) {
      showError(allShelters.length
        ? '避難所一覧の更新に失敗しました。直前の表示を維持しています。'
        : '避難所情報を読み込めませんでした。ネットワークとサーバーを確認してください。', 'list');
      console.error('HQ dashboard refresh failed', {
        type: error?.type || 'unknown', status: error?.status || null, code: error?.code || null
      });
    } finally {
      refreshInProgress = false;
    }
  }

  async function start() {
    updateClock();
    window.setInterval(updateClock, CLOCK_INTERVAL_MS);
    try {
      await loadMapLocations();
    } catch {
      showMapError('地図位置情報を読み込めませんでした。一覧はそのまま利用できます。');
    }
    await refreshDashboard();
    window.setInterval(refreshDashboard, POLLING_INTERVAL_MS);
  }

  window.addEventListener('DOMContentLoaded', start);
})();
