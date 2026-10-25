/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(`${process.cwd()}/${file}`, 'utf8');
type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };
const rules = (JSON.parse(read('vercel.json')) as { headers: Rule[] }).headers;
const header = (source: string, key: string) =>
  rules.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value;

describe('hosting headers (vercel.json)', () => {
  it('allows the inline theme script by its hash, and no other inline script', () => {
    const scripts = [...read('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const hash = createHash('sha256').update(scripts[0]![1]!).digest('base64');
    const csp = header('/(.*)', 'Content-Security-Policy')!;
    expect(csp).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('caches hashed files for a year, and always rechecks the page and the service worker', () => {
    expect(header('/assets/(.*)', 'Cache-Control')).toContain('immutable');
    expect(header('/', 'Cache-Control')).toBe('no-cache');
    expect(header('/index.html', 'Cache-Control')).toBe('no-cache');
    expect(header('/sw.js', 'Cache-Control')).toBe('no-cache');
    expect(header('/manifest.webmanifest', 'Cache-Control')).toBe('no-cache');
  });
});
