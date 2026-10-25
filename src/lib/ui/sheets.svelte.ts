export type SheetName = 'stats' | 'settings';

/** Which sheet is open over the notepad (if any), and which section Settings should show first. */
export const sheets = $state<{ open: SheetName | null; section: 'data' | null }>({
  open: null,
  section: null,
});
