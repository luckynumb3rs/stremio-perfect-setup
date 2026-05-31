// Wizard bootstrap for GitHub Pages. Loads the config + AIOStreams template, renders the
// schema-driven form (§3 of the plan), collects account + credentials + Debrid services, then
// runs the Phase-1 Stremio orchestrator. Pure ES modules, no build step.

import { renderSchema } from '../src/schema-renderer.js';
import { runStremioSetup } from '../src/orchestrator.js';

const RAW = 'https://raw.githubusercontent.com/luckynumb3rs/stremio-perfect-setup/refs/heads/main';
const app = document.getElementById('app');

// Debrid services surfaced before the template options (matches the AIOStreams "Select Services" step).
const SERVICES = [
  { id: 'torbox', label: '🟣 TorBox' },
  { id: 'realdebrid', label: '🔴 Real-Debrid' },
  { id: 'premiumize', label: '🟢 Premiumize' },
  { id: 'alldebrid', label: '🟠 AllDebrid' },
  { id: 'debridlink', label: '🔵 Debrid-Link' },
  { id: 'easydebrid', label: '🟡 EasyDebrid' },
  { id: 'offcloud', label: '☁️ Offcloud' },
];

const selectedServices = new Set();

async function main() {
  let config, template;
  try {
    config = await fetchJson('./config.json');
    template = await fetchJson(config.templates?.aiostreams || `${RAW}/templates/AIOStreams.json`);
  } catch (err) {
    return fail(`Could not load config/template: ${err.message}`);
  }

  app.innerHTML = '';

  // --- Step: account ---
  const accountStep = section('① Your Stremio account');
  const accMode = select(['create:Create a new account', 'existing:Use my existing account']);
  const email = textInput('email', 'Email');
  const pass = textInput('password', 'Password');
  accountStep.append(labelled('Mode', accMode), email.wrap, pass.wrap);
  app.appendChild(accountStep);

  // --- Step: API keys ---
  const keysStep = section('② API keys (from the guide, paste what you have)');
  const tmdbKey = textInput('text', 'TMDB API Key');
  const tmdbTok = textInput('text', 'TMDB Read Access Token');
  const tvdbKey = textInput('text', 'TVDB API Key');
  keysStep.append(
    note('Get these from step 1 of the guide. TMDB/TVDB are required for metadata.'),
    tmdbKey.wrap, tmdbTok.wrap, tvdbKey.wrap
  );
  app.appendChild(keysStep);

  // --- Step: Debrid services ---
  const svcStep = section('③ Debrid services (leave empty for free P2P / HTTP)');
  const svcBox = document.createElement('div');
  svcBox.className = 'services';
  for (const s of SERVICES) {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.addEventListener('change', () => {
      cb.checked ? selectedServices.add(s.id) : selectedServices.delete(s.id);
      form.refresh(); // re-evaluate __if visibility (services-dependent fields)
    });
    const lab = document.createElement('label');
    lab.className = 'chip';
    lab.append(cb, document.createTextNode(' ' + s.label));
    svcBox.appendChild(lab);
  }
  svcStep.appendChild(svcBox);
  app.appendChild(svcStep);

  // --- Step: template options (DYNAMIC from metadata.inputs) ---
  const optStep = section('④ Stream options');
  app.appendChild(optStep);
  const form = renderSchema(optStep, template.metadata.inputs, {
    getServices: () => [...selectedServices],
  });

  // --- Step: run ---
  const runStep = section('⑤ Build & install');
  const runBtn = document.createElement('button');
  runBtn.textContent = '🚀 Create everything';
  const log = document.createElement('div');
  log.className = 'summary';
  runStep.append(runBtn, log);
  app.appendChild(runStep);

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    log.textContent = '';
    const print = (line) => { log.textContent += line + '\n'; };
    try {
      const summary = await runStremioSetup({
        config,
        templates: { aiostreams: template },
        inputs: form.getValues(),
        services: [...selectedServices],
        credentials: {
          tmdbApiKey: tmdbKey.input.value.trim(),
          tmdbAccessToken: tmdbTok.input.value.trim(),
          tvdbApiKey: tvdbKey.input.value.trim(),
        },
        account: { mode: accMode.value, email: email.input.value.trim(), password: pass.input.value },
        onStep: (name, data) => print(`✓ ${name}: ${JSON.stringify(data)}`),
      });
      print('\n=== DONE - SAVE THESE CREDENTIALS ===');
      print(JSON.stringify(summary, null, 2));
    } catch (err) {
      print(`\n❌ ${err.message}`);
    } finally {
      runBtn.disabled = false;
    }
  });
}

// --- helpers ---
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}
function section(title) {
  const s = document.createElement('div');
  s.className = 'step';
  const h = document.createElement('h2');
  h.textContent = title;
  s.appendChild(h);
  return s;
}
function textInput(type, label) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = type === 'email' ? 'email' : type === 'password' ? 'password' : 'text';
  wrap.append(l, input);
  return { wrap, input };
}
function labelled(label, el) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  wrap.append(l, el);
  return wrap;
}
function select(pairs) {
  const s = document.createElement('select');
  for (const p of pairs) {
    const [value, label] = p.split(':');
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    s.appendChild(o);
  }
  return s;
}
function note(text) {
  const p = document.createElement('p');
  p.className = 'desc';
  p.textContent = text;
  return p;
}
function fail(msg) {
  app.innerHTML = `<div class="step"><h2>⚠️ Error</h2><p class="notice">${msg}</p></div>`;
}

main();
