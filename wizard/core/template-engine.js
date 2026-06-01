// Template directive engine for the Stremio/Nuvio Perfect Setup Wizard.
//
// Ports the client-side resolution that the AIOStreams import wizard performs, so we can turn a
// repo template (e.g. templates/AIOStreams.json) + collected `inputs` + `credentials` into a
// final `config` object ready to POST to `POST /api/v1/user`.
//
// Supported directives
// (see the internal API notes §6; grammar observed from templates/AIOStreams.json):
//   {{inputs.X}}                          interpolation (standalone -> typed value; in arrays -> flatten)
//   { __if: expr, __value: v }            include resolved v if expr truthy, else drop the key
//   { __if: expr, ...obj }                keep obj (resolved) only if expr truthy, else drop it
//   { __switch: expr, cases:{}, default } pick case by string key, else default
//   { __remove: true }                    drop this node
//   "<template_placeholder>"              credential slot filled from `credentials`
//
// Expression grammar: identifiers `services`, `inputs.<path>`; ops `and` `or` `!`/`not` `==` `!=`;
// parentheses; operands = barewords (only, none), 'quoted', numbers, true/false.
//
// Zero dependencies. Usable as an ES module in the browser and via a thin CJS shim in Node tests.

const REMOVE = Symbol('remove');

// Map a known set of credential placeholder tokens to keys in the `credentials` bag.
const CREDENTIAL_PLACEHOLDERS = {
  '<template_placeholder>': null, // resolved positionally by surrounding key (see resolveString)
};

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

// Tokenize an __if / __switch expression.
function tokenize(expr) {
  const tokens = [];
  const re = /\s*(==|!=|!|\(|\)|'[^']*'|"[^"]*"|[A-Za-z0-9_.]+)\s*/g;
  let m;
  let last = 0;
  while ((m = re.exec(expr)) !== null) {
    if (m.index !== last) throw new Error(`Unexpected token in expression: ${expr}`);
    tokens.push(m[1]);
    last = re.lastIndex;
  }
  if (last !== expr.length) throw new Error(`Unparsed trailing in expression: ${expr}`);
  return tokens;
}

// Recursive-descent parser -> AST. Precedence: or < and < not < comparison < primary.
function parseExpression(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseOr() {
    let node = parseAnd();
    while (peek() === 'or') { next(); node = { op: 'or', l: node, r: parseAnd() }; }
    return node;
  }
  function parseAnd() {
    let node = parseNot();
    while (peek() === 'and') { next(); node = { op: 'and', l: node, r: parseNot() }; }
    return node;
  }
  function parseNot() {
    if (peek() === '!' || peek() === 'not') { next(); return { op: 'not', v: parseNot() }; }
    return parseComparison();
  }
  function parseComparison() {
    const left = parsePrimary();
    if (peek() === '==' || peek() === '!=') {
      const op = next();
      return { op, l: left, r: parsePrimary() };
    }
    return left;
  }
  function parsePrimary() {
    const t = peek();
    if (t === '(') { next(); const e = parseOr(); if (next() !== ')') throw new Error('Missing )'); return e; }
    next();
    return { op: 'operand', token: t };
  }

  const ast = parseOr();
  if (pos !== tokens.length) throw new Error(`Trailing tokens: ${tokens.slice(pos).join(' ')}`);
  return ast;
}

// Resolve an operand token to a JS value given the context.
function resolveOperand(token, ctx) {
  if (token === 'services') return ctx.services; // array of selected service ids
  if (token.startsWith('services.')) {
    const serviceId = token.slice('services.'.length);
    return Array.isArray(ctx.services) ? ctx.services.includes(serviceId) : false;
  }
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if ((token.startsWith("'") && token.endsWith("'")) || (token.startsWith('"') && token.endsWith('"'))) {
    return token.slice(1, -1);
  }
  if (token.startsWith('inputs.')) {
    return getPath(ctx.inputs, token.slice('inputs.'.length));
  }
  // bareword literal (e.g. only, none)
  return token;
}

function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.length > 0;
  return Boolean(v);
}

