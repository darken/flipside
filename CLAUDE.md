# Flipside

A mobile-first daily todo app. Each day is a page of a vertical notepad: the front shows the todo list and the back shows the done list. You flip the page to switch sides, and scrolling down peels the page up to reveal the previous day underneath. There is also a stats view of completed tasks.

It is a frontend-only single-page app with no backend. All data lives in `localStorage` and can be downloaded or imported as a JSON backup.

> Status: Phases 1 (scaffold), 2 (data layer), 3 (today page), 4 (flip) and 5 (notepad stack) are done. Build the remaining phases in the order below, and update this file when commands or structure change.

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
pnpm icons         # regenerate PWA icons from public/icon.svg
pnpm test          # Vitest (TZ fixed to America/New_York)
pnpm test:coverage # Vitest + coverage for src/lib (thresholds enforced)
pnpm test:e2e      # Playwright (iPhone 14 + Pixel 7); builds and serves the preview itself
pnpm verify        # check + lint + test
```

## Structure

Path aliases: `$lib` → `src/lib`, `$components` → `src/components`. Unit tests sit next to the code as `*.test.ts`.

```
tests/
  setup.ts                  # Vitest setup: fake localStorage, deterministic crypto.randomUUID
  memory-storage.ts, fixtures.ts   # test helpers
  e2e/                      # Playwright specs
src/
  lib/
    model/types.ts          # Task, Day, Routine, AppData
    model/dates.ts          # local-date helpers (YYYY-MM-DD), formatHeading, formatRelative, isPast
    model/tasks.ts          # pure task ops on a Day (add, edit, move, copyToToday), selectors
    store/app.svelte.ts     # AppStore ($state), exported as `app`; rollover, cross-tab sync
    store/guard.ts          # assertEditable / ReadOnlyDayError
    store/persist.ts        # localStorage load/save, debounced saver, migrate, corrupt backup
    store/routines.ts       # ensureDay, makeRoutine, stopRoutine, renameRoutine
    store/validate.ts       # parseAppData: hand-written validation, reused by import
    ui/toast.svelte.ts      # toast queue (`toasts`), shown by Toast.svelte
    ui/guarded.ts           # guarded(): turns ReadOnlyDayError into a toast
    ui/gesture.ts           # direction locking + GestureArbiter: a swipe flips or peels, never both
    ui/peel.ts              # pure peel maths: dead zone, progress, commit, momentum guard, neighbours(), skippedBetween()
    ui/peelGesture.ts       # touch/pointer/wheel controller that turns a pull at the end of a list into a peel
    ui/history.ts           # LayerHistory: one browser-history entry per layer (past pages now; Stats/Settings later)
    ui/page-memory.ts       # what a page remembers while off screen (side, scroll), and the PageNav type
    ui/inert.ts, ui/portal.ts   # `inert` attribute action; move an element to <body>
    ui/flip.ts              # pure flip maths (angles, swipe rules, easing) and shouldAutoFlip
    ui/busy.svelte.ts       # lock held during drag/edit/menu so the page cannot flip
    ui/motion.ts, ui/autosize.ts   # reduced-motion helpers, task fade, textarea autosize
    store/backup.ts         # JSON export/import (Phase 7)
    stats/compute.ts        # pure stats functions
  components/
    NotepadStack.svelte     # the stack of day pages: peel, Today, goTo(key), history, rollover
    DayPage.svelte          # one day: FlipCard + flip button + auto-flip; owns the page's `side`
    FlipCard.svelte         # two-sided 3D card: flip animation and swipe gesture
    Face.svelte             # one side of the page: date header + the scrolling, ruled body
    TodoSide.svelte, DoneSide.svelte, TaskItem.svelte, TaskInput.svelte, TaskMenu.svelte, Toast.svelte
    StatsView.svelte, charts/BarChart.svelte, charts/Heatmap.svelte
    SettingsSheet.svelte
  styles/tokens.css, paper.css
  App.svelte                # view switch: Notepad | Stats | Settings
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
- **Past days are read-only:** no adding, editing, checking/unchecking, reordering or deleting. Enforce this in the store (mutations on a date before `today` are rejected), not only in the UI. At midnight, yesterday becomes read-only as it is.
- **Unfinished one-off tasks** stay on their own day. Past pages offer "Copy to today", which adds a new task to today and leaves the past day unchanged.
- **Future days** are not supported yet.
- **Dates** are always the user's local calendar date. Never derive them from `toISOString()` (that is UTC and shifts the day). Use the helpers in `dates.ts`.

## Persistence

- One localStorage key: `flipside:v1`. Save about 300 ms after each change. Wrap every read and write in try/catch, and fall back to in-memory state if storage is unavailable.
- Corrupt data is copied to `flipside:v1:corrupt-<timestamp>` and the app starts empty. A failed save sets `app.storageOk = false`; the app keeps working in memory. Another tab's save is picked up through the `storage` event.
- **Day rollover:** `app.tick()` runs every minute and on `visibilitychange`, and before every mutation, so the new day opens with its routine tasks and yesterday turns read-only.
- Any change to the shape of `AppData` bumps `version` and adds a migration in `persist.ts`.
- Export downloads `flipside-backup-YYYY-MM-DD.json`. Import validates the file's structure and version, shows a preview, and asks for confirmation before replacing data.

