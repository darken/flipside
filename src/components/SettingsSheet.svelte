<script lang="ts">
  import { onMount } from 'svelte';
  import { formatRelative, todayKey } from '$lib/model/dates';
  import type { AppData } from '$lib/model/types';
  import { THEMES, type PortableSettings, type Theme } from '$lib/settings/types';
  import { settings } from '$lib/settings/settings.svelte';
  import { app } from '$lib/store/app.svelte';
  import {
    MAX_BACKUP_BYTES,
    backupNudge,
    describePreview,
    exportBackup,
    previewBackup,
    readBackup,
  } from '$lib/store/backup';
  import { browserStorage, isSafariTab, storageInfo, type StorageInfo } from '$lib/store/persist';
  import { nudge } from '$lib/ui/nudge.svelte';
  import { pwa } from '$lib/ui/pwa.svelte';
  import { reloadApp } from '$lib/ui/reload';
  import { sheets } from '$lib/ui/sheets.svelte';
  import { toasts } from '$lib/ui/toast.svelte';
  import Segmented from './Segmented.svelte';
  import Sheet from './Sheet.svelte';

  type Props = { onclose: () => void };
  let { onclose }: Props = $props();

  type Pending = {
    name: string;
    data: AppData;
    settings: PortableSettings | null;
    dropped: number;
  };

  let view = $state<'main' | 'import' | 'erase1' | 'erase2'>('main');
  let scroller: HTMLElement | undefined = $state();
  let dataSection: HTMLElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let working = $state(false);
  let importError = $state('');
  let pending = $state<Pending | null>(null);
  let confirmText = $state('');
  let info = $state<StorageInfo | null>(null);

  const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
  const safariTab = isSafariTab();

  const nudgeState = $derived(backupNudge(settings.value, app.data, new Date()));
  const lastBackup = $derived(
    settings.lastBackupAt
      ? formatRelative(todayKey(new Date(settings.lastBackupAt)), app.today)
      : null,
  );
  const current = $derived(describePreview(previewBackup(app.data)));
  const confirmed = $derived(confirmText.trim().toLowerCase() === 'erase');

  onMount(() => {
    void storageInfo(browserStorage()).then((result) => (info = result));
    if (sheets.section === 'data') {
      sheets.section = null;
      dataSection?.scrollIntoView?.({ block: 'start' });
      dataSection?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    }
  });

  const kb = (bytes: number) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  };

  // ---- Backup -------------------------------------------------------------------------------

  async function backUp() {
    if (working) return;
    working = true;
    try {
      const now = new Date();
      const outcome = await exportBackup($state.snapshot(app.data) as AppData, settings.value, now);
      if (outcome === 'cancelled') return;
      settings.update({ lastBackupAt: now.toISOString() });
      nudge.dismiss();
      toasts.show(outcome === 'shared' ? 'Backup shared' : 'Backup downloaded');
    } finally {
      working = false;
    }
  }

  // ---- Import -------------------------------------------------------------------------------

  const readText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  async function onFile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires
    if (!file) return;
    importError = '';
    if (file.size > MAX_BACKUP_BYTES) {
      importError = 'The file is too large (over 10 MB)';
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch {
      importError = 'The file could not be read';
      return;
    }
    const result = readBackup(text);
    if (!result.ok) {
      importError = result.error;
      return;
    }
    pending = {
      name: file.name,
      data: result.data,
      settings: result.settings,
      dropped: result.dropped,
    };
    view = 'import';
  }

  function confirmImport() {
    if (!pending) return;
    const { data, settings: imported } = pending;
    const before = settings.value;
    const key = app.replaceAll(data);
    if (imported) settings.update({ theme: imported.theme, autoFlip: imported.autoFlip });
    pending = null;
    onclose();
    toasts.show(key ? 'Backup imported' : 'Backup imported (it cannot be undone)', {
      duration: 10_000,
      ...(key && {
        action: {
          label: 'Undo',
          run: () => {
            if (app.restoreSafetyCopy(key)) {
              settings.update({ theme: before.theme, autoFlip: before.autoFlip });
              toasts.show('Import undone');
            } else {
              toasts.show('Could not undo: the saved copy is gone');
            }
          },
        },
      }),
    });
  }

  function cancelImport() {
    pending = null;
    view = 'main';
  }

  // ---- Erase --------------------------------------------------------------------------------

  function erase() {
    if (!confirmed) return;
    app.eraseEverything();
    reloadApp();
  }

  function startErase() {
    confirmText = '';
    view = 'erase1';
  }
