import { showInlinePopup, showSaveToast } from './inlinePopup';
import { extractPageSummary, extractFaviconUrl } from '../utils/extractor';

const _win = window as Window & { __laterme_capture?: boolean; __laterme_ctrl_d_at?: number };
if (!_win.__laterme_capture) {
  _win.__laterme_capture = true;

  // Record Ctrl+D timing so the SHOW_SAVE_TOAST handler can debounce.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyD') {
      _win.__laterme_ctrl_d_at = Date.now();
    }
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as {
      type: string;
      payload?: { url: string; title: string; bookmarkId?: string };
    };

    if (msg.type === 'SHOW_SAVE_TOAST' && msg.payload) {
      showSaveToast({
        url: msg.payload.url,
        title: msg.payload.title,
        bookmarkId: msg.payload.bookmarkId || '',
      });
      sendResponse({ ok: true });
      return false;
    }

    if (msg.type === 'SHOW_INLINE_POPUP' && msg.payload) {
      showInlinePopup({ ...msg.payload, favIconUrl: extractFaviconUrl(), summary: extractPageSummary() });
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}
