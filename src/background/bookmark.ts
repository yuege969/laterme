import { bookmarks, tabs } from '../utils/browser';
import { putMeta, updateMeta, getMetaByUrl } from '../storage/db';
import type { BookmarkMeta } from '../storage/types';

const POPUP_FLAG_KEY = 'laterme_popup_created';

export function initBookmarkListeners(): void {
  bookmarks.onCreated.addListener(async (id, bookmark) => {
    if (!bookmark.url) return;

    // Skip if this bookmark was created by our own INLINE_SAVE handler.
    try {
      const data = await chrome.storage.local.get(POPUP_FLAG_KEY);
      const flag = data[POPUP_FLAG_KEY] as number | undefined;
      if (flag && Date.now() - flag < 5000) {
        await chrome.storage.local.remove(POPUP_FLAG_KEY);
        return;
      }
    } catch { /* quiet */ }

    const url = bookmark.url;
    const title = bookmark.title || url;

    // Keep the native bookmark — create an empty meta entry alongside it.
    const meta: BookmarkMeta = {
      bookmarkId: id,
      url,
      title,
      note: '',
      intent: null,
      createdAt: bookmark.dateAdded || Date.now(),
      lastOpenedAt: bookmark.dateAdded || Date.now(),
      openCount: 0,
      status: 'active',
    };
    try { await putMeta(meta); } catch { /* may already exist */ }

    // Delay the popup so Chrome's native bookmark dialog has time to close.
    // Chrome fires bookmarks.onCreated immediately when Ctrl+D is pressed,
    // while the folder-picker dialog is still open. Without a delay the
    // two dialogs compete for focus — clicking one dismisses the other.
    await new Promise((r) => setTimeout(r, 2000));

    let tabId: number | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab?.id;
    } catch { /* quiet */ }

    if (tabId) {
      const popupPayload = { url, title, bookmarkId: id };
      const sendPopup = async (tId: number) => {
        try {
          const response = await chrome.tabs.sendMessage(tId, {
            type: 'SHOW_INLINE_POPUP',
            payload: popupPayload,
          });
          return response?.ok;
        } catch (err) {
          const msg = (err as Error)?.message ?? '';
          if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tId },
                files: ['content/capture.js'],
              });
              await chrome.tabs.sendMessage(tId, {
                type: 'SHOW_INLINE_POPUP',
                payload: popupPayload,
              });
              return true;
            } catch { /* content script unavailable */ }
          }
        }
        return false;
      };
      await sendPopup(tabId);
    }
  });
}

export function initHistoryListeners(): void {
  tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete' || !tab.url) return;
    const meta = await getMetaByUrl(tab.url);
    if (meta) {
      const now = Date.now();
      await updateMeta(meta.bookmarkId, {
        lastOpenedAt: now,
        openCount: (meta.openCount || 0) + 1,
        status: meta.status === 'expired' ? 'active' : meta.status,
      });

      if (meta.nextReminderAt) {
        await updateMeta(meta.bookmarkId, { nextReminderAt: undefined });
      }
    }
  });
}
