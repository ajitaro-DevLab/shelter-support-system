(() => {
  const DATA_PATHS = {
    shelters: 'data/shelters.json',
    supplies: 'data/supplies.json'
  };
  const CONFIDENCE_META = {
    confirmed: { level: '確定', color: 'green' },
    estimated: { level: '推定', color: 'yellow' },
    unconfirmed: { level: '未確認', color: 'gray' }
  };
  let mapInitialized = false;
  let currentDemoContext = null;

  async function loadJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`${path}: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`${path}: 配列形式ではありません`);
    }
    return data;
  }

  function showContextGuidance(message) {
    currentDemoContext = null;
    document.getElementById('shelter-name').textContent = '未設定';
    document.getElementById('home-context-user').textContent = '未設定';
    document.getElementById('home-context-message').textContent = message;
    document.getElementById('home-context-guidance').hidden = false;
  }

  function showConfiguredContext(context, shelter) {
    const user = window.DemoContext.getDemoUsers().find((item) => item.id === context.userId);
    document.getElementById('shelter-name').textContent = shelter.name;
    document.getElementById('home-context-user').textContent = user
      ? `${user.displayName}（${user.id}）`
      : context.userId;
    document.getElementById('home-context-guidance').hidden = true;
  }

  async function resolveDemoContext() {
    const savedState = window.DemoContext.getDemoContextState();
    if (savedState.status !== 'stored') {
      const message = savedState.status === 'invalid'
        ? '端末設定が無効です。Launcherで設定し直してください。'
        : '対象避難所と利用者を設定してください。';
      showContextGuidance(message);
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
      console.error('Homeの端末設定確認に失敗しました。', {
        type: error?.type ?? 'unknown',
        status: error?.status ?? null,
        code: error?.code ?? null,
        requestId: error?.requestId ?? null
      });
      return null;
    }
  }

  async function loadHome(shelterId) {
    try {
      const shelter = await window.ApiClient.apiGet(
        `/shelters/${encodeURIComponent(shelterId)}`
      );
      window.ShelterUi.updateHomeShelter(shelter);
      window.HomeEvents.setShelter(shelter, currentDemoContext.userId);
      window.ShelterUi.clearHomeLoadError();
    } catch (error) {
      window.ShelterUi.showHomeLoadError('データを取得できませんでした');
      console.error('Home APIの取得に失敗しました。', {
        type: error?.type ?? 'unknown',
        status: error?.status ?? null,
        code: error?.code ?? null,
        requestId: error?.requestId ?? null
      });
    }
  }

  function composeMapShelters(locations, apiShelters) {
    const apiById = new Map(apiShelters.map((shelter) => [shelter.shelterId, shelter]));
    return locations.flatMap((location) => {
      const apiShelter = apiById.get(location.id);
      if (!apiShelter) return [];
      return [{
        id: apiShelter.shelterId,
        name: apiShelter.name,
        latitude: location.latitude,
        longitude: location.longitude,
        status: apiShelter.status,
        updatedAt: apiShelter.updatedAt,
        confidence: CONFIDENCE_META[apiShelter.confidence] || CONFIDENCE_META.unconfirmed,
        evacuees: { total: apiShelter.currentCount }
      }];
    });
  }

  async function loadMap() {
    try {
      const [locations, supplies, apiShelters] = await Promise.all([
        loadJson(DATA_PATHS.shelters),
        loadJson(DATA_PATHS.supplies),
        window.ApiClient.apiGet('/hq/shelters')
      ]);
      const shelters = composeMapShelters(locations, apiShelters);
      if (mapInitialized) {
        window.ShelterMap.update(shelters, supplies);
      } else {
        window.ShelterMap.init(shelters, supplies);
        mapInitialized = true;
      }
    } catch (error) {
      console.error('地図データの読み込みに失敗しました。', error);
      const mapError = document.getElementById('map-error');
      mapError.textContent = '避難所地図データを読み込めませんでした。';
      mapError.hidden = false;
    }
  }

  async function start() {
    window.ShelterUi.init();
    window.HomeEvents.init();
    const context = await resolveDemoContext();
    if (!context) {
      await loadMap();
      return;
    }
    await Promise.all([loadHome(context.shelterId), loadMap()]);
  }

  window.HomeApp = {
    reloadHome: () => currentDemoContext
      ? Promise.all([loadHome(currentDemoContext.shelterId), loadMap()])
      : loadMap()
  };

  window.addEventListener('DOMContentLoaded', start);
})();
