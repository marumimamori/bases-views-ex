import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const routes = new Map([
	['/', ['tests/spotlight/fixture.html', 'text/html']],
	['/cards', ['tests/spotlight/cards.html', 'text/html']],
	['/cards-regression.js', ['tests/spotlight/cards-regression.js', 'text/javascript']],
	['/fixture.js', ['tests/spotlight/fixture.js', 'text/javascript']],
	['/regression.js', ['tests/spotlight/regression.js', 'text/javascript']],
	['/main.js', ['src/spotlight/runtime.js', 'text/javascript']],
	['/styles.css', ['styles.css', 'text/css']],
]);
createServer(async (request, response) => {
	const route = routes.get(new URL(request.url, 'http://localhost').pathname);
	if (!route) {
		response.writeHead(404).end();
		return;
	}
	try {
		response.writeHead(200, { 'Content-Type': `${route[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
		response.end(await readFile(resolve(route[0])));
	} catch {
		response.writeHead(404).end();
	}
}).listen(18765, '127.0.0.1', () => console.log('Browser fixtures at http://127.0.0.1:18765'));
