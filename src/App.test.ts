import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '$lib/store/app.svelte';
import App from './App.svelte';

describe('App', () => {
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 12));
    dispose = app.init();
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
  });

  it("renders today's date as the page header", () => {
    render(App);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Sunday/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/25/);
  });

  it('has Stats and Settings buttons', () => {
    render(App);
    expect(screen.getByRole('button', { name: 'Stats' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});
