import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, vi } from 'vitest';

class MemoryStorage implements Storage {
  #data = new Map<string, string>();
  get length() {
    return this.#data.size;
  }
  clear() {
    this.#data.clear();
  }
  getItem(key: string) {
    return this.#data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#data.delete(key);
  }
  setItem(key: string, value: string) {
    this.#data.set(key, String(value));
  }
}

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
