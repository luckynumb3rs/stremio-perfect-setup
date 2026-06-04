import { createStremioAdapter } from '../core/adapters/stremio.js';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

console.log('\n# Stremio adapter error handling');

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { error: { code: 20004, message: 'Max descriptor size reached' } };
    },
  });

  try {
    const stremio = createStremioAdapter('https://api.strem.io');
    let thrown = null;
    try {
      await stremio.setAddons('auth-key', []);
    } catch (err) {
      thrown = err;
    }

    ok('setAddons maps max descriptor size errors to the catalog guidance message', (
      thrown instanceof Error
      && thrown.message.includes('Stremio could not install AIOMetadata because its manifest is too large for Stremio')
      && thrown.message.includes('Go to the Catalogs page from the left sidebar')
      && thrown.message.includes('try again')
    ), thrown instanceof Error ? thrown.message : String(thrown));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log('\n# Stremio adapter — getUser + userId from login');

// getUser returns the user object (with _id and trakt fields)
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { result: { _id: 'user123', email: 'test@example.com', trakt: null } };
    },
  });
  try {
    const stremio = createStremioAdapter();
    const user = await stremio.getUser('test-auth-key');
    ok('getUser returns user object with _id', user?._id === 'user123');
    ok('getUser returns user object with trakt field', 'trakt' in user);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// getUser returns trakt when present
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { result: { _id: 'user123', trakt: { access_token: 'tok', created_at: 1000000, expires_in: 7776000 } } };
    },
  });
  try {
    const stremio = createStremioAdapter();
    const user = await stremio.getUser('test-auth-key');
    ok('getUser exposes trakt.access_token when linked', !!user?.trakt?.access_token);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// login returns userId derived from user._id
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { result: { authKey: 'ak', user: { _id: 'uid42', email: 'test@example.com' } } };
    },
  });
  try {
    const stremio = createStremioAdapter();
    const result = await stremio.login('test@example.com', 'password');
    ok('login returns userId', result.userId === 'uid42');
    ok('login still returns authKey', result.authKey === 'ak');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// register returns userId
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { result: { authKey: 'ak2', user: { _id: 'uid99', email: 'new@example.com' } } };
    },
  });
  try {
    const stremio = createStremioAdapter();
    const result = await stremio.register('new@example.com', 'password');
    ok('register returns userId', result.userId === 'uid99');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
