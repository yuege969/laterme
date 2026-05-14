import { runtime, api } from '../../utils/browser';
import type { IntentType } from '../../storage/types';

interface PopupParams {
  url: string;
  title: string;
  parentId?: string;
}

async function getPopupParams(): Promise<PopupParams | null> {
  // First check URL params (opened via Ctrl+D interception or star icon)
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const title = params.get('title');
  const parentId = params.get('parentId') || undefined;
  if (url) return { url, title: title || url, parentId };

  // Opened via toolbar icon — query active tab
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

// Async init
async function initParams(): Promise<void> {
  popupParams = await getPopupParams();
}

const noteInput = document.getElementById('noteInput') as HTMLTextAreaElement;
const charCount = document.getElementById('charCount') as HTMLSpanElement;
const skipBtn = document.getElementById('skipBtn') as HTMLButtonElement;
const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
const intentOptions = document.querySelectorAll('.intent-option');

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

const POPUP_FLAG = 'laterme_popup_created';

// Skip: just create native bookmark, no meta
skipBtn.addEventListener('click', async () => {
  if (!popupParams) {
    window.close();
    return;
  }

  // Set flag so background knows to skip intercepting this creation
  await chrome.storage.local.set({ [POPUP_FLAG]: Date.now() });

  try {
    const createArg: chrome.bookmarks.BookmarkCreateArg = { title: popupParams.title, url: popupParams.url };
    if (popupParams.parentId) createArg.parentId = popupParams.parentId;
    await api.bookmarks.create(createArg);
  } catch {
    // Bookmark might already exist
  }

  window.close();
});

// Save: create bookmark + meta
saveBtn.addEventListener('click', async () => {
  if (!popupParams) {
    window.close();
    return;
  }

  const note = noteInput.value.trim();

  // Set flag so background knows to skip the "add note" chip
  await chrome.storage.local.set({ [POPUP_FLAG]: Date.now() });

  let bookmarkId: string | undefined;
  try {
    // Create native bookmark, preserving original folder if intercepted from star icon
    const createArg: chrome.bookmarks.BookmarkCreateArg = { title: popupParams.title, url: popupParams.url };
    if (popupParams.parentId) createArg.parentId = popupParams.parentId;
    const bookmark = await api.bookmarks.create(createArg);
    bookmarkId = bookmark.id;
  } catch {
    // Bookmark might already exist — try to find it
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

  // Save meta via background
  if (bookmarkId) {
    try {
      await runtime.sendMessage({
        type: 'SAVE_BOOKMARK_META',
        payload: {
          bookmarkId,
          url: popupParams.url,
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

// Handle Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    skipBtn.click();
  }
});

// Init params then focus
// Open bookmarks page
document.getElementById('bookmarksLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  const url = runtime.getURL('bookmarks/index.html');
  api.tabs.create({ url });
  window.close();
});

initParams().then(() => {
  noteInput.focus();
});
