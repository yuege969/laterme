import { runtime, tabs, windows, openPopupWindow } from '../utils/browser';
import { initBookmarkListeners, initHistoryListeners } from './bookmark';
import { initResurfacingAlarm, checkAndNotifyResurfacing, triggerResurfacingManual } from './resurfacing';
import { initAlarms } from './alarm';
import {
  getMeta,
  putMeta,
  updateMeta,
  deleteMeta,
  getAllMetas,
  bulkPutMetas,
  addResurfacingLog,
  wasShownToday,
  getSettings,
  saveSettings,
  exportData,
  importData,
} from '../storage/db';
import type { BookmarkMeta } from '../storage/types';

async function importExistingBookmarks(): Promise<number> {
  const tree = await chrome.bookmarks.getTree();
  const existingMetas = await getAllMetas();
  const existingIds = new Set(existingMetas.map((m) => m.bookmarkId));

  const newMetas: BookmarkMeta[] = [];
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[]): void {
    for (const node of nodes) {
      if (node.url && !existingIds.has(node.id)) {
        newMetas.push({
          bookmarkId: node.id,
          url: node.url,
          title: node.title || node.url,
          note: '',
          intent: null,
          createdAt: node.dateAdded || Date.now(),
          lastOpenedAt: node.dateAdded || Date.now(),
          openCount: 0,
          status: 'active',
        });
      }
      if (node.children) walk(node.children);
    }
  }
  walk(tree);

  await bulkPutMetas(newMetas);
  return newMetas.length;
}

// Init listeners every time the service worker starts (handles restarts too)
initBookmarkListeners();
initHistoryListeners();
initResurfacingAlarm();
initAlarms();

// Toolbar icon click — show inline popup (default_popup removed so this fires)
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  const url = tab.url;
  const title = tab.title || url || '';
  if (!tabId || !url) return;

  const popupPayload = { url, title };
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_INLINE_POPUP',
      payload: popupPayload,
    });
    if (response?.ok) return;
  } catch (err) {
    const msg = (err as Error)?.message ?? '';
    if (msg.includes('Could not establish connection') || msg.includes('Receiving end does not exist')) {
      // Content script not yet injected — inject and retry
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

  // Fallback for restricted pages (e.g. chrome://)
  const popupUrl = runtime.getURL(
    `content/popup/index.html?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`
  );
  openPopupWindow(popupUrl);
});

// On install/update, import existing bookmarks if needed and do an initial resurfacing check
runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // First install: open welcome page and import existing bookmarks
    chrome.tabs.create({ url: runtime.getURL('welcome/index.html') });
    const count = await importExistingBookmarks();
    if (count > 0) console.log(`LaterMe: imported ${count} existing bookmarks`);
  } else if (details.reason === 'update') {
    const existingMetas = await getAllMetas();
    if (existingMetas.length === 0) {
      const count = await importExistingBookmarks();
      if (count > 0) console.log(`LaterMe: imported ${count} existing bookmarks`);
    }
  }
  await checkAndNotifyResurfacing();
});

