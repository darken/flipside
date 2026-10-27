# Flipside

A mobile-first daily todo app. Each day is a page of a vertical notepad: the front shows the todo list and the back shows the done list. You flip the page to switch sides, and scrolling down peels the page up to reveal the previous day underneath. There is also a stats view of completed tasks.

It is a frontend-only single-page app with no backend. All data lives in `localStorage` and can be downloaded or imported as a JSON backup.

> Status: all phases are built: 1 (scaffold), 2 (data layer), 3 (today page), 4 (flip), 5 (notepad stack), 6 (stats), 7 (backup and settings), 8 (polish and QA: the code, checks and docs; the real-device run of `docs/qa-checklist.md` is still to be done before tagging `v1.0.0`) and 9 (deploy: Vercel at https://flipside-self.vercel.app, GitHub Actions CI). Update this file when commands or structure change.

## Stack

- Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`), TypeScript (strict), Vite
- `vite-plugin-pwa`: offline support and installable on a phone
- Vitest + `@testing-library/svelte` for unit and component tests; Playwright (mobile viewports) for e2e
- Plain CSS with custom properties. No UI or CSS framework, no chart library: charts are hand-written SVG.
- Fonts: Caveat or Patrick Hand for headings (handwriting), Inter for body text

## Commands

Package manager: **pnpm** (don't use npm or yarn, and don't commit other lockfiles). Node 24 LTS (`.nvmrc`; `engines` allows >=22). TypeScript is pinned to 6.x because `svelte-check` and `typescript-eslint` don't support 7 yet.

```bash
pnpm install
pnpm dev           # Vite dev server
pnpm build         # production build
pnpm preview       # serve the build
pnpm check         # svelte-check + tsc (node configs)
pnpm lint          # ESLint + Prettier --check
pnpm format        # Prettier --write
pnpm icons         # regenerate PWA icons and the iOS launch screens (public/apple-splash-*) from public/icon.svg; paste new <link> lines into index.html if the device list changes
pnpm test          # Vitest (TZ fixed to America/New_York)
pnpm test:coverage # Vitest + coverage for src/lib (thresholds enforced)
pnpm test:e2e      # Playwright (iPhone 14 on WebKit + Pixel 7 on Chromium); builds and serves the preview itself
pnpm size          # size budget for dist/ (run pnpm build first)
pnpm lighthouse    # Lighthouse CI on the build: mobile, 3 runs, limits in lighthouserc.json (needs Chrome; set CHROME_PATH if not found)
pnpm screenshots   # captures public/screenshots/*.jpg (install prompt and README) from the seeded app
pnpm analyze       # build + stats.html (rollup-plugin-visualizer treemap; not part of normal builds)
pnpm verify        # check + lint + test
```

## Structure

Path aliases: `$lib` → `src/lib`, `$components` → `src/components`. Unit tests sit next to the code as `*.test.ts`.

```
docs/qa-checklist.md       # the real-device script (see "Quality checks")
scripts/size.mjs            # size budget (pnpm size)
lighthouserc.json, vercel.json   # Lighthouse limits; hosting headers (cache + CSP)
tests/
  setup.ts                  # Vitest setup: fake localStorage, deterministic crypto.randomUUID, sheet chunks preloaded
  memory-storage.ts, fixtures.ts   # test helpers
  e2e/                      # Playwright specs: flows, a11y (axe), install/offline/update, csp, phone; seed-data.ts, static-server.ts
  screenshots/              # pnpm screenshots (own config: playwright.screenshots.config.ts)
src/
  lib/
    model/types.ts          # Task, Day, Routine, AppData
    model/dates.ts          # local-date helpers (YYYY-MM-DD), formatHeading, formatRelative, isPast, dayAccess, formatDoneAt
    model/tasks.ts          # pure task ops on a Day (add, edit, move, copyToToday), selectors
    store/app.svelte.ts     # AppStore ($state), exported as `app`; rollover, cross-tab sync
    store/guard.ts          # assertEditable (today only) / assertCanCheck (today and yesterday) / ReadOnlyDayError
    store/persist.ts        # localStorage load/save, debounced saver, migrate, corrupt backup
    store/routines.ts       # ensureDay, makeRoutine, stopRoutine, renameRoutine
    store/validate.ts       # parseAppData: hand-written validation, reused by import
    ui/toast.svelte.ts      # toast queue (`toasts`), shown by Toast.svelte
    ui/guarded.ts           # guarded(): turns ReadOnlyDayError into a toast
    ui/gesture.ts           # direction locking + GestureArbiter: a swipe flips or peels, never both
    ui/peel.ts              # pure peel maths: dead zone, progress, commit, momentum guard, neighbours(), skippedBetween()
    ui/peelGesture.ts       # touch/pointer/wheel controller that turns a pull at the end of a list into a peel
    ui/history.ts           # LayerHistory: one browser-history entry per layer (`past`, `stats`, `settings`); close() resolves after the popstate
    ui/sheet.ts, ui/views.ts   # slideUp transition (crossfade on reduced motion); context keys App uses to offer openStats / openSettings
    ui/sheets.svelte.ts, ui/nudge.svelte.ts, ui/pwa.svelte.ts, ui/reload.ts   # open sheet; reminder note state; "update available"; reloadApp()
    ui/page-memory.ts       # what a page remembers while off screen (side, scroll), and the PageNav type
    ui/inert.ts, ui/portal.ts   # `inert` attribute action; move an element to <body>
    ui/flip.ts              # pure flip maths (angles, swipe rules, easing) and shouldAutoFlip
    ui/busy.svelte.ts       # lock held during drag/edit/menu so the page cannot flip
    ui/motion.ts, ui/autosize.ts   # reduced-motion helpers, task fade, textarea autosize
    dev/seed.ts             # seedData(): realistic sample data; `?seed=N` in the dev server only; also used by screenshots and the perf test
    ui/crash.ts             # reportError (console + one toast "Something went wrong · Reload"), installGlobalHandlers (error, unhandledrejection)
    ui/haptics.ts           # haptic(): one short vibration (10 ms), skipped for reduced motion
    ui/viewport.ts          # watchKeyboard(): sizes the page to the visual viewport while an iOS keyboard is up
    ui/sheet-modules.svelte.ts   # Stats and Settings as lazy chunks (loaded on open and when idle)
    store/backup.ts         # makeBackup/readBackup/previewBackup, exportBackup (share sheet or download), backupNudge
    settings/settings.svelte.ts   # `settings` ($state, own localStorage key, cross-tab sync); types.ts (shape, parseSettings); theme.ts (applyTheme)
    stats/compute.ts        # pure stats: dailyCounts, streaks, summary, routineStats, weekdayAverages, heatmap, skippedBefore
    stats/scale.ts          # niceTicks(max): rounded axis ticks
  components/
    NotepadStack.svelte     # the stack of day pages: peel, Today, goTo(key), history, rollover
    DayPage.svelte          # one day: FlipCard + flip button + auto-flip; owns the page's `side`
    FlipCard.svelte         # two-sided 3D card: flip animation and swipe gesture
    Face.svelte             # one side of the page: date header + the scrolling, ruled body
    TodoSide.svelte, DoneSide.svelte, TaskItem.svelte, TaskInput.svelte, TaskMenu.svelte, Toast.svelte
    StatsView.svelte        # the stats sheet (graph paper) over the notepad
    charts/BarChart.svelte, charts/Heatmap.svelte
    Sheet.svelte            # shared slide-up sheet: header, ×, Escape, swipe down, focus, scroll area (graph or lined)
    SettingsSheet.svelte    # theme, auto-flip, backup/import/erase, storage info, about
    BackupNudge.svelte      # the reminder note under the date header on today's page
    Segmented.svelte        # radio-group pill switch (range, theme)
    ErrorPage.svelte        # "Something went wrong. Your data is safe." with Reload and Download backup (the `failed` snippet of the error boundaries)
  styles/tokens.css, paper.css
  App.svelte                # owns the shared LayerHistory and the open sheet (`sheets`): Notepad + Stats / Settings sheet, each inside <svelte:boundary>
```

## Data model

```ts
type Task = {
  id: string;
  text: string; // multi-line; keep newlines as-is
  routineId?: string; // set when this task comes from a Routine
  createdAt: string; // ISO timestamp
  doneAt?: string; // set = on the done list
  order: number;
};
type Day = { date: string /* YYYY-MM-DD, local time */; tasks: Task[] };
type Routine = { id: string; text: string; active: boolean; createdAt: string };
type AppData = { version: 1; days: Record<string, Day>; routines: Routine[] };
```

## Domain rules

- **Todo vs. done:** a task is done when `doneAt` is set. Unchecking clears it. There are no separate lists in storage.
- **Routines:** the first time a day is opened, add one fresh, undone task for each active routine (linked by `routineId`). Never add the same routine twice to one day. Missed days are not filled in. Turning the routine flag off makes it inactive; past instances keep their `routineId` (stats need it).
- **Editing a routine task's text** is allowed and also renames the routine, so future days use the new text. Past instances keep their old text.
- **Three levels of access** (`dayAccess(key, today)` in `dates.ts`, shared by store and UI):
  - `'full'` (today): everything.
  - `'check-only'` (the calendar day before today, even when the days before it were skipped): checking and unchecking tasks only. No adding, editing, deleting, reordering or routine on/off; "Copy to today" still works.
  - `'read-only'` (anything older): nothing.
  - Enforce this in the store, not only in the UI: `toggleDone` uses `assertCanCheck` (today and yesterday); every other change uses `assertEditable` (today only). Both throw `ReadOnlyDayError`. `app.isEditable(key)` means fully editable, `app.canCheck(key)` means today or yesterday. At midnight `tick()` (which runs before every change) moves the levels along: the old yesterday is read-only, the old today is check-only.
  - A task checked on yesterday records the real time in `doneAt` (possibly the next day), and still counts on its page's date in Stats.
- **Unfinished one-off tasks** stay on their own day. Past pages offer "Copy to today", which adds a new task to today and leaves the past day unchanged.
- **Future days** are not supported yet.
- **Dates** are always the user's local calendar date. Never derive them from `toISOString()` (that is UTC and shifts the day). Use the helpers in `dates.ts`.

## Persistence

- One localStorage key: `flipside:v1`. Save about 300 ms after each change. Wrap every read and write in try/catch, and fall back to in-memory state if storage is unavailable.
- Corrupt data is copied to `flipside:v1:corrupt-<timestamp>` and the app starts empty. A failed save sets `app.storageOk = false`; the app keeps working in memory. Another tab's save is picked up through the `storage` event.
- **Day rollover:** `app.tick()` runs every minute and on `visibilitychange`, and before every mutation, so the new day opens with its routine tasks and yesterday turns read-only.
- Any change to the shape of `AppData` bumps `version` and adds a migration in `persist.ts`.
- **Settings** live under their own key, `flipside:settings:v1`: `{ version: 1, theme: 'system' | 'light' | 'dark', autoFlip: boolean, lastBackupAt?, backupNudgeShownAt? }` (the two stamps belong to this device). `settings` (`settings.svelte.ts`) loads defaults for anything missing or invalid, saves straight away, syncs between tabs through the `storage` event, and `main.ts` calls `settings.init()`. `AppData` and its version are untouched. Week start stays automatic (locale, Monday fallback): there is no setting for it.
- **Theme:** `applyTheme()` sets `data-theme` on `<html>` (removed for "system") and the `<meta name="theme-color">` tags (restored for "system"); changes crossfade colours for 200 ms via `html.theme-fade` (instant with reduced motion). An inline script in `index.html` reads `flipside:settings:v1` and sets both before the first paint, in try/catch: keep it in step with `applyTheme` and `THEME_COLORS`.
- **Backup file** (`store/backup.ts`): `{ "app": "flipside", "backupVersion": 1, "exportedAt", "data": AppData, "settings": { version, theme, autoFlip } }`, without the device-only stamps. `readBackup` rejects files over 10 MB, checks the marker, runs `migrate()` and `parseAppData()` (an invalid `settings` part is ignored; a bare `AppData` object is accepted) and gives "Not a Flipside backup", "This backup is from a newer version of Flipside" or "The file is damaged". Filename `flipside-backup-YYYY-MM-DD.json` (local date).
- **Download:** `exportBackup()` uses `navigator.share({ files })` where `canShare({ files })` allows it (phones), else an `<a download>`. Closing the share sheet (`AbortError`) records nothing; a finished backup sets `lastBackupAt`.
- **Import replaces everything** (no merge): file picker → preview next to the current figures → confirm → `app.replaceAll(data)`: copies the current data to `flipside:v1:before-import-<timestamp>` (only the latest is kept), cancels a pending save, swaps the data (past days are not read-only here), makes sure today has its routines, saves at once (other tabs follow via `storage`) and bumps `app.epoch` so the notepad returns to today. The backup's theme and auto-flip are applied. A toast "Backup imported · Undo" (10 s) calls `app.restoreSafetyCopy(key)` and restores the previous settings.
- **Keeping data safe:** the first `app.add()` calls `navigator.storage.persist()` once. Settings shows the data size, `navigator.storage.estimate()`, "Protected from automatic clearing" when granted, and in a normal Safari tab (not installed) "Add Flipside to your Home Screen…" because Safari may delete site data after 7 days without a visit. `storageOk = false` shows "Changes aren't being saved on this device".
- **Backup reminder:** `backupNudge(settings, data, now)` is due with at least 7 days of pages and either `lastBackupAt` 30+ days ago, or no backup ever and a first page 30+ days old. Settings turns the "Last backup" line into "No backup for N days · Download now" while due. On today's page `BackupNudge` shows once per app start at most once every 30 days (`backupNudgeShownAt`), until dismissed or backed up; never on past pages or while a sheet or the task menu is open. "Back up" opens Settings at "Your data".
- **Erase all data** (Settings, "Danger zone"): sheet 1 offers "Download a backup first" or "Erase everything", step 2 needs `erase` typed. It removes every `flipside:*` key (data, settings, corrupt and safety copies), then reloads; no undo.

## UI and animation

- Mobile first: design at 375px width, with 44px minimum tap targets and safe-area insets (`env(safe-area-inset-*)`).
- **One-screen pages:** a page is exactly one screen (`--page-height`: `100dvh` minus the safe areas). The document never scrolls; each _face_ scrolls inside itself (`.scroll`: `overflow-y: auto`, `overscroll-behavior: contain`, ruled lines with `background-attachment: local`), so the 3D layer stays one screen tall and each face remembers its own scroll position. Absolutely positioned bits inside a face need the scroller to be `position: relative`, or they escape its clip and make the document scroll. **Phase 5 design point:** one page is one screen in the stack; pulling up from the bottom of a list hands off to the peel there.
- **Flip (`FlipCard`):** `perspective: 1400px` on the stage, `transform-style: preserve-3d` on the card, two faces in one grid cell, the back at `rotateY(180deg)`, `backface-visibility: hidden` with the `-webkit-` prefix and `translateZ(0)` on each face. Both faces stay mounted; the hidden one gets `inert` (set as an attribute) and `aria-hidden`. **Never put `overflow: hidden` (or any non-`visible` overflow) on the stage, the card or anything above them, and not on `.paper`: it flattens the 3D context and breaks the flip on iOS Safari.** `will-change: transform` is set only while a flip runs.
- **Flip motion:** Web Animations API on `transform` and `opacity` only, so it can be cancelled or reversed part way. About 600 ms, `cubic-bezier(0.2, 0.7, 0.2, 1)` (sampled into keyframes by `flip.ts`), around the vertical centre line, with scale 0.96 and a 4° `rotateX` tilt at the midpoint, a shade overlay on each face and a glow layer for the shadow. The button always turns the page right to left; a swipe turns it the way the finger goes. When it finishes, focus moves to the new face's `h1` and an `aria-live` region says "Done list, 5 tasks".
- **Swipe to flip:** touch and pen only (mouse users have the button and the **F** key; F is ignored while typing or when a modifier is held). After about 10 px the gesture locks to horizontal or vertical; vertical is left to the face's scrolling (`touch-action: pan-y` on the stage, the faces and the scrollers). The angle follows the finger (`dx / width × 180°`); on release it finishes past 90° or on a fling faster than 0.5 px/ms in the drag's direction, otherwise it springs back. A swipe does not start in a text field, on a drag handle, within 20 px of a screen edge, or while `busy` is held (drag, edit, open menu). Swipes during a running flip are ignored; the button and F reverse it.
- **Auto-flip:** checking off the last open task on today's page (todo 1 → 0) turns the page to the done side after 400 ms, once per page, and shows the "All done ✓" stamp. It never happens after deleting or copying, on past pages, while something holds `busy`, or when already on the back (`shouldAutoFlip` in `flip.ts`). It is the "Auto-flip when done" setting (`settings.autoFlip`, passed to `shouldAutoFlip` as `enabled`). It works on any page where `canCheck` is true, so on yesterday too (`AutoFlipContext.canCheck`).
- **Side state:** `DayPage` keeps its `side` in memory only; every page opens on the to-do side, and a new day starts on the front.
- **Dialogs and fixed elements inside a face are trapped** by the transformed ancestor (`position: fixed` is then relative to the card). `TaskMenu` therefore moves itself to `<body>` with the `portal` action.
- **Day stack (`NotepadStack`):** a custom peel gesture, not scroll-snap. Pulling past the end of the visible list lifts the current page up and away (`translateY` to -100%, `rotateX` up to 12° from the top edge, a growing shadow) to reveal the older page, which scales 0.96 → 1 as its dark overlay fades; pulling down at the top brings the newer page back down. About 450 ms with the flip's curve. Only `transform` and `opacity` animate; `will-change` is set only during a peel.
- **Three pages only:** the newer page waiting above, the current page, the older page below (`neighbours()` over `app.dayKeys`, saved days only). Each is a `DayPage` inside a `.sheet` wrapper; the peel transform is on the wrapper, outside `FlipCard`, so the two 3D effects do not interfere. Pages that are not on top are `inert` and `aria-hidden`. `PageMemory` (side, scroll positions, auto-flipped) lives in the stack so pages remember themselves while unmounted.
- **Peel hand-off rules:** the list must be at its end (bottom for older, top for newer, or fit on screen) _when the finger touches down_ (momentum guard: a list that merely reaches its end during the same touch or by momentum needs a new touch); then a vertical drag; the page only follows after a 24 px dead zone; it completes past 35 % or on a pull faster than 0.5 px/ms, otherwise it springs back. Touch uses `touchstart`/non-passive `touchmove` (the stage has `touch-action: pan-y`, so the browser cancels pointer events when it scrolls) and calls `preventDefault()` only once the peel owns the gesture; mouse and pen use Pointer Events. A swipe may start on the new-task field unless it is focused. At the ends of the stack the page stretches with resistance ("This is your first page" on the oldest page).
- **One gesture at a time:** `gestures` (`gesture.ts`) lets a swipe either flip (horizontal) or peel (vertical); whoever locks first owns it. A running flip or peel, and anything holding `busy`, blocks the other.
- **Other ways to turn:** "‹ Newer" / "Older ›" buttons in each page header (also for screen readers), Alt+↓ (older) / Alt+↑ (newer), and a wheel or trackpad event of about 120 px at the end of a list after a 200 ms pause (one page per burst). The Today button (past pages only) animates back through at most 5 newer pages, ~100 ms each; any more are skipped instantly. `goTo(key)` (exported by `NotepadStack`) jumps to a day, or the nearest day that has a page. **Phase 6:** heatmap cells call `goTo`. **Planned for 1.1 (optional):** a calendar sheet from the date header.
- **Past pages:** softer ink (`--ink-past`), "Yesterday" / "3 days ago" in the header (the caption text is the same on every page), a Today button, and "Copy to today" on unfinished one-off tasks. `Face` takes `access`: **older pages** show the lock icon (`aria-label` "Read-only") and disabled checkboxes; **yesterday** shows a ✓-in-a-circle icon (`aria-hidden`, same size and place as the lock) and working checkboxes, which keep full ink through `.can-check` on the row (`--ink-strong`, defined in `paper.css`, because the page switches `--ink` to the past colour). `DayPage` passes `editable` and `canCheck` down through `TodoSide`/`DoneSide` to `TaskItem`. Missed days have no page and are skipped; the page below a gap shows "2 days skipped" at the top of its list.
- **Back button (`LayerHistory`):** one history entry per layer, however many pages you peel; Back closes the top layer. Peeling away from today opens the `past` layer; Back on a past page animates to today; Today or peeling back to today removes the entry with `history.back()`; Back on today leaves the app. A reload opens on today and clears any leftover entry. `stats` and `settings` are further layers (one sheet at a time, opened from `App`); the task menu could be one too.
- **New day while open:** on today, the new day lays down on top, the old today becomes the check-only page below, and a toast says "It's a new day. You can still check off yesterday's tasks." On a past page nothing moves (a page that was yesterday switches to the read-only look when its day ends); Today and Back lead to the new day. A change refused because the page just became read-only shows "It's a new day. That page is now read-only." (`guarded()`).
- **After a peel:** focus moves to the new page's date heading and an `aria-live` message reads "Friday, October 24 · Yesterday · check-off only" (older pages: "· read-only"; plus "2 days skipped").
- Animate only `transform` and `opacity`. Aim for 60 fps on mid-range phones.
- **Motion tokens:** every duration and easing is defined once, in `MOTION` / `EASE_PAGE` (`ui/motion.ts`) and as `--dur-fast|base|sheet|peel|flip` / `--ease-page` / `--ease-out` in `tokens.css`; `motion.test.ts` keeps the two in step. `flip.ts`, `peel.ts` and `sheet.ts` take their durations from `MOTION`; CSS uses the variables. Add new motion there, not as literals.
- **Haptics** (`haptic()`, Android only; iOS has no vibration API): one 10 ms pulse, the same everywhere: checking a task, picking a task up to drag, a flip finishing and a peel landing. Nothing for reduced motion.
- With `prefers-reduced-motion` on, the flip becomes a 150 ms crossfade (no 3D, no tilt; swipes still switch sides but nothing follows the finger) and the peel becomes a plain scroll. The crossfade uses WAAPI because the global reduced-motion CSS zeroes CSS transitions.
- The flip button (turned corner, bottom right) has `aria-label` "Show done list" / "Show to-do list", `aria-pressed` and shows the other side's count; the count bumps when it changes.
- Header on every face: date line (with Stats and Settings) and a caption line (side · how long ago · lock) with the page buttons. Long dates shrink with `clamp()`.
- Colours, spacing and shadows come from `tokens.css`, with light (paper) and dark themes.

## Stats

Everything is computed from `AppData`, `today` and the week start by pure functions in `stats/compute.ts`.

- **Done task:** `doneAt` set, counted on its page's date. **Active day:** a day with a saved page; a **missed day** has none.
- **Streak:** consecutive calendar days with at least one task done. It ends today or yesterday (a day still in progress does not break it); a missed day or a day with nothing done ends it.
- **Routine completion %:** done instances / instances that existed (only days where the routine was added), matched by `routineId` so renames keep history. Stopped routines with nothing in range are left out; the rest fold under "Stopped (n)". The 14-day strip is done / missed / none (no page, or routine not added).
- **Day completion rate:** done / all tasks on the page. **Average:** done per active day. **Change:** against the previous period of the same length, null when that period has no done tasks.
- **Today is included in every figure as it stands.** Ranges never reach past today.
- **Week start:** `weekStart(locale)` in `dates.ts` reads `Intl.Locale#getWeekInfo()` (or the older `weekInfo`), returns 0–6 (0 = Sunday) and falls back to Monday. `StatsView` reads it once when it opens; heatmap rows and weekday bars start there.
- **Heatmap levels:** 0 = nothing done. Days (in the drawn grid, up to today) with something done are split into quarters by nearest-rank quartiles (`cuts`); with fewer than 8 such days, fixed cuts: 1, 2–3, 4–5, 6+. 53 weeks are drawn and the scroller opens on the current week. "N days skipped before" counts page-less days directly before that date.
- **Colours:** `--viz-1`…`--viz-4` (sequential blue in the ink colour), `--viz-empty`, `--viz-today`, `--viz-grid` in `tokens.css`, for light and dark. Colour is never the only signal: tap labels give exact numbers.
- **Sheet:** the Stats and Settings buttons (every page header) open `StatsView` / `SettingsSheet`, both built on the shared `Sheet.svelte` (graph paper or lined card, ×, Escape, swipe down, focus on the heading), over the notepad (`slideUp`, ~350 ms; 150 ms crossfade on reduced motion). It is a `stats` (or `settings`) layer in the shared `LayerHistory` (App owns it and passes it to `NotepadStack`), so Back, ×, Escape or a swipe down close it; from a past page the layers are `past` then `stats`. The notepad is `inert` while it is open and focus moves to the sheet's heading.
- **Chart → page:** "Open page" (or Enter) calls `openDay(key)` in `App`: close the `stats` layer (awaiting its popstate), then `NotepadStack.goTo(key)`, which opens the `past` layer, so Back goes from there to today.
- **Accessibility:** each chart is `<svg role="img">` with a summary label plus a visually hidden table (wrapped in a `div.sr-only`: a bare `table.sr-only` still stretches the scroller); tiles are a `<dl>`; the range switch is a radio group; the heatmap is a roving-tabindex grid (arrows move, Enter opens) and the bar chart takes arrow keys too.
- PWA updates: `registerType: 'prompt'` (`workbox-window` is a dev dependency bundled by Vite); `main.ts` registers the service worker and a waiting version shows as "Update available · Reload" in Settings. `__APP_VERSION__` / `__BUILD_DATE__` come from `vite.config.ts`. Danger colours are `--danger` / `--on-danger` in `tokens.css`.
- `.row` is a global class in `paper.css`; chart markup must not reuse it.

## Quality checks and limits

CI (`.github/workflows/ci.yml`) has three jobs; all must pass.

- **verify:** `pnpm verify`, `pnpm build`, then `pnpm size`: fails over **60 KB gzipped JS**, **15 KB gzipped CSS**, **120 KB Latin woff2 fonts** (the `-ext` font files only load for those letters and are not counted). Today: about 54 / 9 / 97 KB.
- **e2e:** `pnpm test:e2e` on WebKit (iPhone 14) and Chromium (Pixel 7) against the production build (served by `vite preview` with the same headers as Vercel). Traces and screenshots upload when it fails. It includes:
  - `a11y.spec.ts`: axe scans of today, the done side, a past page, Stats, Settings, the import preview and both erase steps, in light and dark; any **serious or critical** violation fails.
  - `install.spec.ts` (Chromium only): manifest fields and screenshots, service worker registered, reload while offline (add, flip, Stats, backup), and the update flow with two builds (`dist-v2` is built with `FLIPSIDE_VERSION=9.9.9`, served by `static-server.ts`, and "Update available · Reload" must bring it in).
  - `csp.spec.ts` (no CSP violations while using every screen), `phone.spec.ts` (inputs at least 16px, a 2,000-character task, 200 tasks, emoji and right-to-left text, landscape).
- **lighthouse:** `pnpm lighthouse` (`lighthouserc.json`), mobile profile, 3 runs, the **median run** counts. Fails: Accessibility below 100, Best Practices below 95, SEO below 90, layout shift over 0.05, Performance below 90. **Warns:** Performance below 95. Lighthouse has no PWA category, so install checks are in Playwright. `lighthouse-preview.yml` runs the same limits on each Vercel preview deployment (`deployment_status`); if Deployment Protection is on, set the `VERCEL_AUTOMATION_BYPASS_SECRET` secret.
- Unit tests include `perf.test.ts` (3 years, about 9,500 tasks: load 10 ms, save 3 ms, Stats 3 ms, import 9 ms on a desktop; the test limit is 150 ms) and `headers.test.ts` (the CSP hash must match the inline script in `index.html`: **if you change that script, update the `sha256-` in `vercel.json`**; the test tells you).
- **Real devices:** `docs/qa-checklist.md` is the script (iPhone Safari + installed, Android Chrome + installed, plus quick checks and screen readers). Each run is a GitHub issue "QA run YYYY-MM-DD · device · OS", each problem its own issue. `?seed=365` / `?seed=1100` in the dev server (`pnpm dev --host`) gives realistic data for the performance traces.

## Hosting and errors

- **`vercel.json`:** `/assets/*` cached for a year (`immutable`); `/`, `index.html`, `sw.js` and `manifest.webmanifest` are `no-cache`; every page gets a strict CSP (`default-src 'self'`, inline script only by hash, `style-src 'self' 'unsafe-inline'` because Svelte sets style attributes, `img-src` with `data:` for the paper grain, `frame-ancestors 'none'`), `nosniff`, `no-referrer`, and a Permissions-Policy. `vite.config.ts` reads the same headers for `vite preview`, so tests run under the real CSP.
- **No analytics and no error reporting service:** the app stays private and local. Errors go to the console only.
- **Error boundaries:** the notepad and the open sheet are each inside a `<svelte:boundary>` in `App.svelte`; a rendering bug shows `ErrorPage` ("Something went wrong. Your data is safe.", Reload, Download backup; the backup falls back to the raw saved text if exporting the live data itself fails). `installGlobalHandlers()` (called in `main.ts`) turns an uncaught error or unhandled rejection into one toast "Something went wrong · Reload" at most every 10 s, and logs the details.
- **Lazy sheets:** `StatsView` and `SettingsSheet` are separate chunks (`sheet-modules.svelte.ts`), fetched on first open and when the browser is idle, so they open at once and are in the service worker's precache for offline use. Tests preload them in `tests/setup.ts`.
- **Updates:** `registerType: 'prompt'` with `clientsClaim: true`, so even the first visit is controlled. "Update available · Reload" calls `applyUpdate()` (`ui/reload.ts`): ask the waiting worker to take over, reload on `controllerchange`, or after 4 s regardless.
- **Fonts:** Caveat 700 (headings and the task field) and Inter 400 and 600, Latin and Latin Extended only (`@fontsource/*`, `font-display: swap`); the Latin Caveat file is preloaded by a small plugin in `vite.config.ts`.
- **Install:** the manifest has `screenshots` (4 phone images, 1 dark, 1 wide; JPEG from `pnpm screenshots`) and no `shortcuts`: **do not add app shortcuts** (such as a "New task" shortcut); the app opens on today's page with the field ready. The screenshots and iOS launch screens (`apple-splash-*`) are excluded from the service worker precache. Re-run `pnpm screenshots` when the UI changes visibly.
- **Phone details:** every input is at least 16px (iOS zooms smaller ones; one global rule in `paper.css`), `overscroll-behavior: none` on `html` and `body`, `interactive-widget=resizes-content` in the viewport meta (Android resizes the layout for the keyboard), `watchKeyboard()` for iOS (page sized to the visual viewport while the keyboard is up, pan undone), `dir="auto"` and `text-align: start` on task text.
- **Planned for 1.1 (optional):** a calendar sheet from the date header, after real use.

## Today page interactions

Components take a date `key` and an `editable` flag (`app.isEditable(key)`), so past pages reuse them read-only. Every store change goes through `guarded()` (a `ReadOnlyDayError` becomes the toast "It's a new day…", and the page follows `app.today`).

- **Layout:** every row is a multiple of `--line-height` (32px) so text sits on the ruled lines. 44px tap targets stick out of the row with negative margins or absolute positioning; they must never make a row taller.
- **New task input** (`TaskInput`): sits on the first empty line after the list. Enter = new line; ✓ Add or Cmd/Ctrl+Enter adds; Escape clears; blank text is ignored. The ↻ toggle adds the task as a routine (resets after each add). The field stays focused after adding.
- **Edit in place:** tap the task text. Cmd/Ctrl+Enter or blur saves, Escape cancels, blank text cancels. Routine tasks show a hint that the routine is renamed too.
- **Check off:** the checkbox calls `app.toggleDone`. A checked task leaves the todo list with a strike-through fade (`taskFade`); unchecking on the done side sends it back to the end of the todo list.
- **"⋯" menu** (`TaskMenu`, a bottom sheet with a focus trap, closes on Escape): Make/Stop routine, Move up/down, Delete. Menu actions receive the task they were opened for, because the menu closes before the action runs.
- **Reordering:** drag the ⋮⋮ handle, or long-press the text (~300 ms). Pointer Events only; the page autoscrolls near the edges; releasing calls `app.move`. Keyboard: Enter/Space on the handle picks up, arrows move, Enter drops, Escape cancels; positions are announced in an `aria-live` region. Only the todo list can be reordered.
- **Delete** removes at once and shows "Task deleted · Undo" for 5 s; Undo calls `app.restore(key, task)` (same id and order, guarded like any change).
- **Read-only pages** (older than yesterday): no input, handle, menu or editing; checkboxes are disabled; unfinished one-off tasks get "Copy to today". **Yesterday (check-only)** is the same, except the checkboxes work: checking moves a task to the done side with the strike-through fade and haptic, unchecking on the done side brings it back, and tapping or long-pressing the text does nothing (no notice). The done time shows "14:32" on the page's own day and "Oct 27, 9:10 AM" (date in a lighter weight) when it was done on another day (`formatDoneAt` / `doneDate` in `dates.ts`).
- **Reduced motion:** `motion(ms)` returns 0 and CSS transitions are cut, so check-off and reorder animations are off. Tests stub `matchMedia` to reduce motion.

## Conventions

- Keep logic in `src/lib` as pure TypeScript functions (dates, routines, stats, backup), with unit tests. Components stay thin.
- Use Svelte 5 runes only. No legacy `export let`, `$:` or `svelte/store`.
- Component tests use the `app` singleton: `vi.useFakeTimers({ toFake: ['Date', 'setTimeout', …] })`, `app.init()` in `beforeEach` and its dispose function in `afterEach` (storage is the stubbed in-memory `localStorage`).
- In dev, `window.app` is the store, for the console.
- Make IDs with `crypto.randomUUID()`.
- Add no runtime dependencies without a clear reason; bundle size matters.
- Before calling a phase done, run `pnpm verify`.

## Build phases

1. Scaffold: Vite + Svelte + TS, PWA, lint, design tokens
2. Data layer: store, persistence, routines, tests
3. Today page: add, edit, delete, reorder, mark done
4. Flip animation
5. Notepad stack: scroll peel, browsing earlier days
6. Stats: 30-day bars, streaks, routine completion %, heatmap
7. Backup and settings: export, import, theme (done)
8. Polish and QA: real-device iOS Safari and Android Chrome, Lighthouse (done in code; run `docs/qa-checklist.md` on the phones, then tag `v1.0.0`)
9. Deploy as a static site, with CI running tests and the build
