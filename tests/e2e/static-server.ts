import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/** A tiny static server whose folder can be swapped while it runs: "deploying" a new build. */
export function serveBuild(initialRoot: string) {
  let root = initialRoot;
  const server: Server = createServer((request, response) => {
    const path = normalize(decodeURIComponent((request.url ?? '/').split('?')[0]!));
    let file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      file = join(root, 'index.html');
    }
    response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    // Like the real host: the service worker and the page are always checked again.
    response.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(response);
  });
  return {
    start: () =>
      new Promise<string>((resolve) =>
        server.listen(0, '127.0.0.1', () => {
          const address = server.address();
          resolve(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`);
        }),
      ),
    deploy: (next: string) => void (root = next),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