## UI and animation

- Mobile first: design at 375px width, with 44px minimum tap targets and safe-area insets (`env(safe-area-inset-*)`).
- **One-screen pages:** a page is exactly one screen (`--page-height`: `100dvh` minus the safe areas). The document never scrolls; each _face_ scrolls inside itself (`.scroll`: `overflow-y: auto`, `overscroll-behavior: contain`, ruled lines with `background-attachment: local`), so the 3D layer stays one screen tall and each face remembers its own scroll position. Absolutely positioned bits inside a face need the scroller to be `position: relative`, or they escape its clip and make the document scroll. **Phase 5 design point:** one page is one screen in the stack; pulling up from the bottom of a list hands off to the peel there.
- **Flip (`FlipCard`):** `perspective: 1400px` on the stage, `transform-style: preserve-3d` on the card, two faces in one grid cell, the back at `rotateY(180deg)`, `backface-visibility: hidden` with the `-webkit-` prefix and `translateZ(0)` on each face. Both faces stay mounted; the hidden one gets `inert` (set as an attribute) and `aria-hidden`. **Never put `overflow: hidden` (or any non-`visible` overflow) on the stage, the card or anything above them, and not on `.paper`: it flattens the 3D context and breaks the flip on iOS Safari.** `will-change: transform` is set only while a flip runs.
- **Flip motion:** Web Animations API on `transform` and `opacity` only, so it can be cancelled or reversed part way. About 600 ms, `cubic-bezier(0.2, 0.7, 0.2, 1)` (sampled into keyframes by `flip.ts`), around the vertical centre line, with scale 0.96 and a 4° `rotateX` tilt at the midpoint, a shade overlay on each face and a glow layer for the shadow. The button always turns the page right to left; a swipe turns it the way the finger goes. When it finishes, focus moves to the new face's `h1` and an `aria-live` region says "Done list, 5 tasks".
- **Swipe to flip:** touch and pen only (mouse users have the button and the **F** key; F is ignored while typing or when a modifier is held). After about 10 px the gesture locks to horizontal or vertical; vertical is left to the face's scrolling (`touch-action: pan-y` on the stage, the faces and the scrollers). The angle follows the finger (`dx / width × 180°`); on release it finishes past 90° or on a fling faster than 0.5 px/ms in the drag's direction, otherwise it springs back. A swipe does not start in a text field, on a drag handle, within 20 px of a screen edge, or while `busy` is held (drag, edit, open menu). Swipes during a running flip are ignored; the button and F reverse it.
- **Auto-flip:** checking off the last open task on today's page (todo 1 → 0) turns the page to the done side after 400 ms, once per page, and shows the "All done ✓" stamp. It never happens after deleting or copying, on past pages, while something holds `busy`, or when already on the back (`shouldAutoFlip` in `flip.ts`). `AUTO_FLIP_ENABLED` becomes the "Auto-flip when done" setting in Phase 7.
- **Side state:** `DayPage` keeps its `side` in memory only; every page opens on the to-do side, and a new day starts on the front.
- **Dialogs and fixed elements inside a face are trapped** by the transformed ancestor (`position: fixed` is then relative to the card). `TaskMenu` therefore moves itself to `<body>` with the `portal` action.
- **Day stack (`NotepadStack`):** a custom peel gesture, not scroll-snap. Pulling past the end of the visible list lifts the current page up and away (`translateY` to -100%, `rotateX` up to 12° from the top edge, a growing shadow) to reveal the older page, which scales 0.96 → 1 as its dark overlay fades; pulling down at the top brings the newer page back down. About 450 ms with the flip's curve. Only `transform` and `opacity` animate; `will-change` is set only during a peel.
- **Three pages only:** the newer page waiting above, the current page, the older page below (`neighbours()` over `app.dayKeys`, saved days only). Each is a `DayPage` inside a `.sheet` wrapper; the peel transform is on the wrapper, outside `FlipCard`, so the two 3D effects do not interfere. Pages that are not on top are `inert` and `aria-hidden`. `PageMemory` (side, scroll positions, auto-flipped) lives in the stack so pages remember themselves while unmounted.
- **Peel hand-off rules:** the list must be at its end (bottom for older, top for newer, or fit on screen) _when the finger touches down_ (momentum guard: a list that merely reaches its end during the same touch or by momentum needs a new touch); then a vertical drag; the page only follows after a 24 px dead zone; it completes past 35 % or on a pull faster than 0.5 px/ms, otherwise it springs back. Touch uses `touchstart`/non-passive `touchmove` (the stage has `touch-action: pan-y`, so the browser cancels pointer events when it scrolls) and calls `preventDefault()` only once the peel owns the gesture; mouse and pen use Pointer Events. A swipe may start on the new-task field unless it is focused. At the ends of the stack the page stretches with resistance ("This is your first page" on the oldest page).
- **One gesture at a time:** `gestures` (`gesture.ts`) lets a swipe either flip (horizontal) or peel (vertical); whoever locks first owns it. A running flip or peel, and anything holding `busy`, blocks the other.
- **Other ways to turn:** "‹ Newer" / "Older ›" buttons in each page header (also for screen readers), Alt+↓ (older) / Alt+↑ (newer), and a wheel or trackpad event of about 120 px at the end of a list after a 200 ms pause (one page per burst). The Today button (past pages only) animates back through at most 5 newer pages, ~100 ms each; any more are skipped instantly. `goTo(key)` (exported by `NotepadStack`) jumps to a day, or the nearest day that has a page. **Phase 6:** heatmap cells call `goTo`. **Phase 8 (optional):** a calendar sheet from the date header.
- **Past pages:** read-only (`editable=false`), softer ink (`--ink-past`), a lock icon, "Yesterday" / "3 days ago" in the header, and "Copy to today" on unfinished one-off tasks. Missed days have no page and are skipped; the page below a gap shows "2 days skipped" at the top of its list.
- **Back button (`LayerHistory`):** one history entry per layer, however many pages you peel; Back closes the top layer. Peeling away from today opens the `past` layer; Back on a past page animates to today; Today or peeling back to today removes the entry with `history.back()`; Back on today leaves the app. A reload opens on today and clears any leftover entry. Stats (Phase 6), Settings (Phase 7) and the task menu can be added as further layers.
- **New day while open:** on today, the new day lays down on top, the old today becomes the read-only page below, and a toast says "It's a new day". On a past page nothing moves; Today and Back lead to the new day.
- **After a peel:** focus moves to the new page's date heading and an `aria-live` message reads "Friday, October 24 · Yesterday · read-only" (plus "2 days skipped").
- Animate only `transform` and `opacity`. Aim for 60 fps on mid-range phones.
- With `prefers-reduced-motion` on, the flip becomes a 150 ms crossfade (no 3D, no tilt; swipes still switch sides but nothing follows the finger) and the peel becomes a plain scroll. The crossfade uses WAAPI because the global reduced-motion CSS zeroes CSS transitions.
- The flip button (turned corner, bottom right) has `aria-label` "Show done list" / "Show to-do list", `aria-pressed` and shows the other side's count; the count bumps when it changes.
- Header on every face: date line (with Stats and Settings) and a caption line (side · how long ago · lock) with the page buttons. Long dates shrink with `clamp()`.
- Colours, spacing and shadows come from `tokens.css`, with light (paper) and dark themes.

