import { getState, saveRules, setEnabled, onExternalChange } from './store.js';
import { validateRule, debugUrl } from '../src/compile.js';

const state = { rules: [], enabled: true, selectedId: null };
let saveTimer = null;

// ---------- tiny DOM helper ----------
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}
const uid = () => 'r' + Math.random().toString(36).slice(2, 9);

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveRules(state.rules), 250);
}
function selected() {
  return state.rules.find((r) => r.id === state.selectedId) || null;
}

// ---------- rule list ----------
function renderList() {
  const list = document.getElementById('rule-list');
  list.innerHTML = '';
  if (!state.rules.length) {
    list.append(el('li', { class: 'list-empty' }, 'No rules yet. Click “+ New rule”.'));
    return;
  }
  state.rules.forEach((rule, i) => {
    const item = el(
      'li',
      {
        class: 'rule-item' + (rule.id === state.selectedId ? ' selected' : '') + (rule.enabled ? '' : ' disabled'),
        draggable: 'true',
        'data-id': rule.id,
        onclick: (e) => {
          if (e.target.closest('input')) return;
          state.selectedId = rule.id;
          renderList();
          renderEditor();
        },
      },
      el('span', { class: 'grip', title: 'Drag to reorder (top wins)' }, '⠿'),
      el('input', {
        type: 'checkbox',
        ...(rule.enabled ? { checked: true } : {}),
        title: 'Enable / disable this rule',
        onchange: (e) => { rule.enabled = e.target.checked; renderList(); scheduleSave(); },
      }),
      el(
        'span',
        { class: 'mini' },
        el('span', { class: 'rule-name' }, rule.name || 'Untitled rule'),
        el('span', { class: 'rule-from' }, rule.from || '—')
      )
    );
    wireDrag(item, i);
    list.append(item);
  });
}

let dragIndex = null;
function wireDrag(item, index) {
  item.addEventListener('dragstart', () => { dragIndex = index; item.classList.add('dragging'); });
  item.addEventListener('dragend', () => { dragIndex = null; item.classList.remove('dragging'); });
  item.addEventListener('dragover', (e) => e.preventDefault());
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    if (dragIndex == null || dragIndex === index) return;
    const [moved] = state.rules.splice(dragIndex, 1);
    state.rules.splice(index, 0, moved);
    renderList();
    scheduleSave();
  });
}

// ---------- editor ----------
function renderEditor() {
  const host = document.getElementById('rule-editor');
  const rule = selected();
  host.innerHTML = '';
  if (!rule) {
    host.append(
      el('div', { class: 'card editor-empty' },
        el('p', {}, 'Select a rule to edit it, or add one with “+ New rule”.'))
    );
    return;
  }

  if (!Array.isArray(rule.resourceTypes) || !rule.resourceTypes.length) rule.resourceTypes = ['main_frame'];

  const errorsEl = el('div', { class: 'errors' });
  const fromInput = el('input', { type: 'text', class: 'mono', value: rule.from, placeholder: 'https://old.example.com/*', spellcheck: 'false' });
  const toInput = el('input', { type: 'text', class: 'mono', value: rule.to, placeholder: 'https://new.example.com/$1', spellcheck: 'false' });
  const nameInput = el('input', { type: 'text', value: rule.name, placeholder: 'Rule name' });

  nameInput.addEventListener('input', () => {
    rule.name = nameInput.value;
    const li = document.querySelector(`.rule-item[data-id="${rule.id}"] .rule-name`);
    if (li) li.textContent = rule.name || 'Untitled rule';
    scheduleSave();
  });
  const onPattern = () => {
    rule.from = fromInput.value;
    rule.to = toInput.value;
    const li = document.querySelector(`.rule-item[data-id="${rule.id}"] .rule-from`);
    if (li) li.textContent = rule.from || '—';
    errorsEl.textContent = validateRule(rule).join(' ');
    scheduleSave();
  };
  fromInput.addEventListener('input', onPattern);
  toInput.addEventListener('input', onPattern);

  // applies-to (lives under the Advanced toggle)
  const types = new Set(rule.resourceTypes);
  const typeBox = (value, label) =>
    el('label', {},
      el('input', {
        type: 'checkbox', ...(types.has(value) ? { checked: true } : {}),
        onchange: (e) => {
          if (e.target.checked) types.add(value); else types.delete(value);
          if (!types.size) { types.add('main_frame'); e.target.closest('.applies').querySelector('input').checked = true; }
          rule.resourceTypes = [...types];
          scheduleSave();
        },
      }),
      label);

  const appliesBody = el('div', { class: 'field advanced-body' },
    el('label', {}, 'Applies to'),
    el('div', { class: 'applies' }, typeBox('main_frame', 'Page'), typeBox('sub_frame', 'Iframe')));

  // collapsed by default, but open if the rule already uses a non-default resource type
  const startOpen = !(rule.resourceTypes.length === 1 && rule.resourceTypes[0] === 'main_frame');
  appliesBody.hidden = !startOpen;
  const advToggle = el('button', {
    class: 'advanced-toggle', type: 'button', 'aria-expanded': String(startOpen),
    onclick: () => {
      const show = appliesBody.hidden;
      appliesBody.hidden = !show;
      advToggle.setAttribute('aria-expanded', String(show));
      advToggle.textContent = (show ? '▾' : '▸') + ' Advanced';
    },
  }, (startOpen ? '▾' : '▸') + ' Advanced');

  host.append(
    // the rule editor panel — this is what the selected list row connects to
    el('div', { class: 'card rule-panel' },
      el('div', { class: 'field' }, el('label', {}, 'Name'), nameInput),
      el('div', { class: 'field' },
        el('label', {}, 'From — the URL to match'), fromInput,
        el('div', { class: 'hint' }, 'Use ', el('code', {}, '*'), ' to match any run of characters; the whole URL must match.')),
      el('div', { class: 'field' },
        el('label', {}, 'To — where to send it'), toInput,
        el('div', { class: 'hint' }, 'Reference each ', el('code', {}, '*'), ' as ', el('code', {}, '$1'), ', ', el('code', {}, '$2'), ' …'),
        errorsEl),
      el('div', { class: 'advanced' }, advToggle, appliesBody)),
    // delete, centered at the bottom
    el('div', { class: 'editor-delete' },
      el('button', { class: 'btn danger', title: 'Delete this rule', onclick: () => deleteRule(rule) }, 'Delete rule'))
  );

  errorsEl.textContent = validateRule(rule).join(' ');
}

