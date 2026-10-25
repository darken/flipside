// Size budget for the production build (run `pnpm build` first): `pnpm size`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const dist = new URL('../dist/assets/', import.meta.url).pathname;

const budgets = [
  { name: 'JavaScript (gzipped)', match: /\.js$/, gzip: true, limit: 60 * KB },
  { name: 'CSS (gzipped)', match: /\.css$/, gzip: true, limit: 15 * KB },
  // The -ext files only download when a page uses those letters, so they are not counted.
  { name: 'Fonts (woff2, Latin)', match: /^(?!.*-ext-).*\.woff2$/, gzip: false, limit: 120 * KB },
];

let files;
try {
  files = readdirSync(dist);
} catch {
  console.error('No dist/assets folder: run `pnpm build` first.');
  process.exit(2);
}

let failed = false;
for (const { name, match, gzip, limit } of budgets) {
  const matching = files.filter((file) => match.test(file));
  const total = matching.reduce((sum, file) => {
    const bytes = readFileSync(join(dist, file));
    return sum + (gzip ? gzipSync(bytes, { level: 9 }).length : bytes.length);
  }, 0);
  const ok = total <= limit;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: ${(total / KB).toFixed(1)} KB of ${limit / KB} KB (${matching.length} files)`,
  );
}
process.exit(failed ? 1 : 0);
