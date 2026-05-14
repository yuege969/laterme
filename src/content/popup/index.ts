import { runtime, api } from '../../utils/browser';
import type { IntentType } from '../../storage/types';

interface PopupParams {
  url: string;
  title: string;
  parentId?: string;
}

async function getPopupParams(): Promise<PopupParams | null> {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const title = params.get('title');
  const parentId = params.get('parentId') || undefined;
  if (url) return { url, title: title || url, parentId };

  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      return { url: tabs[0].url, title: tabs[0].title || tabs[0].url };
    }
  } catch {
    // Can't query tabs
  }

  return null;
}

let popupParams: PopupParams | null = null;

async function initParams(): Promise<void> {
  popupParams = await getPopupParams();
}

const noteInput = document.getElementById('noteInput') as HTMLTextAreaElement;
const charCount = document.getElementById('charCount') as HTMLSpanElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const pageTitle = document.getElementById('pageTitle') as HTMLSpanElement;
const pageFavicon = document.getElementById('pageFavicon') as HTMLImageElement;
const intentOptions = document.querySelectorAll<HTMLElement>('.intent-option');

let selectedIntent: IntentType = null;

// Character counter
noteInput.addEventListener('input', () => {
  const len = noteInput.value.length;
  charCount.textContent = String(len);
  charCount.className = '';
  if (len >= 50) charCount.className = 'full';
  else if (len >= 40) charCount.className = 'warn';
});

// Intent selection
intentOptions.forEach((option) => {
  option.addEventListener('click', () => {
    intentOptions.forEach((o) => o.classList.remove('selected'));
    option.classList.add('selected');
    const radio = option.querySelector('input[type="radio"]') as HTMLInputElement;
    radio.checked = true;
    selectedIntent = radio.value as IntentType;
  });
});

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

const POPUP_FLAG = 'laterme_popup_created';

// Save: create bookmark + meta (note and intent are optional)
saveBtn.addEventListener('click', async () => {
  if (!popupParams) {
    window.close();
    return;
  }

  const note = noteInput.value.trim();

  await chrome.storage.local.set({ [POPUP_FLAG]: Date.now() });

  let bookmarkId: string | undefined;
  try {
    const createArg: chrome.bookmarks.BookmarkCreateArg = { title: popupParams.title, url: popupParams.url };
    if (popupParams.parentId) createArg.parentId = popupParams.parentId;
    const bookmark = await api.bookmarks.create(createArg);
    bookmarkId = bookmark.id;
  } catch {
    try {
      const existing = await api.bookmarks.search({ url: popupParams.url });
      if (existing.length > 0) {
        bookmarkId = existing[0].id;
        await api.bookmarks.update(existing[0].id, { title: popupParams.title });
      }
    } catch {
      // Can't create or update, still save meta
    }
  }

  if (bookmarkId) {
    try {
      await runtime.sendMessage({
        type: 'SAVE_BOOKMARK_META',
        payload: {
          bookmarkId,
          url: popupParams.url,
          title: popupParams.title,
          note,
          intent: selectedIntent,
        },
      });
    } catch {
      // Background might not be ready
    }
  }

  window.close();
});

// Escape -- cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    saveBtn.click();
  }
});

// Open bookmarks page
document.getElementById('bookmarksLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  const url = runtime.getURL('bookmarks/index.html');
  api.tabs.create({ url });
  window.close();
});

// Init params then setup page info
initParams().then(() => {
  if (popupParams) {
    pageTitle.textContent = popupParams.title || popupParams.url;
    const favUrl = getFaviconUrl(popupParams.url);
    if (favUrl) {
      pageFavicon.src = favUrl;
    } else {
      pageFavicon.style.display = 'none';
    }
  }
  noteInput.focus();
});
