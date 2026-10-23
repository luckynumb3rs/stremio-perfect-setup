// Maps the wizard's profiles (Nuvio profiles, or the single Stremio profile) onto BingeCat profiles.
// Pure functions, no I/O. The wizard never deletes anything on BingeCat: it maps onto existing profiles or creates new ones.
//
// row     = { key, name, kids }   key = Nuvio profile id (Stremio: 0)
// profile = { id, name, isMain, ageLimited?, type?, boundNuvio?: [{ id, name }] }
//   `type` ('normal' | 'kids') is used once the API exposes it; until then `ageLimited` (an age cap in the recommendation
//   or content filter settings, not the search cap) is the best available hint that a profile is a kids profile.

export const MAX_BINGECAT_PROFILES = 10;

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// A Kids row may use any sub-profile (never the main one); when the type is known it must be a kids profile.
const compatibleForKids = (p) => !p.isMain && (p.type ? p.type === 'kids' : true);
// A Standard row may use the main profile or a sub-profile that is not (known or presumed) a kids profile.
const compatibleForStandard = (p) => p.isMain || (p.type ? p.type !== 'kids' : !p.ageLimited);
const compatible = (row, p) => (row.kids ? compatibleForKids(p) : compatibleForStandard(p));

/**
 * Deterministic automatic matching, in row order, each BingeCat profile used at most once:
 *   1. linked: the profile is bound to this Nuvio profile (same id) and has the same normalized name
 *   2. same normalized name, compatible type
 *   3. fresh account (only a main profile): the first Standard row gets the main profile
 *   4. otherwise a new profile
 * @returns {{ key, target: number | 'new', reason: 'linked'|'name'|'fresh-main'|'new' }[]} one entry per row, same order
 */
export function autoMatch(rows, profiles) {
  const used = new Set();
  const result = new Map();
  const fresh = profiles.length === 1 && profiles[0].isMain;

  const pass = (reason, test) => {
    for (const row of rows) {
      if (result.has(row.key)) continue;
      const hit = profiles.find((p) => !used.has(p.id) && compatible(row, p) && test(row, p));
      if (hit) { used.add(hit.id); result.set(row.key, { key: row.key, target: hit.id, reason }); }
    }
  };

  pass('linked', (row, p) => (p.boundNuvio ?? []).some((b) => b.id === row.key) && normalizeName(p.name) === normalizeName(row.name));
  pass('name', (row, p) => normalizeName(p.name) === normalizeName(row.name));

  if (fresh) {
    const main = profiles[0];
    const first = rows.find((r) => !r.kids && !result.has(r.key));
    if (first && !used.has(main.id)) { used.add(main.id); result.set(first.key, { key: first.key, target: main.id, reason: 'fresh-main' }); }
  }

  return rows.map((row) => result.get(row.key) ?? { key: row.key, target: 'new', reason: 'new' });
}

/**
 * Checks a (possibly user-edited) mapping. Errors block Continue; warnings are shown next to the row.
 * @param {{ kidsCreateSupported?: boolean }} [opts] set once the API can create a Kids profile
 * @returns {{ errors: {key, message}[], warnings: {key, message}[] }}
 */
export function validateMapping(rows, mapping, profiles, { kidsCreateSupported = false } = {}) {
  const errors = [];
  const warnings = [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const seen = new Map();

  for (const row of rows) {
    const entry = mapping.find((m) => m.key === row.key);
    const err = (message) => errors.push({ key: row.key, message });
    const warn = (message) => warnings.push({ key: row.key, message });
    if (!entry) { err(`${row.name}: choose a BingeCat profile.`); continue; }

    if (entry.target === 'new') {
      if (row.kids && !kidsCreateSupported) {
        warn(`${row.name}: will be created as a normal BingeCat profile with the kids settings. Set its type to Kids on bingecat.com afterwards.`);
      }
      continue;
    }

    const profile = byId.get(entry.target);
    if (!profile) { err(`${row.name}: the selected BingeCat profile no longer exists. Pick another one.`); continue; }
    if (seen.has(profile.id)) err(`${row.name}: BingeCat profile "${profile.name}" is already used for "${seen.get(profile.id)}".`);
    seen.set(profile.id, row.name);

    if (row.kids && profile.isMain) err(`${row.name}: the BingeCat main profile can never be a Kids profile.`);
    else if (!row.kids && !profile.isMain && (profile.type ? profile.type === 'kids' : profile.ageLimited)) {
      err(`${row.name}: "${profile.name}" looks like a BingeCat Kids profile and would get the standard (adult) settings.`);
    }

    warn(profile.isMain
      ? `${row.name}: the settings of your BingeCat main profile "${profile.name}" will be overwritten.`
      : `${row.name}: the settings of the BingeCat profile "${profile.name}" will be overwritten.`);
    if (row.kids && !profile.isMain && !profile.type) {
      warn(`${row.name}: BingeCat does not tell us whether "${profile.name}" is a Kids profile. Make sure it is.`);
    }
    const others = (profile.boundNuvio ?? []).filter((b) => b.id !== row.key);
    if (others.length > 0 && !(profile.boundNuvio ?? []).some((b) => b.id === row.key)) {
      warn(`${row.name}: "${profile.name}" is linked to another Nuvio profile on bingecat.com.`);
    }
  }

  const created = rows.filter((r) => mapping.find((m) => m.key === r.key)?.target === 'new').length;
  if (profiles.length + created > MAX_BINGECAT_PROFILES) {
    errors.push({ key: null, message: `BingeCat allows ${MAX_BINGECAT_PROFILES} profiles per account; ${created} new profile${created === 1 ? '' : 's'} would exceed that. Map more rows onto existing profiles.` });
  }
  return { errors, warnings };
}
