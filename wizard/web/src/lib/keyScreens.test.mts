// Run: node --experimental-strip-types wizard/web/src/lib/keyScreens.test.mts
import { getCatalogStep, getDoneStep, getInstallStep, getRecommendationsStep } from './keyScreens.ts';

let passed = 0;
let failed = 0;
function eq(name: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`); }
}

console.log('\n# step numbering with and without the Catalogs step');
for (const n of [0, 5, 9]) {
  const c = getCatalogStep(n);
  eq(`n=${n}: with Catalogs the later steps follow one by one`, [getRecommendationsStep(n), getInstallStep(n), getDoneStep(n)], [c + 1, c + 2, c + 3]);
  eq(`n=${n}: without Catalogs Recommendations takes its number and the rest move up`, [getRecommendationsStep(n, false), getInstallStep(n, false), getDoneStep(n, false)], [c, c + 1, c + 2]);
}
eq('defaults keep the old numbering', getDoneStep(4), getDoneStep(4, true));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
