import { showInlinePopup } from './inlinePopup';
import { extractPageSummary, extractFaviconUrl } from '../utils/extractor';

const _win = window as Window & { __laterme_capture?: boolean };
if (!_win.__laterme_capture) {
  _win.__laterme_capture = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as {
      type: string;
      payload?: { url: string; title: string; bookmarkId?: string };
    };

    if (msg.type === 'SHOW_INLINE_POPUP' && msg.payload) {
      showInlinePopup({ ...msg.payload, favIconUrl: extractFaviconUrl(), summary: extractPageSummary() });
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
}
