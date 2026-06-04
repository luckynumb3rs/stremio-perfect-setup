// Run: node --experimental-strip-types wizard/web/src/store/wizard.test.mts
import { useWizard } from './wizard.ts';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);
}

const { setAioStreamsInput } = useWizard.getState();
const inputs = () => useWizard.getState().aioStreamsInputs;

console.log('\n# setAioStreamsInput: nested dotted paths');
{
  setAioStreamsInput('bitrate.bitrateCap', '200');
  eq('nested write creates branch', inputs(), { bitrate: { bitrateCap: '200' } });

  setAioStreamsInput('bitrate.bitrateCapSoft', true);
  eq('sibling write preserves branch', inputs().bitrate, { bitrateCap: '200', bitrateCapSoft: true });

  setAioStreamsInput('addonPreset', 'default');
  ok('flat write still works', inputs().addonPreset === 'default');
  eq('flat write does not disturb branch', inputs().bitrate, { bitrateCap: '200', bitrateCapSoft: true });
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
