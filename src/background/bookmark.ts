import { bookmarks, tabs, openPopupWindow } from '../utils/browser';
import { updateMeta, getMetaByUrl } from '../storage/db';

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

    // Locate the active tab once; reuse for both scripting and messaging.
    let tabId: number | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab?.id;
    } catch { /* quiet */ }

    if (tabId) {
      // Show our inline popup
      const popupPayload = { url, title, parentId };
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'SHOW_INLINE_POPUP',
          payload: popupPayload,
        });
        if (response?.ok) return;
      } catch (err) {
        const msg = (err as Error)?.message ?? '';
        if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
          // Content script not yet injected (tab was open before extension loaded).
          // Inject it now and retry.
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content/capture.js'],
            });
            const response2 = await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_INLINE_POPUP',
              payload: popupPayload,
            });
            if (response2?.ok) return;
          } catch { /* fall through to popup window */ }
        } else {
          return;
        }
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
