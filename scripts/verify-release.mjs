import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const text = (file) => readFile(file, 'utf8');
const manifest = JSON.parse(await text('manifest.json'));
assert.equal(manifest.id, 'bases-views-ex');
assert.equal(manifest.name, 'Bases Views EX');
for (const file of ['package.json', 'dist/manifest.json'])
	assert.equal(JSON.parse(await text(file)).version, manifest.version);
const license = await text('LICENSE');
const bundle = await text('dist/main.js');
for (const file of ['licenses/Kanban-MIT.txt', 'licenses/Spotlight-MIT.txt']) {
	const original = (await text(file)).trim();
	assert.ok(license.includes(original));
	assert.ok(bundle.includes(original));
}
assert.ok(bundle.includes('kanban-view'));
assert.ok(bundle.includes('bases-spotlight-view-expanded'));
assert.ok(bundle.includes('spotlight-ex-cards'));
assert.ok(bundle.includes('SortableJS'));
assert.equal(await text('styles.css'), await text('dist/styles.css'));
for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES', 'STATUS-LISTS.md', 'README.md'])
	assert.equal(await text(file), await text(`dist/${file}`));
console.log('Release version, view identifiers, styles and complete original licenses verified.');