</script>

<Sheet title="Settings" variant="lined" {onclose} bind:scroller>
  {#if view === 'main'}
    <section class="group" aria-labelledby="h-appearance">
      <h2 id="h-appearance">Appearance</h2>
      <Segmented
        name="theme"
        legend="Theme"
        options={THEMES.map((t) => ({ value: t, label: THEME_LABELS[t] }))}
        value={settings.theme}
        onchange={(theme) => settings.update({ theme })}
      />
    </section>

    <section class="group" aria-labelledby="h-behaviour">
      <h2 id="h-behaviour">Behaviour</h2>
      <label class="switch">
        <span>Auto-flip when done</span>
        <input
          type="checkbox"
          role="switch"
          checked={settings.autoFlip}
          onchange={(e) => settings.update({ autoFlip: e.currentTarget.checked })}
        />
      </label>
      <p class="hint">Turns the page to the done list when you check off the last task.</p>
    </section>

    <section class="group" aria-labelledby="h-data" bind:this={dataSection}>
      <h2 id="h-data" tabindex="-1">Your data</h2>

      {#if !app.storageOk}
        <p class="warn" role="alert">Changes aren't being saved on this device</p>
      {/if}

      {#if nudgeState.due}
        <p class="note due">
          No backup for {nudgeState.days} days ·
          <button type="button" class="link" onclick={backUp}>Download now</button>
        </p>
      {:else}
        <p class="note">
          {lastBackup ? `Last backup: ${lastBackup}` : 'No backup yet'}
        </p>
      {/if}

      <div class="buttons">
        <button type="button" class="btn primary" disabled={working} onclick={backUp}>
          Download backup
        </button>
        <button type="button" class="btn" onclick={() => fileInput?.click()}>Import backup…</button>
        <input
          bind:this={fileInput}
          class="sr-only"
          type="file"
          accept=".json,application/json"
          aria-label="Backup file"
          tabindex="-1"
          onchange={onFile}
        />
      </div>
      {#if importError}
        <p class="warn" role="alert">{importError}</p>
      {/if}

      <p class="hint">
        {#if info}
          {kb(info.dataBytes)} of notes
          {#if info.usage !== null && info.quota !== null}
            · {kb(info.usage)} used of {kb(info.quota)} browser storage
          {/if}
        {:else}
          Checking storage…
        {/if}
      </p>
      {#if info?.persisted === true}
        <p class="ok">Protected from automatic clearing</p>
      {:else if info?.persisted === false}
        <p class="hint">The browser may clear this data if it runs low on space.</p>
      {/if}
      {#if safariTab}
        <p class="note">Add Flipside to your Home Screen to keep your data safe</p>
      {/if}
    </section>

    <section class="group" aria-labelledby="h-about">
      <h2 id="h-about">About</h2>
      <p class="hint">
        Flipside {__APP_VERSION__} · built {new Date(__BUILD_DATE__).toLocaleDateString()}
      </p>
      {#if pwa.needRefresh}
        <button type="button" class="btn" onclick={() => (pwa.update ? pwa.update() : reloadApp())}>
          Update available · Reload
        </button>
      {/if}
    </section>

    <section class="group danger" aria-labelledby="h-danger">
      <h2 id="h-danger">Danger zone</h2>
      <button type="button" class="btn danger-btn" onclick={startErase}>Erase all data</button>
    </section>
  {:else if view === 'import' && pending}
    <section class="group" aria-labelledby="h-import">
      <button type="button" class="link back" onclick={cancelImport}>‹ Settings</button>
      <h2 id="h-import">Import backup</h2>
      <dl class="compare">
        <dt>This backup ({pending.name})</dt>
        <dd>{describePreview(previewBackup(pending.data))}</dd>
        <dt>On this device now</dt>
        <dd>{current}</dd>
      </dl>
      {#if pending.dropped > 0}
        <p class="hint">
          {pending.dropped} damaged {pending.dropped === 1 ? 'item was' : 'items were'} left out.
        </p>
      {/if}
      <p class="warn strong">
        This replaces everything on this device. A copy of your current data is kept so you can undo
        it right after.
      </p>
      <div class="buttons">
        <button type="button" class="btn danger-btn" onclick={confirmImport}>
          Replace everything
        </button>
        <button type="button" class="btn" onclick={cancelImport}>Cancel</button>
      </div>
    </section>
  {:else if view === 'erase1'}
    <section class="group" aria-labelledby="h-erase">
      <button type="button" class="link back" onclick={() => (view = 'main')}>‹ Settings</button>
      <h2 id="h-erase">Erase everything?</h2>
      <p class="warn strong">
        This deletes all your pages, routines, settings and saved copies from this device. There is
        no undo.
      </p>
      <div class="buttons">
        <button type="button" class="btn primary" disabled={working} onclick={backUp}>
          Download a backup first
        </button>
        <button type="button" class="btn danger-btn" onclick={() => (view = 'erase2')}>
          Erase everything
        </button>
        <button type="button" class="btn" onclick={() => (view = 'main')}>Cancel</button>
      </div>
    </section>
  {:else if view === 'erase2'}
    <section class="group" aria-labelledby="h-erase2">
      <button type="button" class="link back" onclick={() => (view = 'erase1')}>‹ Back</button>
      <h2 id="h-erase2">Are you sure?</h2>
      <label class="confirm">
        Type <strong>erase</strong> to confirm
        <input
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={confirmText}
        />
      </label>
      <div class="buttons">
        <button type="button" class="btn danger-btn" disabled={!confirmed} onclick={erase}>
          Erase everything
        </button>
        <button type="button" class="btn" onclick={() => (view = 'main')}>Cancel</button>
      </div>
    </section>
  {/if}
</Sheet>

<style>
  .group {
    margin-top: var(--space-5);
  }
  .group:first-child {
    margin-top: var(--space-2);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-family: var(--font-hand);
    font-size: 1.5rem;
    line-height: 1.2;
  }
  h2:focus-visible {
    outline-offset: 2px;
  }
  .hint,
  .note,
  .ok,
  .warn {
    margin: var(--space-2) 0 0;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .hint {
    color: var(--ink-soft);
  }
  .ok {
    color: var(--accent);
    font-weight: 600;
  }
  .note.due {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--margin-line) 18%, var(--paper-cream));
    font-weight: 600;
  }
  .warn {
    color: var(--danger);
  }
  .warn.strong {
    font-weight: 600;
  }

  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--tap-target);
    font-weight: 600;
    cursor: pointer;
  }
  .switch input {
    appearance: none;
    flex: none;
    position: relative;
    width: 48px;
    height: 28px;
    margin: 0;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: var(--paper-cream);
    cursor: pointer;
  }
  .switch input::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    transition: transform 150ms ease;
  }
  .switch input:checked {
    background: var(--accent);
  }
  .switch input:checked::after {
    background: var(--paper-cream);
    transform: translateX(20px);
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .btn {
    min-height: var(--tap-target);
    padding: 0 var(--space-4);
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: transparent;
    color: var(--accent);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn.primary {
    background: var(--accent);
    color: var(--paper-cream);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .danger-btn {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--on-danger);
  }
  .danger h2 {
    color: var(--danger);
  }
  .danger .danger-btn {
    background: transparent;
    color: var(--danger);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .back {
    min-height: var(--tap-target);
    margin-bottom: var(--space-1);
  }

  .compare {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  .compare dt {
    margin-top: var(--space-2);
    font-weight: 600;
    color: var(--ink-soft);
  }
  .compare dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .confirm {
    display: block;
    font-size: 0.9375rem;
  }
  .confirm input {
    display: block;
    width: 100%;
    min-height: var(--tap-target);
    margin-top: var(--space-2);
    padding: 0 var(--space-3);
    border: 1px solid var(--accent);
    border-radius: var(--radius-md);
    background: var(--paper-cream);
    color: var(--ink);
    font: inherit;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
