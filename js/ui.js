(() => {
  const CLOCK_INTERVAL_MS = 1000;
  const HOME_STATUS_DETAILS = {
    water: { title: '水', rate: '82%', stock: '飲料水 410L', updated: '11:35', confidence: '確定' },
    food: { title: '食料', rate: '76%', stock: '食事 186食', updated: '11:32', confidence: '確定' },
    hygiene: { title: '衛生', rate: '54%', stock: '衛生セット 68組', updated: '11:20', confidence: '推定' },
    medical: { title: '医療', rate: '88%', stock: '救急セット 12箱', updated: '11:28', confidence: '確定' }
  };
  const STATUS_LABELS = {
    green: '正常', yellow: '注意', red: '要支援', gray: '未更新'
  };
  const CONFIDENCE_LABELS = {
    confirmed: '確定', estimated: '推定', unconfirmed: '未確認'
  };
  const SUPPLY_LABELS = {
    water: '水', food: '食料', blanket: '毛布', hygiene: '衛生用品', portable_toilet: '簡易トイレ'
  };
  const ISSUE_LABELS = {
    toilet: 'トイレ', hygiene: '衛生', power: '電力', water: '水',
    air_conditioning: '空調', building: '建物', other: 'その他'
  };
  const EVENT_LABELS = {
    visitor_change: '避難者数更新', confirmation: '避難者数定時確認',
    supply_received: '物資受領', issue_update: '避難所不具合', notice_update: 'お知らせ更新'
  };

  function formatDateTime(value, emptyText = '未確認') {
    if (!value) return emptyText;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return emptyText;
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
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

  function switchView(viewName) {
    document.querySelectorAll('.view-tab').forEach((tab) => {
      const isActive = tab.dataset.view === viewName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-pressed', String(isActive));
    });

    document.querySelectorAll('.view').forEach((view) => {
      const isActive = view.id === `${viewName}-view`;
      view.classList.toggle('is-active', isActive);
      view.hidden = !isActive;
    });

    if (viewName === 'map') {
      window.dispatchEvent(new CustomEvent('shelter-map:shown'));
    }
  }

  function showDeferredFeatureMessage(label) {
    const message = document.getElementById('prototype-message');
    message.textContent = `「${label}」の入力機能は次フェーズで実装します。初期版では画面構成のみ確認できます。`;
    message.hidden = false;
  }

  function openStatusDialog(statusKey) {
    const detail = HOME_STATUS_DETAILS[statusKey];
    const dialog = document.getElementById('status-dialog');
    if (!detail || !dialog) return;

    document.getElementById('status-dialog-title').textContent = detail.title;
    document.getElementById('detail-rate').textContent = detail.rate;
    document.getElementById('detail-stock').textContent = detail.stock;
    document.getElementById('detail-updated').textContent = detail.updated;
    document.getElementById('detail-confidence').textContent = detail.confidence;
    dialog.hidden = false;
    dialog.querySelector('.dialog-close').focus();
  }

  function updateHomeShelter(shelter) {
    if (!shelter) return;
    const supply = shelter.latestSupply;
    const issue = shelter.latestIssue;
    const statusSection = document.querySelector('.shelter-status');
    document.getElementById('shelter-name').textContent = shelter.name;
    document.getElementById('home-evacuees').textContent = `${shelter.currentCount}名`;
    document.getElementById('home-confirmed-count').textContent = shelter.confirmedCount === null
      ? '未確認' : `${shelter.confirmedCount}名`;
    document.getElementById('home-confirmed-at').textContent = formatDateTime(shelter.confirmedAt);
    document.getElementById('home-confirmation-slot').textContent = shelter.confirmationSlot ?? '未確認';
    document.getElementById('home-status').textContent = STATUS_LABELS[shelter.status] ?? shelter.status;
    document.getElementById('home-confidence').textContent =
      CONFIDENCE_LABELS[shelter.confidence] ?? shelter.confidence;
    document.getElementById('home-updated-at').textContent = formatDateTime(shelter.updatedAt);
    document.getElementById('home-last-updater').textContent = shelter.updatedBy;
    statusSection.dataset.status = shelter.status;
    statusSection.dataset.confidence = shelter.confidence;
    document.getElementById('home-latest-supply').textContent = supply
      ? `${SUPPLY_LABELS[supply.supplyType] ?? supply.supplyType} ${supply.quantity}${supply.unit}（${formatDateTime(supply.occurredAt)}）`
      : '記録なし';
    document.getElementById('home-latest-issue').textContent = issue
      ? `${ISSUE_LABELS[issue.category] ?? issue.category}・${issue.severity}（${formatDateTime(issue.occurredAt)}）`
      : '記録なし';

    const historyList = document.getElementById('home-history');
    historyList.replaceChildren();
    if (shelter.history.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = '記録なし';
      historyList.append(emptyItem);
    } else {
      shelter.history.forEach((event) => {
        const item = document.createElement('li');
        item.textContent = `${formatDateTime(event.occurredAt)} ${EVENT_LABELS[event.eventType] ?? event.eventType} ${event.updatedBy}`;
        historyList.append(item);
      });
    }
  }

  function showHomeLoadError(message) {
    const loadStatus = document.getElementById('home-load-status');
    loadStatus.textContent = message;
    loadStatus.hidden = false;
  }

  function clearHomeLoadError() {
    const loadStatus = document.getElementById('home-load-status');
    loadStatus.textContent = '';
    loadStatus.hidden = true;
  }

  function initUi() {
    updateClock();
    window.setInterval(updateClock, CLOCK_INTERVAL_MS);

    document.querySelectorAll('.view-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.view));
    });
    document.querySelectorAll('[data-action-label]').forEach((button) => {
      button.addEventListener('click', () => showDeferredFeatureMessage(button.dataset.actionLabel));
    });
    document.querySelectorAll('[data-status-key]').forEach((button) => {
      button.addEventListener('click', () => openStatusDialog(button.dataset.statusKey));
    });

    const statusDialog = document.getElementById('status-dialog');
    const closeStatusDialog = () => { statusDialog.hidden = true; };
    statusDialog.querySelector('.dialog-close').addEventListener('click', closeStatusDialog);
    statusDialog.addEventListener('click', (event) => {
      if (event.target === statusDialog) closeStatusDialog();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !statusDialog.hidden) closeStatusDialog();
    });
  }

  window.ShelterUi = {
    init: initUi,
    switchView,
    updateHomeShelter,
    showHomeLoadError,
    clearHomeLoadError
  };
})();
