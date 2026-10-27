# QA checklist (real devices)

A step-by-step script to run before a release, on a phone, with a finger. The automated suite (unit, Playwright on WebKit and Chromium, axe, Lighthouse) covers behaviour; this covers what only a real device shows: how it feels, safe areas, the keyboard, the share sheet, installation and screen readers.

## Devices

Run the whole list on each row:

| Device                                          | Browser | Installed to the Home Screen     |
| ----------------------------------------------- | ------- | -------------------------------- |
| A recent iPhone, current iOS                    | Safari  | yes (Share → Add to Home Screen) |
| A mid-range Android (Pixel 6a, Galaxy A-series) | Chrome  | yes (Install app)                |

Quick checks (skim the main flow, look for layout breaks): desktop Chrome, Firefox and Safari, and an iPad in portrait.

Before the phones, do a pass in the iOS Simulator (layout, safe areas, keyboard, Add to Home Screen, light and dark) and the Android emulator if Android Studio is installed. They catch layout problems early; they do not replace the phone for performance, haptics or gestures.

## Record the run

- Open a GitHub issue named like **"QA run 2026-11-02 · iPhone 15 · iOS 26.1"** (or "· Pixel 6a · Android 15 · Chrome 141"). Paste this checklist in it and tick as you go.
- Every problem gets its **own issue**, linked from the run issue: what you did, what happened, what you expected, device and OS, a screen recording if it is about motion.
- A run passes when every box is ticked and no serious issue is open.

## Set up

- [ ] Open the live app (or a preview deployment) in the browser. For performance work use the dev server on your network: `pnpm dev --host`, then `http://<your-mac>:5173/?seed=365` (a year of sample data; `?seed=1100` for three years). The seed replaces the data in that browser, so use a separate browser profile or the installed app for real notes.
- [ ] Note the version under Settings → About.
- [ ] Start with an empty notepad (Settings → Erase all data) unless a step says to use the seed.

## 1. Add, edit, reorder

- [ ] Tap the field on the empty line: the page does **not** zoom, and the field stays visible above the keyboard (no jump of the whole page, the header stays in place).
- [ ] Add three tasks with ✓. The field stays focused for the next one.
- [ ] Add a task with several lines (Enter makes a new line). It shows all lines on the ruled paper.
- [ ] Add a 2,000-character paragraph (paste one). It wraps, no sideways scrolling, controls still reachable; the page scrolls.
- [ ] Add a task with emoji (✈️🌍) and one in Arabic or Hebrew: the Arabic or Hebrew text starts at the right.
- [ ] Tap a task's text to edit it. The keyboard opens, the text is not zoomed. Save by tapping outside; blank text cancels.
- [ ] Drag a task by its ⋮⋮ handle to a new place. You feel a short vibration on pick-up (Android). The list scrolls when you drag near an edge.
- [ ] Long-press a task's text (about 300 ms) and drag. Scrolling normally with a quick swipe does not start a drag.
- [ ] Delete a task from ⋯. "Task deleted · Undo" brings it back.
- [ ] Make one task a routine (↻), stop it later from ⋯.
- [ ] With 200 tasks on one page (seed or paste) scrolling stays smooth and adding still works.

## 2. Flip

