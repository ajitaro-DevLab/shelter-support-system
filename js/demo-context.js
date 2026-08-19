(function initializeDemoContext(globalScope) {
  'use strict';

  const STORAGE_KEY = 'shelter-demo-context-v1';
  const ALLOWED_CONTEXT_KEYS = new Set(['shelterId', 'userId']);
  const DEMO_USERS = Object.freeze([
    Object.freeze({ id: 'demo-user-01', displayName: '実証利用者01' }),
    Object.freeze({ id: 'demo-hq-01', displayName: '実証本部01' })
  ]);

  function getStorage(storage) {
    return storage || globalScope.localStorage;
  }

  function isAllowedUserId(userId) {
    return DEMO_USERS.some((user) => user.id === userId);
  }

  function hasRequiredValues(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (typeof value.shelterId !== 'string' || value.shelterId.trim() === '') return false;
    return isAllowedUserId(value.userId);
  }

  function hasValidStoredShape(value) {
    return hasRequiredValues(value)
      && Object.keys(value).every((key) => ALLOWED_CONTEXT_KEYS.has(key));
  }

  function getDemoContextState(storage) {
    const storedValue = getStorage(storage).getItem(STORAGE_KEY);
    if (storedValue === null) return { status: 'missing', context: null };

    try {
      const parsed = JSON.parse(storedValue);
      return hasValidStoredShape(parsed)
        ? { status: 'stored', context: { shelterId: parsed.shelterId, userId: parsed.userId } }
        : { status: 'invalid', context: null };
    } catch {
      return { status: 'invalid', context: null };
    }
  }

  function getDemoContext(storage) {
    return getDemoContextState(storage).context;
  }

  function isDemoContextConfigured(context, shelters) {
    if (!hasRequiredValues(context) || !Array.isArray(shelters)) return false;
    return shelters.some((shelter) => shelter?.id === context.shelterId);
  }

  function saveDemoContext(context, shelters, storage) {
    if (!isDemoContextConfigured(context, shelters)) {
      throw new TypeError('有効な避難所と利用者を選択してください。');
    }

    const storedContext = {
      shelterId: context.shelterId,
      userId: context.userId
    };
    getStorage(storage).setItem(STORAGE_KEY, JSON.stringify(storedContext));
    return storedContext;
  }

  function clearDemoContext(storage) {
    getStorage(storage).removeItem(STORAGE_KEY);
  }

  function getDemoUsers() {
    return DEMO_USERS.map((user) => ({ ...user }));
  }

  const demoContext = {
    STORAGE_KEY,
    getDemoContext,
    getDemoContextState,
    saveDemoContext,
    clearDemoContext,
    isDemoContextConfigured,
    getDemoUsers
  };

  globalScope.DemoContext = demoContext;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = demoContext;
  }
}(typeof window !== 'undefined' ? window : globalThis));