function evalAst(ast, ctx) {
  switch (ast.op) {
    case 'or': return truthy(evalAst(ast.l, ctx)) || truthy(evalAst(ast.r, ctx));
    case 'and': return truthy(evalAst(ast.l, ctx)) && truthy(evalAst(ast.r, ctx));
    case 'not': return !truthy(evalAst(ast.v, ctx));
    case '==': return looseEq(evalOperandNode(ast.l, ctx), evalOperandNode(ast.r, ctx));
    case '!=': return !looseEq(evalOperandNode(ast.l, ctx), evalOperandNode(ast.r, ctx));
    case 'operand': return resolveOperand(ast.token, ctx);
    default: throw new Error(`Unknown ast op: ${ast.op}`);
  }
}

// For comparison operands, `services` compares as its joined-string form.
function evalOperandNode(node, ctx) {
  const v = evalAst(node, ctx);
  return v;
}

function looseEq(a, b) {
  if (Array.isArray(a)) a = a.join(',');
  if (Array.isArray(b)) b = b.join(',');
  // numbers vs numeric strings
  if (typeof a === 'number' || typeof b === 'number') return String(a) === String(b);
  return a === b;
}

function evalExpr(expr, ctx) {
  return truthy(evalAst(parseExpression(tokenize(expr)), ctx));
}

