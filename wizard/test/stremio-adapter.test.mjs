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

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