## Today page interactions

Components take a date `key` and an `editable` flag (`app.isEditable(key)`), so past pages reuse them read-only. Every store change goes through `guarded()` (a `ReadOnlyDayError` becomes the toast "It's a new day…", and the page follows `app.today`).

- **Layout:** every row is a multiple of `--line-height` (32px) so text sits on the ruled lines. 44px tap targets stick out of the row with negative margins or absolute positioning; they must never make a row taller.
- **New task input** (`TaskInput`): sits on the first empty line after the list. Enter = new line; ✓ Add or Cmd/Ctrl+Enter adds; Escape clears; blank text is ignored. The ↻ toggle adds the task as a routine (resets after each add). The field stays focused after adding.
- **Edit in place:** tap the task text. Cmd/Ctrl+Enter or blur saves, Escape cancels, blank text cancels. Routine tasks show a hint that the routine is renamed too.
- **Check off:** the checkbox calls `app.toggleDone`. A checked task leaves the todo list with a strike-through fade (`taskFade`); unchecking on the done side sends it back to the end of the todo list.
- **"⋯" menu** (`TaskMenu`, a bottom sheet with a focus trap, closes on Escape): Make/Stop routine, Move up/down, Delete. Menu actions receive the task they were opened for, because the menu closes before the action runs.
- **Reordering:** drag the ⋮⋮ handle, or long-press the text (~300 ms). Pointer Events only; the page autoscrolls near the edges; releasing calls `app.move`. Keyboard: Enter/Space on the handle picks up, arrows move, Enter drops, Escape cancels; positions are announced in an `aria-live` region. Only the todo list can be reordered.
- **Delete** removes at once and shows "Task deleted · Undo" for 5 s; Undo calls `app.restore(key, task)` (same id and order, guarded like any change).
- **Read-only pages:** no input, handle, menu or editing; checkboxes are disabled; unfinished one-off tasks get "Copy to today".
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
7. Backup and settings: export, import, theme
8. Polish and QA: real-device iOS Safari and Android Chrome, Lighthouse
9. Deploy as a static site, with CI running tests and the build
