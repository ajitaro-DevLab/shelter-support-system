(() => {
  const EVENT_TITLES = {
    visitor: '避難者来所',
    supply: '物資受領',
    issue: '避難所不具合',
    confirmation: '避難者数定時確認'
  };

  let currentShelter = null;
  let currentUserId = null;
  let currentEvent = null;
  let visitorDelta = 1;
  let confirmationMode = 'unchanged';
  let confirmationValue = 0;

  function element(id) {
    return document.getElementById(id);
  }

  function showMessage(message, isError = false) {
    const status = element('prototype-message');
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.hidden = false;
  }

  function showValidation(message) {
    element('home-event-validation').textContent = message;
  }

  function setSelected(selector, value, datasetKey) {
    document.querySelectorAll(selector).forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset[datasetKey]) === value);
    });
  }

  function getNextCount() {
    if (!currentShelter) return null;
    if (currentEvent === 'visitor') return currentShelter.currentCount + visitorDelta;
    if (currentEvent !== 'confirmation') return null;
    if (confirmationMode === 'correction') return confirmationValue;
    if (confirmationMode === 'delta') return currentShelter.currentCount + confirmationValue;
    return currentShelter.currentCount;
  }

  function updatePreview() {
    const nextCount = getNextCount();
    let validation = '';
    if ((currentEvent === 'visitor' || currentEvent === 'confirmation') && !Number.isInteger(nextCount)) {
      validation = '整数で入力してください';
    } else if (currentEvent === 'visitor' && visitorDelta === 0) {
      validation = '0以外の人数を指定してください';
    } else if (nextCount !== null && nextCount < 0) {
      validation = '避難者数を0人未満にはできません';
    }
    element('home-event-next-count').textContent = nextCount === null || validation ? '--' : `${nextCount}名`;
    showValidation(validation);
    return validation === '';
  }

  function selectVisitorDelta(delta) {
    visitorDelta = delta;
    element('home-visitor-direct').value = '';
    setSelected('[data-visitor-delta]', delta, 'visitorDelta');
    updatePreview();
  }

  function selectConfirmation(mode, value = 0) {
    confirmationMode = mode;
    confirmationValue = value;
    element('home-confirmation-unchanged').classList.toggle('is-selected', mode === 'unchanged');
    setSelected('[data-confirmation-delta]', mode === 'delta' ? value : Number.NaN, 'confirmationDelta');
    if (mode !== 'correction') element('home-confirmation-direct').value = '';
    updatePreview();
  }

  function resetForm(type) {
    showValidation('');
    element('home-supply-type').value = '';
    element('home-supply-quantity').value = '';
    element('home-supply-unit').value = '';
    element('home-issue-category').value = '';
    element('home-issue-severity').value = '';
    if (type === 'visitor') selectVisitorDelta(1);
    if (type === 'confirmation') selectConfirmation('unchanged');
  }

  function openDialog(type) {
    if (!currentShelter) {
      showMessage('データ取得後にもう一度操作してください', true);
      return;
    }
    currentEvent = type;
    element('home-event-title').textContent = EVENT_TITLES[type];
    element('home-event-current-count').textContent = `${currentShelter.currentCount}名`;
    element('home-event-confirmation-slot').textContent =
      window.ConfirmationSchedule.getConfirmationSchedule().currentSlotLabel;
    document.querySelectorAll('[data-home-event-form]').forEach((form) => {
      form.hidden = form.dataset.homeEventForm !== type;
    });
    element('home-event-next-count').parentElement.hidden = !['visitor', 'confirmation'].includes(type);
    resetForm(type);
    element('home-event-dialog').hidden = false;
    element('home-event-submit').focus();
  }

  function closeDialog() {
    element('home-event-dialog').hidden = true;
    currentEvent = null;
  }

  function setSubmitting(isSubmitting) {
    const submit = element('home-event-submit');
    submit.disabled = isSubmitting;
    submit.textContent = isSubmitting ? '保存中…' : '保存';
  }

  function buildRequest() {
    if (!currentUserId) throw new Error('利用者設定を確認してください');
    const occurredAt = new Date().toISOString();
    if (currentEvent === 'visitor') {
      if (!updatePreview()) throw new Error(element('home-event-validation').textContent);
      return {
        path: `/shelters/${encodeURIComponent(currentShelter.id)}/events/visitor-change`,
        body: { delta: visitorDelta, occurredAt, updatedBy: currentUserId },
        success: '避難者数を更新しました'
      };
    }
    if (currentEvent === 'confirmation') {
      if (!updatePreview()) throw new Error(element('home-event-validation').textContent);
      return {
        path: `/shelters/${encodeURIComponent(currentShelter.id)}/confirmations`,
        body: {
          mode: confirmationMode,
          confirmedCount: getNextCount(),
          confirmationSlot: window.ConfirmationSchedule
            .getConfirmationSchedule(new Date(occurredAt)).currentSlot,
          occurredAt,
          updatedBy: currentUserId
        },
        success: '定時確認を記録しました'
      };
    }
    if (currentEvent === 'supply') {
      const quantity = Number(element('home-supply-quantity').value);
      if (!element('home-supply-type').value || !Number.isInteger(quantity) || quantity < 1 || !element('home-supply-unit').value) {
        throw new Error('物資種別・1以上の整数・単位を入力してください');
      }
      return {
        path: `/shelters/${encodeURIComponent(currentShelter.id)}/supplies`,
        body: {
          supplyType: element('home-supply-type').value,
          quantity,
          unit: element('home-supply-unit').value,
          occurredAt,
          updatedBy: currentUserId
        },
        success: '物資受領を記録しました'
      };
    }
    if (currentEvent === 'issue') {
      if (!element('home-issue-category').value || !element('home-issue-severity').value) {
        throw new Error('カテゴリと状態を選択してください');
      }
      return {
        path: `/shelters/${encodeURIComponent(currentShelter.id)}/issues`,
        body: {
          category: element('home-issue-category').value,
          severity: element('home-issue-severity').value,
          occurredAt,
          updatedBy: currentUserId
        },
        success: '避難所不具合を記録しました'
      };
    }
    throw new Error('イベントを選択してください');
  }

  async function submitEvent() {
    let request;
    try {
      request = buildRequest();
    } catch (error) {
      showValidation(error.message);
      return;
    }

    setSubmitting(true);
    showValidation('');
    try {
      await window.ApiClient.apiPost(request.path, request.body);
      closeDialog();
      showMessage(request.success);
      await window.HomeApp.reloadHome();
    } catch (error) {
      showValidation('保存されていません。通信状態を確認して、もう一度保存してください。');
      console.error('Homeイベントの保存に失敗しました。', {
        type: error?.type ?? 'unknown',
        status: error?.status ?? null,
        code: error?.code ?? null,
        requestId: error?.requestId ?? null
      });
    } finally {
      setSubmitting(false);
    }
  }

  function init() {
    document.querySelectorAll('[data-home-event]').forEach((button) => {
      button.addEventListener('click', () => openDialog(button.dataset.homeEvent));
    });
    document.querySelectorAll('[data-visitor-delta]').forEach((button) => {
      button.addEventListener('click', () => selectVisitorDelta(Number(button.dataset.visitorDelta)));
    });
    document.querySelectorAll('[data-confirmation-delta]').forEach((button) => {
      button.addEventListener('click', () => selectConfirmation('delta', Number(button.dataset.confirmationDelta)));
    });
    element('home-confirmation-unchanged').addEventListener('click', () => selectConfirmation('unchanged'));
    element('home-visitor-direct').addEventListener('input', (event) => {
      visitorDelta = event.target.value === '' ? Number.NaN : Number(event.target.value);
      setSelected('[data-visitor-delta]', Number.NaN, 'visitorDelta');
      updatePreview();
    });
    element('home-confirmation-direct').addEventListener('input', (event) => {
      selectConfirmation('correction', event.target.value === '' ? Number.NaN : Number(event.target.value));
    });
    element('home-event-submit').addEventListener('click', submitEvent);
    element('home-event-close').addEventListener('click', closeDialog);
    element('home-event-cancel').addEventListener('click', closeDialog);
    element('home-event-dialog').addEventListener('click', (event) => {
      if (event.target === element('home-event-dialog')) closeDialog();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !element('home-event-dialog').hidden) closeDialog();
    });
  }

  function setShelter(shelter, userId) {
    currentShelter = shelter;
    currentUserId = typeof userId === 'string' && userId !== '' ? userId : null;
    element('home-event-shelter-name').textContent = shelter?.name || '未設定';
    element('home-event-updater').textContent = currentUserId || '未設定';
  }

  window.HomeEvents = { init, setShelter };
})();
