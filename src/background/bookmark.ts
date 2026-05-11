import { bookmarks, history, openPopupWindow } from '../utils/browser';
import { updateMeta, getMeta } from '../storage/db';

const POPUP_FLAG_KEY = 'laterme_popup_created';

export function initBookmarkListeners(): void {
  bookmarks.onCreated.addListener(async (id, bookmark) => {
    if (!bookmark.url) return;

    // Check if this bookmark was just created by our own save flow — skip to
    // avoid an infinite loop.
    try {
      const data = await chrome.storage.local.get(POPUP_FLAG_KEY);
      const flag = data[POPUP_FLAG_KEY] as number | undefined;
      if (flag && Date.now() - flag < 5000) {
        await chrome.storage.local.remove(POPUP_FLAG_KEY);
        return;
      }
    } catch { /* quiet */ }

    // Star-icon bookmark — remove it immediately so we own the lifecycle.
    try {
      await chrome.bookmarks.remove(id);
    } catch { /* already removed */ }

    const url = bookmark.url;
    const title = bookmark.title || url;
    const parentId = bookmark.parentId || '';

    // Try to send the inline popup message to the active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_INLINE_POPUP',
          payload: { url, title, parentId },
        });
        // If content script responded, it handled the popup — we're done
        if (response?.ok) return;
      }
    } catch (err) {
      // Only fall through to popup window if it's a genuine connection error
      // (e.g. chrome:// page where content scripts can't run)
      const msg = (err as Error)?.message ?? '';
      if (!msg.includes('Could not establish connection') && !msg.includes('Receiving end does not exist')) {
        return; // some other error — don't open a duplicate window
      }
    }

    // Fallback: open as a separate popup window (e.g. on chrome:// pages)
    const popupUrl = chrome.runtime.getURL(
      `content/popup/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&parentId=${encodeURIComponent(parentId)}`
    );
    openPopupWindow(popupUrl);
  });
}

export function initHistoryListeners(): void {
  history.onVisited.addListener(async (historyItem) => {
    if (!historyItem.url) return;
    const meta = await getMeta(historyItem.url);
    if (meta) {
      const now = Date.now();
      await updateMeta(historyItem.url, {
        lastOpenedAt: now,
        openCount: (meta.openCount || 0) + 1,
        status: meta.status === 'expired' ? 'active' : meta.status,
      });

      if (meta.nextReminderAt) {
        await updateMeta(historyItem.url, { nextReminderAt: undefined });
      }
    }
  });
}
