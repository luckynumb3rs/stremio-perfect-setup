// Run: node --experimental-strip-types wizard/web/src/lib/aioSections.test.mts
import { buildAioSections } from './aioSections.ts';

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}
function eq(name: string, a: unknown, b: unknown) {
  ok(name, JSON.stringify(a) === JSON.stringify(b), `\n     got: ${JSON.stringify(a)}\n     exp: ${JSON.stringify(b)}`);
}

console.log('\n# buildAioSections: subsections -> nested item tree');
{
  const tpl = { metadata: { inputs: [
    { id: 'header.main', name: '🎨 Main', type: 'alert' },
    { id: 'addonPreset', name: 'Preset', type: 'select' },
    { id: 'bitrate', name: 'Bitrate', type: 'subsection', advanced: true, subsectionIntent: 'inline', subOptions: [
      { id: 'header.mobileBackup', name: '', type: 'alert' },          // in-section, NOT a page break
      { id: 'mobileNotice', name: 'Note', type: 'alert' },             // alert -> subsection alertFields
      { id: 'bitrateCap', name: 'Cap', type: 'select-with-custom' },
      { id: 'socialThing', type: 'socials' },                          // skipped
    ] },
  ] } };

  const sections = buildAioSections(tpl);
  ok('one page produced', sections.length === 1);
  const section = sections[0];
  eq('section title from header name', section.title, 'Main');
  ok('icon extracted', section.icon === '🎨');

  eq('items: field then subsection', section.items.map((i: any) => [i.kind, i.id]), [
    ['field', 'addonPreset'],
    ['subsection', 'bitrate'],
  ]);

  const sub = section.items.find((i: any) => i.kind === 'subsection') as any;
  eq('subsection title', sub.title, 'Bitrate');
  ok('subsection advanced flag', sub.advanced === true);
  eq('subsection intent', sub.subsectionIntent, 'inline');
  eq('subsection fieldIds (socials skipped)', sub.fieldIds, ['bitrateCap']);
  eq('subsection alertFields ids (header + alert, socials skipped)',
    sub.alertFields.map((a: any) => a.id), ['header.mobileBackup', 'mobileNotice']);
  ok('subsection headerField is the subsection entry', (sub.headerField as any).id === 'bitrate');
}

console.log('\n# buildAioSections: flat template still works (no subsections)');
{
  const tpl = { metadata: { inputs: [
    { id: 'header.a', name: 'Alpha', type: 'alert' },
    { id: 'x', name: 'X', type: 'boolean' },
    { id: 'header.b', name: '', type: 'alert' },     // untitled header -> alert of current section
    { id: 'y', name: 'Y', type: 'boolean' },
  ] } };
  const [s] = buildAioSections(tpl);
  eq('items are plain fields', s.items.map((i: any) => [i.kind, i.id]), [['field', 'x'], ['field', 'y']]);
  eq('untitled header captured as alert', s.alertFields.map((a: any) => a.id), ['header.b']);
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
