# Changelog

## 1.0.0 (to be tagged after the real-device QA run)

The first release: a daily todo notepad you flip and peel, with stats, backup and offline use.

### Added

- Today's page with multi-line tasks, editing in place, drag and keyboard reordering, undoable delete and routines.
- The flip (button, swipe, **F**) between the to-do and done lists, and auto-flip when the last task is checked.
- A notepad stack: peel up to earlier, read-only days; Back, Today, "Copy to today", skipped-day notes.
- Stats: streaks, 7/30/90-day bars, weekday averages, routine completion, a 53-week heatmap.
- Backup and settings: JSON backup through the share sheet or a download, replace-only import with a preview and Undo, theme (system, light, dark), auto-flip, storage information, a backup reminder, erase-all.
- Installable and offline (service worker, update on request), with install screenshots and iOS launch screens.
- A calm error page ("Something went wrong. Your data is safe.") instead of a white screen, and a toast for stray errors.
- A short vibration on check-off, drag pick-up, flip and peel (Android).
- Dev-only `?seed=365` sample data.

### Quality

- CI runs unit tests, WebKit and Chromium end-to-end tests, axe accessibility scans (light and dark), install, offline and update checks, a size budget (60 KB JS, 15 KB CSS, 120 KB fonts) and Lighthouse (Accessibility 100, Best Practices 95, SEO 90, CLS 0.05, Performance 90 with a warning under 95), also on Vercel previews.
- Strict Content Security Policy and cache headers (`vercel.json`).
- Inputs are 16 px (no iOS zoom), no rubber-banding, the keyboard resizes the page on Android and is handled on iOS, right-to-left and emoji text, very long tasks and 200 tasks on a page.
- Three years of data (about 9,500 tasks): load 10 ms, save 3 ms, Stats 3 ms, import 9 ms on a desktop.
- Stats and Settings load as separate chunks; fonts are subset to Latin and Latin Extended with the heading font preloaded.

### Fixed

- "Update available · Reload" now works for a page that was opened before the service worker took control.
