// Service worker: keep Chrome's declarativeNetRequest dynamic rules in sync with the
// rules the user has saved in storage. The options page never touches DNR directly —
// it only writes storage; this worker is the single place that compiles + installs rules.

import { toDNRRule } from './src/compile.js';

const RULES_KEY = 'rules';
const ENABLED_KEY = 'enabled'; // global master switch; absent/true = on

async function getState() {
  const d = await chrome.storage.local.get([RULES_KEY, ENABLED_KEY]);
  return {
    rules: Array.isArray(d[RULES_KEY]) ? d[RULES_KEY] : [],
    masterEnabled: d[ENABLED_KEY] !== false,
  };
}

// Rebuild the entire dynamic ruleset from storage. Idempotent: clears existing
// dynamic rules and reinstalls. List order = priority (top of the list wins).
async function syncRules() {
  const { rules, masterEnabled } = await getState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);

  const addRules = [];
  if (masterEnabled) {
    let nextId = 1;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!rule.enabled) continue;
      try {
        addRules.push(toDNRRule(rule, { id: nextId++, priority: rules.length - i }));
      } catch (e) {
        // Invalid rules are surfaced in the editor; here we just skip them loudly.
        console.warn(`Reroute: skipping invalid rule "${rule?.name ?? ''}": ${e.message}`);
      }
    }
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[RULES_KEY] || changes[ENABLED_KEY])) syncRules();
});
