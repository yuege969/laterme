import { showInlinePopup } from './inlinePopup';
import { extractPageSummary, extractFaviconUrl } from '../utils/extractor';

// ── Deduplication guard ───────────────────────────────────────────────────────
// The script may be injected more than once on a page (e.g. via
// scripting.executeScript fallback). Guard prevents duplicate listeners.
const _win = window as Window & { __laterme_capture?: boolean; __laterme_ctrl_d_at?: number };
if (!_win.__laterme_capture) {
  _win.__laterme_capture = true;

  // ── Ctrl+D / Cmd+D interception ──────────────────────────────────────────
  // Registering in the capture phase (third arg = true) means this listener
  // fires before page scripts. Calling preventDefault() stops Chrome from
  // processing the shortcut natively, which prevents the "已添加书签" bubble
  // from appearing — giving us exclusive control over the shortcut.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyD') {
      e.preventDefault();
      _win.__laterme_ctrl_d_at = Date.now();
      showInlinePopup({
        url: window.location.href,
        title: document.title || window.location.href,
        favIconUrl: extractFaviconUrl(),
        summary: extractPageSummary(),
      });
    }
  }, true);

  // ── Message handler for star-icon bookmarks ───────────────────────────────
  // background/bookmark.ts intercepts bookmarks.onCreated (star icon click),
  // removes the native bookmark, and sends SHOW_INLINE_POPUP here.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as {
      type: string;
      payload?: { url: string; title: string; parentId?: string; bookmarkId?: string };
    };

    if (msg.type === 'SHOW_INLINE_POPUP' && msg.payload) {
      // If the Ctrl+D keydown handler already opened the popup within the
      // last second, skip recreating it (prevents flash when both code paths
      // fire — e.g. when preventDefault() doesn't suppress the bookmark).
      const ctrlDAt = _win.__laterme_ctrl_d_at ?? 0;
      if (Date.now() - ctrlDAt > 1000) {
        showInlinePopup({ ...msg.payload, favIconUrl: extractFaviconUrl(), summary: extractPageSummary() });
      }
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}
