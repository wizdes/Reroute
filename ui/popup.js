import { getState, setEnabled } from './store.js';

const s = await getState();
const master = document.getElementById('master');
const label = document.getElementById('master-label');
const status = document.getElementById('status');
const enabledCount = s.rules.filter((r) => r.enabled).length;

function paint(on) {
  label.textContent = on ? 'On' : 'Off';
  status.textContent = on
    ? `${enabledCount} active rule${enabledCount === 1 ? '' : 's'}`
    : 'All redirects paused';
}

master.checked = s.enabled;
paint(s.enabled);
master.addEventListener('change', () => {
  setEnabled(master.checked);
  paint(master.checked);
});

document.getElementById('edit').addEventListener('click', () => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
});
