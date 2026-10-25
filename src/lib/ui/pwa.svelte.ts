/** Whether a new version of the app has been downloaded and is waiting for a reload. */
export const pwa = $state<{ needRefresh: boolean; update: (() => void) | null }>({
  needRefresh: false,
  update: null,
});
