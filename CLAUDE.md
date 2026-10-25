# Flipside

A mobile-first daily todo app. Each day is a page of a vertical notepad: the front shows the todo list and the back shows the done list. You flip the page to switch sides, and scrolling down peels the page up to reveal the previous day underneath. There is also a stats view of completed tasks.

It is a frontend-only single-page app with no backend. All data lives in `localStorage` and can be downloaded or imported as a JSON backup.

> Status: Phase 1 (scaffold) is done. Build the remaining phases in the order below, and update this file when commands or structure change.

## Stack

- Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`), TypeScript (strict), Vite
- `vite-plugin-pwa`: offline support and installable on a phone
- Vitest + `@testing-library/svelte` for unit and component tests; Playwright (mobile viewports) for e2e
- Plain CSS with custom properties. No UI or CSS framework, no chart library: charts are hand-written SVG.
- Fonts: Caveat or Patrick Hand for headings (handwriting), Inter for body text

## Commands

Package manager: **pnpm** (don't use npm or yarn, and don't commit other lockfiles). Node 22 (`.nvmrc`). TypeScript is pinned to 6.x because `svelte-check` and `typescript-eslint` don't support 7 yet.

```bash
pnpm install
pnpm dev           # Vite dev server
pnpm build         # production build
pnpm preview       # serve the build
pnpm check         # svelte-check + tsc (node configs)
pnpm lint          # ESLint + Prettier --check
pnpm format        # Prettier --write
pnpm icons         # regenerate PWA icons from public/icon.svg
pnpm test          # Vitest
pnpm test:e2e      # Playwright (iPhone 14 + Pixel 7); builds and serves the preview itself
pnpm verify        # check + lint + test
```

## Structure

Path aliases: `$lib` → `src/lib`, `$components` → `src/components`. Unit tests sit next to the code as `*.test.ts`.

```
tests/
  setup.ts                  # Vitest setup: fake localStorage, deterministic crypto.randomUUID
  e2e/                      # Playwright specs
src/
  lib/
    model/types.ts          # Task, Day, Routine, AppData
    model/dates.ts          # local-date helpers (YYYY-MM-DD)
    store/app.svelte.ts     # $state store + derived selectors
    store/persist.ts        # localStorage load/save (debounced), migrations
    store/routines.ts       # routine tasks for a new day
    store/backup.ts         # JSON export/import + validation
    stats/compute.ts        # pure stats functions
  components/
    NotepadStack.svelte     # day pages stack, scroll-driven peel
    DayPage.svelte          # two-sided flip card
    TodoSide.svelte, DoneSide.svelte, TaskItem.svelte, TaskInput.svelte
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
- **Routines:** the first time a day is opened, add one fresh, undone task for each active routine (linked by `routineId`). Never add the same routine twice to one day. Turning the routine flag off makes it inactive; past instances stay untouched.
- **Unfinished one-off tasks** stay on their own day. Past pages have a "Move to today" action.
- **Past days** can be edited. **Future days** are not supported yet.
- **Dates** are always the user's local calendar date. Never derive them from `toISOString()` (that is UTC and shifts the day). Use the helpers in `dates.ts`.

## Persistence

- One localStorage key: `flipside:v1`. Save about 300 ms after each change. Wrap every read and write in try/catch, and fall back to in-memory state if storage is unavailable.
- Any change to the shape of `AppData` bumps `version` and adds a migration in `persist.ts`.
- Export downloads `flipside-backup-YYYY-MM-DD.json`. Import validates the file's structure and version, shows a preview, and asks for confirmation before replacing data.

## UI and animation

- Mobile first: design at 375px width, with 44px minimum tap targets and safe-area insets (`env(safe-area-inset-*)`).
- **Flip:** `transform-style: preserve-3d` and `rotateY(180deg)` with `backface-visibility: hidden`. Add the `-webkit-` prefix for iOS Safari and keep each face on its own layer. Triggered by a horizontal swipe (pointer events) or a button.
- **Day stack:** vertical scroll-snap. The current page moves up (translateY, a slight rotateX, a shadow) to reveal the previous day. Use `animation-timeline: scroll()` where supported, with a requestAnimationFrame fallback. Only about 3 pages near the screen are rendered at a time.
- Animate only `transform` and `opacity`. Aim for 60 fps on mid-range phones.
- With `prefers-reduced-motion` on, the flip becomes a crossfade and the peel becomes a plain scroll.
- The flip button has an accessible label and the hidden face is `inert`.
- Colours, spacing and shadows come from `tokens.css`, with light (paper) and dark themes.

## Conventions

- Keep logic in `src/lib` as pure TypeScript functions (dates, routines, stats, backup), with unit tests. Components stay thin.
- Use Svelte 5 runes only. No legacy `export let`, `$:` or `svelte/store`.
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