// Produce the string key used by __switch from an expression.
function switchKey(expr, ctx) {
  // For a bare operand we want its raw value; for `services` -> joined ids.
  const ast = parseExpression(tokenize(expr));
  const v = evalAst(ast, ctx);
  if (Array.isArray(v)) return v.join(','); // services -> "" when empty
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

// ---------------------------------------------------------------------------
// Value resolution ({{inputs.X}}, placeholders)
// ---------------------------------------------------------------------------

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const INTERP_RE = /\{\{\s*inputs\.([A-Za-z0-9_.]+)\s*\}\}/g;

// Resolve a string node. Returns either a string, or (for a standalone {{...}}) the typed value.
function resolveString(str, ctx) {
  // Credential placeholder: resolved by caller via key context; here we map by token table.
  if (str === '<template_placeholder>') return ctx.__placeholderValue ?? str;

  const standalone = str.match(/^\{\{\s*inputs\.([A-Za-z0-9_.]+)\s*\}\}$/);
  if (standalone) {
    const val = getPath(ctx.inputs, standalone[1]);
    return val === undefined ? '' : val; // keep typed value (number/array/bool)
  }
  return str.replace(INTERP_RE, (_, p) => {
    const v = getPath(ctx.inputs, p);
    return v === undefined ? '' : Array.isArray(v) ? v.join(',') : String(v);
  });
}

// Credential placeholder tokens -> credential bag keys.
const PLACEHOLDER_KEYS = {
  tmdbApiKey: 'tmdbApiKey',
  tmdbAccessToken: 'tmdbAccessToken',
  tvdbApiKey: 'tvdbApiKey',
  geminiApiKey: 'geminiApiKey',
  rpdbApiKey: 'rpdbApiKey',
};

// ---------------------------------------------------------------------------
// Recursive resolver
// ---------------------------------------------------------------------------

function resolveNode(node, ctx, keyHint) {
  if (Array.isArray(node)) {
    const out = [];
    for (const item of node) {
      const r = resolveNode(item, ctx, keyHint);
      if (r === REMOVE) continue;
      // Array flattening: spread when the item is a standalone {{inputs.X}} string
      // or an explicit __flatten object and resolves to an array.
      const isStandaloneInterp = typeof item === 'string' && /^\{\{\s*inputs\./.test(item.trim());
      const isExplicitFlatten = item && typeof item === 'object' && '__flatten' in item;
      if (Array.isArray(r) && (isStandaloneInterp || isExplicitFlatten)) {
        out.push(...r);
      } else {
        out.push(r);
      }
    }
    return out;
  }

  if (node && typeof node === 'object') {
    // __remove
    if (node.__remove === true) return REMOVE;

    // __switch
    if ('__switch' in node) {
      const key = switchKey(node.__switch, ctx);
      const cases = node.cases || {};
      const chosen = Object.prototype.hasOwnProperty.call(cases, key) ? cases[key] : node.default;
      return resolveNode(chosen, ctx, keyHint);
    }

    // __if (+ optional __value)
    if ('__if' in node) {
      const keep = evalExpr(node.__if, ctx);
      if (!keep) return REMOVE;
      if ('__value' in node) {
        return resolveValueWithFlatten(node.__value, ctx, keyHint);
      }
      // strip the __if key, resolve the rest
      const rest = { ...node };
      delete rest.__if;
      return resolveNode(rest, ctx, keyHint);
    }

    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const r = resolveNode(v, ctx, k);
      if (r === REMOVE) continue;
      out[k] = r;
    }
    return out;
  }

  if (typeof node === 'string') {
    // credential placeholder by key hint
    if (node === '<template_placeholder>' && keyHint && PLACEHOLDER_KEYS[keyHint]) {
      const cred = ctx.credentials?.[PLACEHOLDER_KEYS[keyHint]];
      return cred ?? '';
    }
    return resolveString(node, ctx);
  }

  return node; // number, boolean, null
}

// Resolve a value, flattening any array element that is itself a {{inputs.X}} array.
function resolveValueWithFlatten(value, ctx, keyHint) {
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) {
      if (typeof item === 'string') {
        const r = resolveString(item, ctx);
        if (Array.isArray(r)) out.push(...r);
        else out.push(r);
      } else {
        const r = resolveNode(item, ctx, keyHint);
        if (r !== REMOVE) out.push(r);
      }
    }
    return out;
  }
  return resolveNode(value, ctx, keyHint);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a template's `config` block into a final config object.
 * @param {object} template  Parsed template JSON (has `.config` and `.metadata`).
 * @param {object} opts
 * @param {object} opts.inputs        values for metadata.inputs ids (e.g. {timeout:5000, languages:['English'], formatterChoice:'flat'})
 * @param {string[]} opts.services    selected Debrid service ids (e.g. ['torbox'])
 * @param {object} opts.credentials   {tmdbApiKey, tmdbAccessToken, tvdbApiKey, ...}
 * @returns {object} resolved config (also injects selected services into config.services)
 */
function resolveTemplate(template, { inputs = {}, services = [], credentials = {}, serviceCredentials = {} } = {}) {
  // Seed defaults from metadata.inputs so that unset inputs resolve to their template-defined
  // default value (e.g. timeout:5000) rather than the empty string fallback.
  const templateDefaults = {};
  const metaInputs = template?.metadata?.inputs;
  if (Array.isArray(metaInputs)) {
    for (const field of metaInputs) {
      if (field.id && !field.id.startsWith('header.') && field.default !== undefined) {
        templateDefaults[field.id] = field.default;
      }
    }
  }
  // User-supplied inputs take precedence over template defaults.
  const mergedInputs = { ...templateDefaults, ...inputs };

  const ctx = { inputs: mergedInputs, services, credentials };
  const resolved = resolveNode(template.config, ctx, null);

  // Inject the selected Debrid services with optional per-service credentials.
  if (Array.isArray(resolved.services)) {
    const known = new Map(resolved.services.map((s) => [s.id, s]));
    resolved.services = services.length
      ? services.map((id) => ({
          id,
          enabled: true,
          credentials: {
            ...(known.get(id)?.credentials || {}),
            ...(serviceCredentials[id] || {}),
          },
        }))
      : resolved.services.map((s) => ({ ...s, enabled: false }));
  }

  // Some templates intentionally ship with a built-in RPDB default. When the wizard
  // collected an explicit RPDB key, override that default here without exposing the
  // shared or user-entered key in the UI.
  if (credentials.rpdbApiKey) {
    resolved.rpdbApiKey = credentials.rpdbApiKey;
  }

  return resolved;
}

/**
 * Evaluate an input field's `__if` visibility against current inputs/services (for the UI renderer).
 */
function isVisible(field, { inputs = {}, services = [] } = {}) {
  if (!field.__if) return true;
  return evalExpr(field.__if, { inputs, services, credentials: {} });
}

export { resolveTemplate, isVisible, evalExpr, switchKey, REMOVE };
