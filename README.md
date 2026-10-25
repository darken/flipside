# Flipside

A mobile-first daily todo app that feels like a paper notepad.

Each day is one page. The front shows your to-do list and the back shows what you've done: flip the page to switch sides. Pull up past the end of the list to peel the page away and see earlier days underneath. A stats sheet shows streaks, daily totals, routine completion and a year-long heatmap.

Flipside runs entirely in the browser. There is no backend and no account: your data stays in `localStorage` on your device, and the app works offline and can be installed on a phone as a PWA.

## Features

- **Today's page:** add multi-line tasks, edit in place, reorder by drag or keyboard, check off, delete with undo.
- **Routines:** mark a task as a routine and it appears, fresh and unchecked, on every new day.
- **Flip:** a 3D page turn between the to-do and done lists (button, swipe, or the **F** key). Finishing your last task turns the page for you.
- **Notepad stack:** peel up to browse earlier days. Past pages are read-only, and unfinished tasks can be copied to today.
- **Stats:** current and best streak, 30-day bar chart, weekday averages, routine completion % and a 53-week heatmap. Tap a day to open its page.
- **Accessible:** keyboard shortcuts for every gesture, screen-reader announcements, and reduced-motion support (the flip becomes a crossfade, the peel a plain scroll).
- **Light and dark** paper themes.

## Getting started

You need Node 24 LTS (see `.nvmrc`; Node 22+ works) and [pnpm](https://pnpm.io).

```bash
pnpm install
```

```bash
pnpm dev
```

Then open the URL Vite prints. The app is designed for a 375px-wide phone screen, so use your browser's device toolbar or open it on a phone on the same network (`pnpm dev --host`).

## Scripts

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Start the Vite dev server                            |
| `pnpm build`         | Production build into `dist/`                        |
| `pnpm preview`       | Serve the production build                           |
| `pnpm check`         | Type-check with `svelte-check` and `tsc`             |
| `pnpm lint`          | ESLint and Prettier check                            |
| `pnpm format`        | Format with Prettier                                 |
| `pnpm test`          | Unit and component tests (Vitest)                    |
| `pnpm test:coverage` | Tests with coverage for `src/lib`                    |
| `pnpm test:e2e`      | Playwright end-to-end tests on iPhone 14 and Pixel 7 |
| `pnpm icons`         | Regenerate PWA icons from `public/icon.svg`          |
| `pnpm verify`        | `check` + `lint` + `test`                            |

Run `pnpm verify` before committing.

## Tech stack

- [Svelte 5](https://svelte.dev) (runes) with strict TypeScript, built with [Vite](https://vite.dev)
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app) for offline support and installation
- Plain CSS with custom properties; charts are hand-written SVG (no UI, CSS or chart library)
- Vitest and Testing Library for unit and component tests, Playwright for e2e
- Fonts: Caveat for handwriting, Inter for body text

## Project layout

```
src/
  lib/          # pure TypeScript: data model, dates, store, persistence, gestures, stats
  components/   # Svelte components: NotepadStack, DayPage, FlipCard, StatsView, charts…
  styles/       # design tokens and paper styles
  App.svelte
tests/          # test setup, helpers and Playwright specs
public/         # static assets and the PWA icon source
```

Logic lives in `src/lib` as pure, unit-tested functions; components stay thin. See [CLAUDE.md](CLAUDE.md) for the full design notes, data model and domain rules.

## Your data

Everything is stored under one `localStorage` key, `flipside:v1`, and saved shortly after each change. If the stored data is ever unreadable, it is copied aside to `flipside:v1:corrupt-<timestamp>` rather than lost, and the app starts fresh. Changes made in another tab are picked up automatically.

Clearing your browser's site data deletes your tasks. JSON export and import are coming in the next phase.

## Roadmap

1. ~~Scaffold~~
2. ~~Data layer~~
3. ~~Today page~~
4. ~~Flip animation~~
5. ~~Notepad stack~~
6. ~~Stats~~
7. Backup and settings: export, import, theme
8. Polish and QA on real iOS Safari and Android Chrome devices, Lighthouse
9. Deploy as a static site, with CI running tests and the build
