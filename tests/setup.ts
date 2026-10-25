import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, vi } from 'vitest';
import { MemoryStorage } from './memory-storage';

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
  let n = 0;
  // Deterministic, UUID-shaped ids so tests can assert on them.
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () =>
      `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