// ---------- reverse debugger ----------
function buildDebugger() {
  const input = el('input', { type: 'text', placeholder: 'https://…  — see which rule fires, or why none does', spellcheck: 'false' });
  const out = el('div', {});
  const run = () => {
    const url = input.value.trim();
    out.innerHTML = '';
    if (!url) return;
    const { winner, reasons } = debugUrl(state.rules, url, state.enabled);
    out.append(
      winner
        ? el('div', { class: 'debug-winner' }, `→ ${winner.resultUrl}`)
        : el('div', { class: 'debug-winner none' }, 'No rule redirects this URL.')
    );
    if (reasons.length) {
      const ul = el('ul', { class: 'debug-reasons' });
      reasons.forEach((rs) => {
        ul.append(el('li', {},
          el('span', { class: 'pill ' + rs.status }, rs.status === 'no-match' ? 'no match' : rs.status),
          el('span', { class: 'r-name' }, rs.rule.name || 'Untitled'),
          el('span', { class: 'r-detail' }, rs.status === 'match' ? `→ ${rs.resultUrl}` : (rs.detail || ''))));
      });
      out.append(ul);
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  return el('div', { class: 'card', id: 'debugger' },
    el('h2', {}, 'Debug any URL'),
    el('div', { class: 'debug-input-line' }, input, el('button', { class: 'btn', onclick: run }, 'Check')),
    out);
}

// ---------- actions ----------
// "New rule N" with the smallest N not already taken by an existing rule name.
function nextRuleName() {
  const taken = new Set(state.rules.map((r) => r.name));
  let n = 1;
  while (taken.has(`New rule ${n}`)) n++;
  return `New rule ${n}`;
}
function newRule() {
  const rule = { id: uid(), name: nextRuleName(), enabled: true, from: '', to: '', resourceTypes: ['main_frame'] };
  state.rules.push(rule);
  state.selectedId = rule.id;
  renderList();
  renderEditor();
  document.querySelector('.rule-item.selected')?.scrollIntoView({ block: 'nearest' });
  document.querySelector('#rule-editor input.mono')?.focus();
  scheduleSave();
}
function deleteRule(rule) {
  const i = state.rules.findIndex((r) => r.id === rule.id);
  state.rules.splice(i, 1);
  state.selectedId = state.rules[Math.max(0, i - 1)]?.id ?? null;
  renderList();
  renderEditor();
  scheduleSave();
}

function exportRules() {
  const blob = new Blob([JSON.stringify({ version: 1, rules: state.rules }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'reroute-rules.json' });
  document.body.append(a); a.click(); a.remove();
  toast('Exported ' + state.rules.length + ' rule' + (state.rules.length === 1 ? '' : 's'));
}
function importRules(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const incoming = Array.isArray(data) ? data : data.rules;
      if (!Array.isArray(incoming)) throw new Error('no rules array');
      state.rules = incoming.map((r) => ({
        id: r.id || uid(),
        name: r.name || 'Imported rule',
        enabled: r.enabled !== false,
        from: r.from || '',
        to: r.to || '',
        resourceTypes: Array.isArray(r.resourceTypes) && r.resourceTypes.length ? r.resourceTypes : ['main_frame'],
      }));
      state.selectedId = state.rules[0]?.id ?? null;
      renderList(); renderEditor(); saveRules(state.rules);
      toast('Imported ' + state.rules.length + ' rule' + (state.rules.length === 1 ? '' : 's'));
    } catch (e) {
      toast('Import failed: ' + e.message);
    }
  };
  reader.readAsText(file);
}

let toastTimer = null;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- init ----------
async function init() {
  const s = await getState();
  state.rules = s.rules.map((r) => ({ resourceTypes: ['main_frame'], ...r, enabled: r.enabled !== false }));
  state.enabled = s.enabled;
  state.selectedId = state.rules[0]?.id ?? null;

  const editorHost = document.getElementById('editor');
  editorHost.innerHTML = '';
  editorHost.append(el('div', { id: 'rule-editor' }), buildDebugger());

  const master = document.getElementById('master-toggle');
  master.checked = state.enabled;
  document.getElementById('master-label').textContent = state.enabled ? 'On' : 'Off';
  master.addEventListener('change', () => {
    state.enabled = master.checked;
    document.getElementById('master-label').textContent = state.enabled ? 'On' : 'Off';
    setEnabled(state.enabled);
  });

  document.getElementById('new-rule-btn').addEventListener('click', newRule);
  document.getElementById('export-btn').addEventListener('click', exportRules);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', (e) => { if (e.target.files[0]) importRules(e.target.files[0]); });

  onExternalChange(async () => {
    const cur = await getState();
    state.enabled = cur.enabled;
    master.checked = cur.enabled;
    document.getElementById('master-label').textContent = cur.enabled ? 'On' : 'Off';
  });

  renderList();
  renderEditor();
}

init();
