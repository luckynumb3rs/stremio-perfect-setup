// Schema-driven form renderer. Reads `template.metadata.inputs` (the AIOStreams form schema) and
// builds the wizard controls dynamically, so editing the template changes the UI automatically.
// Handles field types: alert, select, multi-select, boolean, number, socials.
// Respects each field's `__if` visibility expression via the template engine.

import { isVisible } from './template-engine.js';

// Render the full inputs schema into a container element. Returns a live `getValues()` accessor.
export function renderSchema(container, schema, { getServices } = {}) {
  const state = {}; // id -> value
  const fieldEls = []; // {field, el, refresh}

  // Seed defaults.
  for (const f of schema) {
    if (f.default !== undefined) state[f.id] = clone(f.default);
  }

  const ctx = () => ({ inputs: state, services: getServices ? getServices() : [] });

  function refreshVisibility() {
    for (const { field, el } of fieldEls) {
      el.hidden = !isVisible(field, ctx());
    }
  }

  for (const field of schema) {
    const el = renderField(field, state, () => {
      refreshVisibility();
    });
    if (el) {
      container.appendChild(el);
      fieldEls.push({ field, el });
    }
  }
  refreshVisibility();

  return {
    getValues: () => clone(state),
    refresh: refreshVisibility,
  };
}

function renderField(field, state, onChange) {
  const wrap = document.createElement('div');
  wrap.className = `field field--${field.type}`;
  wrap.dataset.id = field.id;

  if (field.type === 'alert') {
    wrap.classList.add(`alert--${field.intent || 'info'}`);
    if (field.name) wrap.appendChild(h('strong', {}, field.name));
    if (field.description) wrap.appendChild(md(field.description));
    return wrap;
  }
  if (field.type === 'socials') return null; // credits block; skip in wizard

  const label = h('label', {}, field.name || field.id);
  wrap.appendChild(label);
  if (field.description) wrap.appendChild(md(field.description));

  let input;
  switch (field.type) {
    case 'select':
      input = h('select', {});
      for (const opt of field.options || []) input.appendChild(h('option', { value: opt.value }, opt.label));
      input.value = state[field.id] ?? field.default ?? '';
      input.addEventListener('change', () => { state[field.id] = input.value; onChange(); });
      break;
    case 'multi-select':
      input = renderMultiSelect(field, state, onChange);
      break;
    case 'boolean':
      input = h('input', { type: 'checkbox' });
      input.checked = Boolean(state[field.id] ?? field.default);
      input.addEventListener('change', () => { state[field.id] = input.checked; onChange(); });
      break;
    case 'number':
      input = h('input', { type: 'number' });
      input.value = state[field.id] ?? field.default ?? '';
      input.addEventListener('input', () => { state[field.id] = input.value === '' ? undefined : Number(input.value); onChange(); });
      break;
    default:
      input = h('input', { type: 'text' });
      input.value = state[field.id] ?? '';
      input.addEventListener('input', () => { state[field.id] = input.value; onChange(); });
  }
  wrap.appendChild(input);
  return wrap;
}

function renderMultiSelect(field, state, onChange) {
  const box = h('div', { class: 'multi-select' });
  const current = new Set(state[field.id] || field.default || []);
  state[field.id] = [...current];
  for (const opt of field.options || []) {
    const id = `${field.id}__${opt.value}`;
    const cb = h('input', { type: 'checkbox', id });
    cb.checked = current.has(opt.value);
    cb.addEventListener('change', () => {
      if (cb.checked) current.add(opt.value); else current.delete(opt.value);
      state[field.id] = [...current];
      onChange();
    });
    box.appendChild(h('label', { class: 'chip' }, [cb, document.createTextNode(' ' + opt.label)]));
  }
  return box;
}

// --- tiny DOM + markdown helpers ---
function h(tag, attrs = {}, children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (children != null) {
    for (const c of [].concat(children)) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

// Minimal, safe markdown: **bold**, *italic*, [text](url), `code`, and line breaks. Escapes HTML.
function md(text) {
  const el = document.createElement('p');
  el.className = 'desc';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
  el.innerHTML = html;
  return el;
}

function clone(v) {
  return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}
