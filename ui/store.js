// Storage adapter. Inside the extension it uses chrome.storage.local (which the
// background worker watches to rebuild the real redirect rules). Outside the extension
// (a plain browser tab — used for dogfooding and the UI screenshot test) it falls back
// to localStorage, so the entire editor/debugger UX runs without the extension.

const RULES_KEY = 'rules';
const ENABLED_KEY = 'enabled';

export const isExtension =
  typeof chrome !== 'undefined' && !!chrome?.storage?.local;

const mockListeners = [];
function notifyMock() {
  for (const cb of mockListeners) cb();
}

function mockGet() {
  let rules = [];
  let enabled = true;
  try {
    rules = JSON.parse(localStorage.getItem(RULES_KEY) || '[]');
  } catch {}
  if ((!Array.isArray(rules) || !rules.length) && Array.isArray(globalThis.__REROUTE_SEED__)) {
    rules = globalThis.__REROUTE_SEED__;
  }
  const e = (() => {
    try { return localStorage.getItem(ENABLED_KEY); } catch { return null; }
  })();
  enabled = e === null ? true : e === 'true';
  return { rules: Array.isArray(rules) ? rules : [], enabled };
}

export async function getState() {
  if (isExtension) {
    const d = await chrome.storage.local.get([RULES_KEY, ENABLED_KEY]);
    return {
      rules: Array.isArray(d[RULES_KEY]) ? d[RULES_KEY] : [],
      enabled: d[ENABLED_KEY] !== false,
    };
  }
  return mockGet();
}

export async function saveRules(rules) {
  if (isExtension) return chrome.storage.local.set({ [RULES_KEY]: rules });
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  notifyMock();
}

export async function setEnabled(enabled) {
  if (isExtension) return chrome.storage.local.set({ [ENABLED_KEY]: enabled });
  localStorage.setItem(ENABLED_KEY, String(enabled));
  notifyMock();
}

// Notify when another extension context (e.g. the popup) changes storage.
export function onExternalChange(cb) {
  if (isExtension) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local') cb();
    });
  } else {
    mockListeners.push(cb);
  }
}
