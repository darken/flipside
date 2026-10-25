import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.svelte';

describe('App', () => {
  afterEach(() => vi.useRealTimers());

  it("renders today's date as the page header", () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 25, 12));
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
