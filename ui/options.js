import { getState, saveRules, setEnabled, onExternalChange, currentTabUrl, isExtension } from './store.js';
import { evalRule, validateRule, debugUrl } from '../src/compile.js';
import { infer } from '../src/infer.js';

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
const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Render the result URL with each captured segment highlighted where it lands.
// `$$` is a literal dollar; `$1..$9` are captures.
function resultHtml(to, captures) {
  let out = '';
  let last = 0;
  const re = /\$(\$|\d)/g;
  let m;
  while ((m = re.exec(to))) {
    out += escapeHtml(to.slice(last, m.index));
    out += m[1] === '$' ? '$' : `<mark>${escapeHtml(captures[Number(m[1]) - 1] ?? '')}</mark>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(to.slice(last));
}

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
        el('p', {}, 'Select a rule on the left, or create one to start.'),
        el('button', { class: 'btn primary', onclick: newRule }, '+ New rule'))
    );
    return;
  }

  if (!Array.isArray(rule.examples)) rule.examples = [];
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
    refreshValidationAndPreview(rule, errorsEl, examplesEl);
    scheduleSave();
  };
  fromInput.addEventListener('input', onPattern);
  toInput.addEventListener('input', onPattern);

  // applies-to
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

  const examplesEl = el('div', { class: 'examples' });

  host.append(
    // identity card
    el('div', { class: 'card' },
      el('div', { class: 'editor-head' },
        el('div', { class: 'field', style: 'flex:1;margin:0' }, el('label', {}, 'Name'), nameInput),
        el('button', { class: 'btn danger small', title: 'Delete rule', onclick: () => deleteRule(rule) }, 'Delete')),
      el('div', { class: 'field', style: 'margin-top:12px' },
        el('label', {}, 'From — the URL to match'), fromInput,
        el('div', { class: 'hint' }, 'Use ', el('code', {}, '*'), ' to match any run of characters; the whole URL must match.')),
      el('div', { class: 'field' },
        el('label', {}, 'To — where to send it'), toInput,
        el('div', { class: 'hint' }, 'Reference each ', el('code', {}, '*'), ' as ', el('code', {}, '$1'), ', ', el('code', {}, '$2'), ' …'),
        errorsEl),
      el('div', { class: 'field' },
        el('label', {}, 'Applies to'),
        el('div', { class: 'applies' }, typeBox('main_frame', 'Page'), typeBox('sub_frame', 'Iframe')))),

    // tester card
    el('div', { class: 'card' },
      el('div', { class: 'test-head' },
        el('h2', { style: 'margin:0' }, 'Test'),
        el('button', { class: 'btn ghost small', title: isExtension ? '' : 'Only works inside the extension', onclick: useCurrentTab }, 'Use current tab')),
      examplesEl,
      el('div', { class: 'test-actions' },
        el('button', { class: 'btn small', onclick: () => { rule.examples.push(''); renderExamples(rule, examplesEl); scheduleSave(); } }, '+ Add URL'))),

    // infer card
    el('div', { class: 'card' },
      el('h2', {}, 'Make a rule from an example'),
      buildInfer(rule, fromInput, toInput, errorsEl, examplesEl))
  );

  renderExamples(rule, examplesEl);
  refreshValidationAndPreview(rule, errorsEl, examplesEl);
}

function buildInfer(rule, fromInput, toInput, errorsEl, examplesEl) {
  const a = el('input', { type: 'text', placeholder: 'https://twitter.com/elonmusk', spellcheck: 'false' });
  const b = el('input', { type: 'text', placeholder: 'https://nitter.net/elonmusk', spellcheck: 'false' });
  const suggest = () => {
    const draft = infer(a.value, b.value);
    if (!draft.from || !draft.to) return;
    rule.from = draft.from;
    rule.to = draft.to;
    fromInput.value = draft.from;
    toInput.value = draft.to;
    if (a.value && !rule.examples.includes(a.value)) rule.examples.unshift(a.value);
    const li = document.querySelector(`.rule-item[data-id="${rule.id}"] .rule-from`);
    if (li) li.textContent = rule.from;
    renderExamples(rule, examplesEl);
    refreshValidationAndPreview(rule, errorsEl, examplesEl);
    scheduleSave();
  };
  b.addEventListener('keydown', (e) => { if (e.key === 'Enter') suggest(); });
  return el('div', { class: 'infer-grid' },
    el('div', { class: 'field' }, el('label', {}, 'From URL'), a),
    el('div', { class: 'field' }, el('label', {}, 'To URL'), b),
    el('button', { class: 'btn', onclick: suggest }, 'Suggest rule'));
}

function renderExamples(rule, container) {
  container.innerHTML = '';
  if (!rule.examples.length) {
    container.append(el('div', { class: 'hint' }, 'Add an example URL to see exactly what this rule would do.'));
    return;
  }
  rule.examples.forEach((ex, i) => {
    const input = el('input', { type: 'text', value: ex, placeholder: 'https://…', spellcheck: 'false' });
    const resultLine = el('div', { class: 'result' });
    input.addEventListener('input', () => {
      rule.examples[i] = input.value;
      updateOneResult(rule, input.value, resultLine);
      scheduleSave();
    });
    container.append(
      el('div', { class: 'example-row' },
        el('div', { class: 'example-input-line' }, input,
          el('button', { class: 'x-btn', title: 'Remove', onclick: () => { rule.examples.splice(i, 1); renderExamples(rule, container); refreshValidationAndPreview(rule, document.querySelector('.errors'), container); scheduleSave(); } }, '×')),
        resultLine));
    updateOneResult(rule, ex, resultLine);
  });
}

function updateOneResult(rule, url, lineEl) {
  if (!url) { lineEl.className = 'result nomatch'; lineEl.textContent = ''; return; }
  const errs = validateRule(rule);
  if (errs.length) { lineEl.className = 'result nomatch'; lineEl.textContent = 'fix the rule above'; return; }
  const r = evalRule(rule, url);
  if (r.error) { lineEl.className = 'result error'; lineEl.textContent = r.error; }
  else if (!r.matched) { lineEl.className = 'result nomatch'; lineEl.textContent = "doesn't match"; }
  else { lineEl.className = 'result match'; lineEl.innerHTML = resultHtml(rule.to, r.captures); }
}

function refreshValidationAndPreview(rule, errorsEl, examplesEl) {
  if (errorsEl) errorsEl.textContent = validateRule(rule).join(' ');
  examplesEl.querySelectorAll('.example-row').forEach((row, i) => {
    updateOneResult(rule, rule.examples[i] ?? '', row.querySelector('.result'));
  });
}

async function useCurrentTab() {
  const url = await currentTabUrl();
  const rule = selected();
  if (!rule) return;
  if (!url) { toast(isExtension ? 'No active tab URL' : 'Current tab only works inside the extension'); return; }
  rule.examples.push(url);
  renderExamples(rule, document.querySelector('.examples'));
  scheduleSave();
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

// ---------- top bar actions ----------
function newRule() {
  const rule = { id: uid(), name: 'New rule', enabled: true, from: '', to: '', resourceTypes: ['main_frame'], examples: [''] };
  state.rules.unshift(rule);
  state.selectedId = rule.id;
  renderList();
  renderEditor();
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
        examples: Array.isArray(r.examples) ? r.examples : [],
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
  state.rules = s.rules.map((r) => ({ resourceTypes: ['main_frame'], examples: [], ...r, enabled: r.enabled !== false }));
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
