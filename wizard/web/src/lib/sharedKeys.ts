import { WIZARD_KEY_ARRAY_IDS, type WizardConfig, type WizardKeyArrayId, type WizardObfuscatedKey } from './constants';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEFAULT_ITERATIONS = 250000;

interface EncodedKeyPayload {
  v: 1;
  i?: number;
  s: string;
  n: string;
  c: string;
}

export interface SharedKeySelection {
  tmdbApiKey: string;
  tmdbAccessToken: string;
  tvdbApiKey: string;
  geminiApiKey: string;
  rpdbApiKey: string;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEncodedKey(secret: WizardObfuscatedKey): EncodedKeyPayload {
  let decoded = '';
  try {
    decoded = atob(secret);
  } catch {
    throw new Error('invalid base64 payload');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('invalid encoded JSON payload');
  }

  if (
    !isRecord(parsed)
    || parsed.v !== 1
    || (parsed.i !== undefined && (typeof parsed.i !== 'number' || parsed.i <= 0))
    || typeof parsed.s !== 'string'
    || parsed.s.trim().length === 0
    || typeof parsed.n !== 'string'
    || parsed.n.trim().length === 0
    || typeof parsed.c !== 'string'
    || parsed.c.trim().length === 0
  ) {
    throw new Error('unsupported encoded key format');
  }

  return {
    v: parsed.v,
    i: parsed.i,
    s: parsed.s,
    n: parsed.n,
    c: parsed.c,
  };
}

async function deriveKey(passphrase: string, salt: ArrayBuffer, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

async function decryptKey(secret: WizardObfuscatedKey, passphrase: string) {
  const payload = parseEncodedKey(secret);
  const salt = toArrayBuffer(base64ToBytes(payload.s));
  const iv = toArrayBuffer(base64ToBytes(payload.n));
  const ciphertext = toArrayBuffer(base64ToBytes(payload.c));
  const key = await deriveKey(passphrase, salt, payload.i ?? DEFAULT_ITERATIONS);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return textDecoder.decode(plaintext).trim();
}

async function decryptKeyArray(secrets: WizardObfuscatedKey[], passphrase: string) {
  const values = await Promise.all(secrets.map((secret) => decryptKey(secret, passphrase)));
  return values.filter((value) => value.length > 0);
}

function randomIndex(length: number) {
  if (length <= 1) return 0;
  return crypto.getRandomValues(new Uint32Array(1))[0] % length;
}

function randomPick(values: string[]) {
  if (!values.length) return '';
  return values[randomIndex(values.length)];
}

export function hasConfiguredKeyArray(config: WizardConfig | null, keyId: WizardKeyArrayId) {
  return Boolean(config?.keys[keyId]?.length);
}

export function hasConfiguredTmdbFallback(config: WizardConfig | null) {
  return hasConfiguredKeyArray(config, 'tmdbApiKeys') && hasConfiguredKeyArray(config, 'tmdbReadAccessTokens');
}

export async function resolveSharedKeySelection(
  config: WizardConfig,
  requestedKeyIds: WizardKeyArrayId[] = [...WIZARD_KEY_ARRAY_IDS],
): Promise<SharedKeySelection> {
  try {
    const passphrase = config.name;
    const requested = new Set(requestedKeyIds);
    const [tmdbApiKeys, tmdbReadAccessTokens, tvdbApiKeys, geminiApiKeys, rpdbApiKeys] = await Promise.all([
      requested.has('tmdbApiKeys') ? decryptKeyArray(config.keys.tmdbApiKeys, passphrase) : Promise.resolve([]),
      requested.has('tmdbReadAccessTokens') ? decryptKeyArray(config.keys.tmdbReadAccessTokens, passphrase) : Promise.resolve([]),
      requested.has('tvdbApiKeys') ? decryptKeyArray(config.keys.tvdbApiKeys, passphrase) : Promise.resolve([]),
      requested.has('geminiApiKeys') ? decryptKeyArray(config.keys.geminiApiKeys, passphrase) : Promise.resolve([]),
      requested.has('rpdbApiKeys') ? decryptKeyArray(config.keys.rpdbApiKeys, passphrase) : Promise.resolve([]),
    ]);

    return {
      tmdbApiKey: randomPick(tmdbApiKeys),
      tmdbAccessToken: randomPick(tmdbReadAccessTokens),
      tvdbApiKey: randomPick(tvdbApiKeys),
      geminiApiKey: randomPick(geminiApiKeys),
      rpdbApiKey: randomPick(rpdbApiKeys),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not decode shared keys for config "${config.name}": ${message}`);
  }
}