- [ ] Tap the turned corner: the page turns right to left, no flicker on the back faces, no white flashes.
- [ ] Swipe sideways in both directions: the page follows your finger; release past halfway completes it, a short drag springs back; a quick fling completes it.
- [ ] Swiping from the very edge of the screen does not flip (it is the system's Back gesture).
- [ ] Vertical scrolling inside the list is never interrupted by a flip.
- [ ] The done side shows the count and the times. Un-checking a task sends it back to the end of the to-do list.
- [ ] A short vibration when the flip finishes (Android).

## 3. Auto-flip

- [ ] Check off the last open task on today's page: after a moment the page turns to the done side with "All done ✓".
- [ ] It does not happen after deleting the last task, on a past page, or while editing.
- [ ] Settings → "Auto-flip when done" off: it stays on the to-do side.

## 4. Peel and Back

- [ ] With a few days of pages (seed), scroll to the end of today's list and pull up: the page lifts away and yesterday appears underneath. Pulling while still moving from a scroll does nothing: it needs a new touch.
- [ ] Pull down at the top of an older page: the newer page comes back.
- [ ] "Older ›", "‹ Newer" and "Today" in the header work. Today from five days away animates back.
- [ ] Past pages are read-only and lighter, with "Yesterday"/"N days ago" and "Copy to today" on unfinished tasks. "2 days skipped" shows where days are missing.
- [ ] **Back** (Android back button or gesture, iOS back swipe in Safari): from a past page goes to today; from Stats or Settings closes the sheet; from today leaves the app. Peeling through many pages needs a single Back.
- [ ] **Yesterday:** its header shows a ✓ in a circle (not a lock) and the caption reads as before. Check a task off: it fades out and the done side shows it with today's time and the date ("Oct 27, 9:10 AM"); uncheck it on the done side and it comes back. Checking the last open task turns the page ("All done ✓"). There is no new-task field, ⋯ menu or drag handle, and tapping the text does nothing. Go one page older: it shows the lock and the checkboxes are disabled.
- [ ] On the oldest page the page stretches a little and "This is your first page" shows.

## 5. New day

- [ ] Leave the app open across midnight (or change the device date and come back to the app): the new day lays down, "It's a new day. You can still check off yesterday's tasks." toast, the old today allows checking only (✓ icon), the day before it is read-only, and routines appear fresh.
- [ ] Leave the app in the background for a long time, then return: the day is correct.

## 6. Stats

- [ ] Stats opens with a slide-up sheet, the streak and tiles match what you did, the 7/30/90 switch changes the bars.
- [ ] Tap a bar, tap again: "Open page" goes to that day; Back from there goes to today.
- [ ] The heatmap scrolls sideways without moving the page; tapping a day shows its figures.
- [ ] Opening Stats with a year of seed data takes no visible time and scrolling it is smooth.
- [ ] Swipe down on the sheet closes it; scrolling inside it does not.

## 7. Backup, import, erase

- [ ] Settings → Download backup: on a phone the share sheet opens; saving to Files works. Closing the share sheet records nothing.
- [ ] Import the file you just saved: the preview shows the dates and counts; "Replace everything" works; "Backup imported · Undo" restores the old data.
- [ ] Import a text file that is not a backup: a clear error, nothing changed.
- [ ] Erase all data needs two confirmations ("erase" typed) and leaves an empty today. (Do this last on a device with real notes.)
- [ ] With a normal Safari tab (not installed), Settings suggests adding to the Home Screen.

## 8. Theme

- [ ] Settings → Theme: Light, Dark and System switch the whole app with a short fade, including the status bar colour (Android) and the area behind the notch (iOS installed).
- [ ] With System, changing the phone's appearance changes the app.
- [ ] Look at every screen in dark mode: notepad, done side, past pages, task menu, toasts, Stats charts and heatmap, Settings, the error page.

## 9. Offline

- [ ] Open the app once online, then turn on airplane mode and close and reopen it (installed and in the browser): it loads.
- [ ] Offline: add tasks, flip, open Stats and Settings, download a backup.
- [ ] Back online: nothing is lost.

## 10. Update

- [ ] After a new version is deployed, open the app twice (the first visit fetches it): Settings shows "Update available · Reload". Pressing it reloads into the new version (check the version line).

## 11. Safe areas and orientation

- [ ] iPhone installed: the header is not under the status bar or the notch; the flip button and toasts are clear of the home indicator.
- [ ] Landscape on a small phone: everything is reachable, nothing overflows sideways; the list scrolls inside the page.
- [ ] Largest system font size / display size (Settings → Accessibility): text wraps, the header and buttons are still usable.
- [ ] iPad in portrait: the page is centred in a column and behaves.

## 12. Install

- [ ] Android: the install prompt shows the screenshots; the installed icon is the right shape (maskable, not cropped).
- [ ] iOS: Add to Home Screen uses the icon and name "Flipside"; the launch screen shows paper (or dark) with the icon, then the app.
- [ ] Reduced motion (Settings → Accessibility → Reduce Motion / Remove animations): the flip is a crossfade, the peel is a plain scroll, nothing else slides.

## 13. Screen reader pass

Do this once per platform with VoiceOver (iPhone) and TalkBack (Android). Turn the screen reader on, then:

- [ ] The page heading is read as "Sunday, October 25"; the caption says "To do" and the number of tasks.
- [ ] Each task reads its text and "checkbox, not checked"; the reorder and actions buttons say which task they belong to.
- [ ] Adding a task: the field is labelled "New task"; after adding, the new task can be found.
- [ ] Flipping with "Show done list": afterwards it announces "Done list, N tasks" and focus is on the heading.
- [ ] Peeling with "Older ›": it announces the new day ("Monday, October 26 · Yesterday · check-off only"; older pages end in "read-only").
- [ ] Stats: tiles read as label + value; each chart has a spoken summary and a table you can read; the 7/30/90 switch is a radio group.
- [ ] Settings: every control has a name; the erase steps are readable; the import preview is read.
- [ ] The toasts are announced ("Task deleted", "Backup downloaded").
- [ ] Nothing behind an open sheet or menu can be reached.

## 14. Performance (on the phone)

Use the seed: `?seed=365` on the dev server, then repeat with `?seed=1100`.

Attach a trace for each of: **a flip, a peel, dragging a task, opening Stats.**

- iPhone: Settings → Safari → Advanced → Web Inspector on; connect to a Mac; Safari → Develop → [your iPhone] → the page → Timelines (Frames, JavaScript & Events).
- Android: USB debugging on; open `chrome://inspect` on the computer, Inspect the tab, Performance → record while doing the action.

Target: **no dropped frames on the mid-range Android** for each of the four. Note any long task over 50 ms. Startup, saving, Stats and import should feel instant (under 150 ms on the mid-range Android).

## Done

- [ ] All sections ticked on all four rows (two phones, browser and installed), no open serious issue.
- [ ] Issues from this run are filed, with fixes in their own commits ("QA: …").
