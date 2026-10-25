import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '$lib/store/app.svelte';
import { exportBackup } from '$lib/store/backup';
import { reloadApp } from '$lib/ui/reload';
import App from '../App.svelte';
import ErrorPage from './ErrorPage.svelte';

// A notepad that breaks while it renders.
vi.mock('$components/NotepadStack.svelte', () => ({
  default: function Broken() {
    throw new Error('the notepad broke');
  },
}));
vi.mock('$lib/ui/reload', async (original) => ({
  ...(await original<typeof import('$lib/ui/reload')>()),
  reloadApp: vi.fn(),
}));
vi.mock('$lib/store/backup', async (original) => ({
  ...(await original<typeof import('$lib/store/backup')>()),
  exportBackup: vi.fn(async () => 'downloaded' as const),
}));

describe('a rendering bug', () => {
  let dispose: () => void;
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dispose = app.init();
  });
  afterEach(() => {
    dispose();
    vi.restoreAllMocks();
  });

  it('shows a calm page instead of a white screen', () => {
    render(App);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('Your data is safe on this device.')).toBeInTheDocument();
  });

  it('Reload reloads the page', async () => {
    render(ErrorPage, { error: new Error('x') });
    await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reloadApp).toHaveBeenCalled();
  });

  it('Download backup hands the data to the backup export', async () => {
    render(ErrorPage, { error: new Error('x') });
    await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(exportBackup).toHaveBeenCalled();
  });

  it('falls back to the raw saved data when the export itself fails', async () => {
    vi.mocked(exportBackup).mockRejectedValueOnce(new Error('broken data'));
    localStorage.setItem('flipside:v1', '{"version":1}');
    const create = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    render(ErrorPage, { error: new Error('x') });
    await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('says so when there is nothing to download', async () => {
    vi.mocked(exportBackup).mockRejectedValueOnce(new Error('broken data'));
    localStorage.removeItem('flipside:v1');
    render(ErrorPage, { error: new Error('x') });
    await fireEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    expect(await screen.findByText('There was nothing to download.')).toBeInTheDocument();
  });
});
