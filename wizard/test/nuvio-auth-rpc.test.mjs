import { createNuvioAdapter } from '../core/adapters/nuvio.js';

let passed = 0;
let failed = 0;

function ok(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

console.log('\n# Nuvio signup fallback');
{
  const adapter = createNuvioAdapter();
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/auth/v1/signup')) {
      return new Response('', { status: 200 });
    }
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      return jsonResponse({
        access_token: 'token-123',
        user: { id: 'user-123' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const auth = await adapter.signup('person@example.com', 'password123');
    ok('Signup falls back to login when body is empty', auth?.token === 'token-123');
    ok('Signup performs login fallback request', calls.some(url => url.includes('/auth/v1/token?grant_type=password')));
  } catch (err) {
    ok('Signup fallback does not throw', false, err instanceof Error ? err.message : String(err));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log('\n# Nuvio createProfile tolerates empty RPC responses');
{
  const adapter = createNuvioAdapter();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/rpc/sync_pull_profiles')) {
      return jsonResponse([]);
    }
    if (String(url).includes('/rest/v1/rpc/sync_push_profiles')) {
      return new Response('', { status: 200 });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const profile = await adapter.createProfile('token-123', { name: 'Profile 1' });
    ok('createProfile returns profile metadata after empty sync_push_profiles body', profile?.profile_index === 1);
    ok('createProfile preserves requested name', profile?.name === 'Profile 1');
  } catch (err) {
    ok('createProfile does not throw on empty RPC body', false, err instanceof Error ? err.message : String(err));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
