import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { buildStrategyIndex } from './scripts/strategy-index.mjs';

const strategies = resolve('strategies');

export default defineConfig({
  base: process.env.PAGES_BASE_PATH ? `${process.env.PAGES_BASE_PATH.replace(/\/$/, '')}/` : '/',
  plugins: [{
    name: 'team-playbook',
    configureServer(server) {
      server.middlewares.use('/strategies', async (request, response, next) => {
        const path = new URL(request.url, 'http://localhost').pathname;
        try {
          if (path === '/index.json') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            response.end(JSON.stringify(await buildStrategyIndex(strategies)));
            return;
          }
          const [bucket, revision, ...parts] = path.slice(1).split('/').map(decodeURIComponent);
          if (bucket !== 'files') { next(); return; }
          if (!/^[a-f0-9]{64}$/.test(revision) || !parts.length ||
              parts.some(part => !part || part.startsWith('.') || /[/\\\0]/.test(part)) ||
              !/\.ica$/i.test(parts.at(-1))) {
            response.statusCode = 404;
            response.end();
            return;
          }
          const bytes = await readFile(join(strategies, ...parts));
          if (createHash('sha256').update(bytes).digest('hex') !== revision) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.setHeader('Content-Type', 'application/octet-stream');
          response.end(bytes);
        } catch (error) {
          response.statusCode = path === '/index.json' ? 500 : 404;
          response.end(error.message);
        }
      });
    },
  }],
});
