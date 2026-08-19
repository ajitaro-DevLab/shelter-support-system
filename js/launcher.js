(function initializeLauncher(globalScope) {
  'use strict';

  const SHELTERS_API_PATH = '/shelters';

  function createLauncher({ windowScope, documentScope, apiClient, demoContext }) {
    let shelters = [];

    function element(id) {
      return documentScope.getElementById(id);
    }

    function setError(message = '') {
      const errorElement = element('demo-context-error');
      errorElement.textContent = message;
      errorElement.hidden = message === '';
    }

    function setState(message) {
      element('demo-context-state').textContent = message;
    }

    function findUser(userId) {
      return demoContext.getDemoUsers().find((user) => user.id === userId);
    }

    function renderCurrentSettings(context, shelterName) {
      if (!context) {
        element('current-shelter').textContent = '未設定';
        element('current-user').textContent = '未設定';
        return;
      }

      const user = findUser(context.userId);
      element('current-shelter').textContent = shelterName || context.shelterId;
      element('current-user').textContent = user
        ? `${user.displayName}（${user.id}）`
        : context.userId;
    }

    function appendOption(select, value, label) {
      const option = documentScope.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    }

    function populateSelects() {
      const shelterSelect = element('shelter-select');
      const userSelect = element('user-select');
      shelterSelect.replaceChildren();
      userSelect.replaceChildren();
      appendOption(shelterSelect, '', '避難所を選択してください');
      appendOption(userSelect, '', '利用者を選択してください');
      shelters.forEach((shelter) => appendOption(shelterSelect, shelter.id, shelter.name));
      demoContext.getDemoUsers().forEach((user) => {
        appendOption(userSelect, user.id, `${user.displayName}（${user.id}）`);
      });
      shelterSelect.disabled = false;
      userSelect.disabled = false;
      element('demo-context-save').disabled = false;
    }

    function restoreSavedSettings() {
      const savedState = demoContext.getDemoContextState();
      if (savedState.status === 'missing') {
        renderCurrentSettings(null);
        setState('未設定');
        element('demo-context-guidance').textContent = '対象避難所と利用者を設定してください。';
        return;
      }
      if (savedState.status === 'invalid'
        || !demoContext.isDemoContextConfigured(savedState.context, shelters)) {
        renderCurrentSettings(null);
        setState('設定が無効');
        element('demo-context-guidance').textContent = '保存済み設定が無効です。対象避難所と利用者を設定し直してください。';
        return;
      }

      const context = savedState.context;
      const shelter = shelters.find((item) => item.id === context.shelterId);
      element('shelter-select').value = context.shelterId;
      element('user-select').value = context.userId;
      renderCurrentSettings(context, shelter.name);
      setState('設定済み');
      element('demo-context-guidance').textContent = 'この設定は同じブラウザー内で保持されます。';
    }

    function showSavedSettingsWhileUnavailable() {
      const savedState = demoContext.getDemoContextState();
      if (savedState.status === 'stored') {
        renderCurrentSettings(savedState.context);
        setState('保存済み・未照合');
        element('demo-context-guidance').textContent = '保存済み設定を表示しています。API復旧後に変更できます。';
      } else if (savedState.status === 'invalid') {
        renderCurrentSettings(null);
        setState('設定が無効');
        element('demo-context-guidance').textContent = '保存済み設定が無効です。API復旧後に設定し直してください。';
      } else {
        renderCurrentSettings(null);
        setState('未設定');
        element('demo-context-guidance').textContent = 'API復旧後に対象避難所と利用者を設定してください。';
      }
    }

    async function loadSettings() {
      try {
        const response = await apiClient.apiGet(SHELTERS_API_PATH);
        if (!Array.isArray(response)) throw new TypeError('避難所一覧の形式が不正です。');
        shelters = response;
        populateSelects();
        restoreSavedSettings();
      } catch (error) {
        shelters = [];
        showSavedSettingsWhileUnavailable();
        setError('避難所一覧を取得できませんでした。通信状態を確認してください。');
        console.error('Launcherの避難所一覧取得に失敗しました。', error);
      }
    }

    function saveSettings(event) {
      event.preventDefault();
      setError();
      const context = {
        shelterId: element('shelter-select').value,
        userId: element('user-select').value
      };

      try {
        const saved = demoContext.saveDemoContext(context, shelters);
        const shelter = shelters.find((item) => item.id === saved.shelterId);
        renderCurrentSettings(saved, shelter.name);
        setState('設定済み');
        element('demo-context-guidance').textContent = '設定を保存しました。この設定は同じブラウザー内で保持されます。';
      } catch (error) {
        const savedState = demoContext.getDemoContextState();
        const hasValidSavedContext = savedState.status === 'stored'
          && demoContext.isDemoContextConfigured(savedState.context, shelters);
        setState(hasValidSavedContext ? '設定済み' : '未設定');
        setError(error.message || '有効な避難所と利用者を選択してください。');
      }
    }

    function openApplication(button) {
      windowScope.open(button.dataset.launchUrl, button.dataset.windowName);
    }

    async function start() {
      documentScope.querySelectorAll('[data-launch-url]').forEach((button) => {
        button.addEventListener('click', () => openApplication(button));
      });
      element('demo-context-form').addEventListener('submit', saveSettings);
      await loadSettings();
    }

    return { start, loadSettings };
  }

  const launcherModule = { createLauncher };
  globalScope.LauncherModule = launcherModule;

  if (globalScope.document && globalScope.ApiClient && globalScope.DemoContext) {
    const launcher = createLauncher({
      windowScope: globalScope,
      documentScope: globalScope.document,
      apiClient: globalScope.ApiClient,
      demoContext: globalScope.DemoContext
    });
    globalScope.addEventListener('DOMContentLoaded', launcher.start);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = launcherModule;
  }
}(typeof window !== 'undefined' ? window : globalThis));
