import { bookmarks, history, openPopupWindow } from '../utils/browser';
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
    let windowId: number | undefined;
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = tab?.id;
      windowId = tab?.windowId;
    } catch { /* quiet */ }

    if (tabId) {
      // Chrome's native bookmark bubble closes only when the browser window
      // loses OS-level focus. The only reliable way to trigger this from an
      // extension is to momentarily create a tiny popup window (which steals
      // OS focus → bubble dismisses), then immediately remove it so focus
      // returns to the original window.
      try {
        const stealWin = await chrome.windows.create({
          url: 'about:blank',
          type: 'popup',
          width: 1,
          height: 1,
          focused: true,
        });
        if (stealWin?.id) {
          await chrome.windows.remove(stealWin.id);
        }
        // Explicitly restore focus to the original window so the inline popup
        // receives keyboard input immediately.
        if (windowId !== undefined) {
          await chrome.windows.update(windowId, { focused: true });
        }
      } catch { /* restricted — ignore */ }

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
  history.onVisited.addListener(async (historyItem) => {
    if (!historyItem.url) return;
    const meta = await getMetaByUrl(historyItem.url);
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
