import { runtime, api } from '../../utils/browser';
import { getSettings, saveSettings } from '../../storage/db';
import type { IntentType } from '../../storage/types';
import { PRESET_INTENTS } from '../../storage/types';

interface PopupParams {
  url: string;
  title: string;
  parentId?: string;
  bookmarkId?: string;
  favIconUrl?: string;
}

async function getPopupParams(): Promise<PopupParams | null> {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const title = params.get('title');
  const parentId = params.get('parentId') || undefined;
  const bookmarkId = params.get('bookmarkId') || undefined;
  if (url) return { url, title: title || url, parentId, bookmarkId };

  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url) {
      return { url: tabs[0].url, title: tabs[0].title || tabs[0].url, favIconUrl: tabs[0].favIconUrl };
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

const noteInput       = document.getElementById('noteInput')       as HTMLTextAreaElement;
const charCount       = document.getElementById('charCount')       as HTMLSpanElement;
const saveBtn         = document.getElementById('saveBtn')         as HTMLButtonElement;
const pageTitle       = document.getElementById('pageTitle')       as HTMLSpanElement;
const pageFavicon     = document.getElementById('pageFavicon')     as HTMLImageElement;
const intentOptions   = document.querySelectorAll<HTMLElement>('.intent-option');
const customIntentInput = document.getElementById('customIntentInput') as HTMLInputElement;

let selectedIntent: IntentType = null;

// Character counter
noteInput.addEventListener('input', () => {
  const len = noteInput.value.length;
  charCount.textContent = String(len);
  charCount.className = '';
  if (len >= 120) charCount.className = 'full';
  else if (len >= 100) charCount.className = 'warn';
});

// Intent pill selection — clears custom input
intentOptions.forEach((option) => {
  option.addEventListener('click', () => {
    intentOptions.forEach((o) => o.classList.remove('selected'));
    document.querySelectorAll('.intent-option-custom').forEach((o) => o.classList.remove('selected'));
    option.classList.add('selected');
    const radio = option.querySelector('input[type="radio"]') as HTMLInputElement;
    radio.checked = true;
    selectedIntent = radio.value;
    customIntentInput.value = '';
  });
});

// Custom intent input — clears pill selection
customIntentInput.addEventListener('input', () => {
  const val = customIntentInput.value.trim();
  if (val) {
    intentOptions.forEach((o) => {
      o.classList.remove('selected');
      (o.querySelector('input[type="radio"]') as HTMLInputElement).checked = false;
    });
    document.querySelectorAll('.intent-option-custom').forEach((o) => o.classList.remove('selected'));
    selectedIntent = val;
  } else {
    selectedIntent = null;
  }
});

// Custom intent pills
const intentContainer = document.getElementById('intentOptions')!;

function renderCustomPill(intent: string): HTMLElement {
  const pill = document.createElement('label');
  pill.className = 'intent-option intent-option-custom';
  pill.dataset.intent = intent;
  pill.innerHTML = `<span class="intent-emoji">🏷️</span><span>${intent}</span><span class="intent-delete">&times;</span>`;
  pill.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('intent-delete')) {
      e.preventDefault();
      e.stopPropagation();
      removeCustomIntent(intent);
      pill.remove();
      if (selectedIntent === intent) selectedIntent = null;
      return;
    }
    intentOptions.forEach((o) => o.classList.remove('selected'));
    document.querySelectorAll('.intent-option-custom').forEach((o) => o.classList.remove('selected'));
    customIntentInput.value = '';
    pill.classList.add('selected');
    selectedIntent = intent;
  });
  return pill;
}

async function removeCustomIntent(intent: string): Promise<void> {
  try {
    const settings = await getSettings();
    const customs = (settings.customIntents || []).filter((c) => c !== intent);
    await saveSettings({ customIntents: customs });
  } catch { /* quiet */ }
}

async function persistCustomIntent(intent: string): Promise<void> {
  try {
    const settings = await getSettings();
    const customs = settings.customIntents || [];
    if (!customs.includes(intent)) {
      customs.push(intent);
      await saveSettings({ customIntents: customs });
    }
  } catch { /* quiet */ }
}

function loadCustomPills(): void {
  getSettings().then((settings) => {
    const customs = (settings.customIntents || []).filter((c) => !PRESET_INTENTS.some((p) => p.value === c));
    customs.forEach((intent) => { intentContainer.appendChild(renderCustomPill(intent)); });
  }).catch(() => {});
}

function getFaviconUrl(params: PopupParams): string {
  if (params.favIconUrl) return params.favIconUrl;
  try {
    return `${new URL(params.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

const POPUP_FLAG = 'laterme_popup_created';

// Save: create or update bookmark + meta
saveBtn.addEventListener('click', async () => {
  if (!popupParams) {
    window.close();
    return;
  }

  // Resolve final intent value
  const customVal = customIntentInput.value.trim();
  const intent: IntentType = customVal || selectedIntent;
  const note = noteInput.value.trim();

  // Persist new custom intent
  if (customVal && !PRESET_INTENTS.some((p) => p.value === customVal)) {
    await persistCustomIntent(customVal);
  }

  await chrome.storage.local.set({ [POPUP_FLAG]: Date.now() });

  let bookmarkId: string | undefined = popupParams.bookmarkId;
  if (bookmarkId) {
    try { await api.bookmarks.update(bookmarkId, { title: popupParams.title, url: popupParams.url }); } catch { /* keep existing */ }
  } else {
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
  }

  if (bookmarkId) {
    try {
      await runtime.sendMessage({
        type: 'SAVE_BOOKMARK_META',
        payload: { bookmarkId, url: popupParams.url, title: popupParams.title, note, intent },
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

// Init
initParams().then(() => {
  if (popupParams) {
    pageTitle.textContent = popupParams.title || popupParams.url;
    const favUrl = getFaviconUrl(popupParams);
    if (favUrl) {
      pageFavicon.src = favUrl;
    } else {
      pageFavicon.style.display = 'none';
    }
  }
  loadCustomPills();
  noteInput.focus();
});
