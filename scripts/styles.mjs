import { readFile, writeFile } from 'node:fs/promises';
const parts = await Promise.all(
	['src/spotlight/styles.css', 'src/suite/kanban.css'].map((file) => readFile(file, 'utf8')),
);
await writeFile('styles.css', parts.map((part) => part.trimEnd()).join('\n\n') + '\n');