// Message handlers for content scripts and popup
runtime.onMessage.addListener((message, sender, sendResponse) => {
  const msg = message as { type: string; payload?: unknown };

  switch (msg.type) {
    case 'SAVE_BOOKMARK_META': {
      const payload = msg.payload as { bookmarkId: string; url: string; title: string; note: string; intent: BookmarkMeta['intent'] };
      putMeta({
        bookmarkId: payload.bookmarkId,
        url: payload.url,
        title: payload.title || '',
        note: payload.note,
        intent: payload.intent,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        openCount: 0,
        status: 'active',
      }).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'GET_BOOKMARK_META': {
      const { bookmarkId } = msg.payload as { bookmarkId: string };
      getMeta(bookmarkId).then((meta) => sendResponse({ meta }));
      return true;
    }

    case 'GET_ALL_METAS': {
      getAllMetas().then((metas) => sendResponse({ metas }));
      return true;
    }

    case 'UPDATE_META': {
      const { bookmarkId, ...patch } = msg.payload as { bookmarkId: string } & Partial<BookmarkMeta>;
      updateMeta(bookmarkId, patch).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'DELETE_META': {
      const { bookmarkId } = msg.payload as { bookmarkId: string };
      deleteMeta(bookmarkId).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'GET_SETTINGS': {
      getSettings().then((settings) => sendResponse({ settings }));
      return true;
    }

    case 'SAVE_SETTINGS': {
      const settings = msg.payload as Parameters<typeof saveSettings>[0];
      saveSettings(settings).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'LOG_RESURFACING_ACTION': {
      const { bookmarkId, url, action } = msg.payload as { bookmarkId: string; url: string; action: 'opened' | 'dismissed' | 'snoozed' };
      addResurfacingLog({
        bookmarkId,
        url,
        shownAt: Date.now(),
        action,
      }).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'TRIGGER_RESURFACING': {
      triggerResurfacingManual().then((result) => sendResponse({ result }));
      return true;
    }

    case 'WAS_SHOWN_TODAY': {
      wasShownToday().then((shown) => sendResponse({ shown }));
      return true;
    }

    case 'EXPORT_DATA': {
      exportData().then((data) => sendResponse({ data }));
      return true;
    }

    case 'IMPORT_DATA': {
      const data = msg.payload as Parameters<typeof importData>[0];
      importData(data).then(() => sendResponse({ success: true }));
      return true;
    }

    case 'OPEN_BOOKMARK': {
      const { bookmarkId } = msg.payload as { bookmarkId: string };
      (async () => {
        await updateMeta(bookmarkId, { lastOpenedAt: Date.now() });
        const [node] = await chrome.bookmarks.get(bookmarkId);
        if (node?.url) {
          chrome.tabs.create({ url: node.url });
        }
      })();
      return true;
    }

    case 'OPEN_POPUP': {
      // Legacy fallback path — kept for chrome:// pages where content scripts can't run.
      const { popupUrl } = msg.payload as { url: string; title: string; popupUrl: string };
      openPopupWindow(popupUrl);
      return false;
    }

    case 'INLINE_SKIP': {
      const { title, url, parentId } = msg.payload as { title: string; url: string; parentId?: string };
      (async () => {
        await chrome.storage.local.set({ laterme_popup_created: Date.now() });
        const arg: chrome.bookmarks.BookmarkCreateArg = { title, url };
        if (parentId) arg.parentId = parentId;
        try { await chrome.bookmarks.create(arg); } catch { /* already exists */ }
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'INLINE_SAVE': {
      const { title, url, parentId, bookmarkId, note, intent } = msg.payload as {
        title: string; url: string; parentId?: string; bookmarkId?: string;
        note: string; intent: BookmarkMeta['intent'];
      };
      (async () => {
        await chrome.storage.local.set({ laterme_popup_created: Date.now() });
        let finalBookmarkId = bookmarkId;
        if (finalBookmarkId) {
          // Star-icon flow: bookmark already exists, update it
          try { await chrome.bookmarks.update(finalBookmarkId, { title, url }); } catch { /* keep existing */ }
        } else {
          // Ctrl+D / toolbar flow: create a new bookmark
          const arg: chrome.bookmarks.BookmarkCreateArg = { title, url };
          if (parentId) arg.parentId = parentId;
          const bookmark = await chrome.bookmarks.create(arg);
          finalBookmarkId = bookmark.id;
        }
        await putMeta({
          bookmarkId: finalBookmarkId,
          url,
          title,
          note,
          intent,
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
          openCount: 0,
          status: 'active',
        });
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'OPEN_BOOKMARKS_PAGE': {
      chrome.tabs.create({ url: runtime.getURL('bookmarks/index.html') });
      return false;
    }

    case 'CREATE_BOOKMARK': {
      const payload = msg.payload as {
        title: string;
        url: string;
        note: string;
        intent: BookmarkMeta['intent'];
      };
      (async () => {
        const bookmark = await chrome.bookmarks.create({ title: payload.title, url: payload.url });
        await putMeta({
          bookmarkId: bookmark.id,
          url: payload.url,
          title: payload.title,
          note: payload.note,
          intent: payload.intent,
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
          openCount: 0,
          status: 'active',
        });
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'IMPORT_BOOKMARKS': {
      importExistingBookmarks()
        .then((count) => sendResponse({ count }))
        .catch((err) => sendResponse({ error: (err as Error).message }));
      return true;
    }

    case 'DELETE_BOOKMARK': {
      const { bookmarkId } = msg.payload as { bookmarkId: string };
      (async () => {
        await deleteMeta(bookmarkId);
        try { await chrome.bookmarks.remove(bookmarkId); } catch { /* already removed */ }
        sendResponse({ success: true });
      })();
      return true;
    }

    default:
      return false;
  }
});

// Export for type checking
export {};
