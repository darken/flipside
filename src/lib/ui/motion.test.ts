/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EASE_PAGE, MOTION } from './motion';

const tokens = readFileSync(`${process.cwd()}/src/styles/tokens.css`, 'utf8');
const token = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1];

describe('motion tokens', () => {
  it.each(Object.entries(MOTION))('--dur-%s matches MOTION', (name, ms) => {
    expect(token(`dur-${name}`)).toBe(`${ms}ms`);
  });

  it('--ease-page matches EASE_PAGE', () => {
    expect(token('ease-page')).toBe(`cubic-bezier(${EASE_PAGE.join(', ')})`);
  });
});
