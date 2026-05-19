// Inline popup and save toast injected directly into the page via Shadow DOM.

export interface InlinePopupParams {
  url: string;
  title: string;
  parentId?: string;
  bookmarkId?: string;
  summary?: string;
  favIconUrl?: string;
}

export interface SaveToastParams {
  url: string;
  title: string;
  bookmarkId: string;
}

const HOST_ID = 'laterme-inline-popup-host';
const TOAST_ID = 'laterme-save-toast-host';

// -- Toast Styles (scoped to shadow root) ------------------------------------
const TOAST_CSS = `
:host {
  --bg:             #fffef9;
  --surface:        #fefcf7;
  --border:         #e8e0d3;
  --text:           #3d2e1c;
  --text-2:         #8b7355;
  --accent:         #c4863b;
  --accent-hover:   #b8761f;
  --shadow-accent:  rgba(180,120,40,0.2);
}

:host {
  all: initial;
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 4px 16px var(--shadow-accent);
  animation: toastIn 0.25s cubic-bezier(0.22,1,0.36,1);
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(-8px); }
}

.toast-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
}

.toast-label { font-weight: 500; }

.toast-action {
  color: var(--accent);
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.toast-action:hover { color: var(--accent-hover); background: rgba(196,134,59,0.06); }

.toast-close {
  color: var(--text-2);
  cursor: pointer;
  background: none;
  border: none;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.toast-close:hover { opacity: 1; }

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
`;

// -- Styles (scoped to shadow root) -------------------------------------------
const CSS = `
/* ── Theme tokens (light default) ─────────────────────────────────── */
:host {
  --bg:             #fffef9;
  --bg-2:           #faf6ef;
  --surface:        #fefcf7;
  --border:         #e8e0d3;
  --border-focus:   #c4863b;
  --text:           #3d2e1c;
  --text-2:         #8b7355;
  --text-3:         #b8a083;
  --text-4:         #c4b89e;
  --text-5:         #d4c9b5;
  --accent:         #c4863b;
  --accent-hover:   #b8761f;
  --accent-light:   #d4933c;
  --pill-bg:        #faf6ef;
  --pill-hover:     #f5ede0;
  --pill-sel-bg:    #faf3e8;
  --pill-sel-text:  #b8761f;
  --pill-sel-bdr:   #d4a574;
  --footer-bdr:     #f0eadb;
  --shadow-accent:  rgba(180,120,40,0.25);
  --shadow-accent2: rgba(180,120,40,0.35);
  --kbd-bg:         #faf6ef;
  --card-shadow-1:  rgba(180,160,130,0.12);
  --card-shadow-2:  rgba(80,60,30,0.08);
  --card-shadow-3:  rgba(80,60,30,0.06);
}

:host {
  all: initial;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.card {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--bg);
  border-radius: 16px;
  box-shadow:
    0 0 0 1px var(--card-shadow-1),
    0 4px 24px var(--card-shadow-2),
    0 16px 64px var(--card-shadow-3);
  animation: cardIn 0.25s cubic-bezier(0.22,1,0.36,1);
  overflow: hidden;
}

@keyframes cardIn {
  from { opacity: 0; transform: scale(0.95); }
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.popup-header {
  padding: 18px 20px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.popup-header-emoji { font-size: 20px; line-height: 1; }

.popup-header-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

.page-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 14px;
}

.page-favicon {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
  opacity: 0.8;
}

.page-title {
  font-size: 12px;
  color: var(--text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-section { padding: 0 20px 12px; }

.note-input {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  resize: none;
  outline: none;
  transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
  line-height: 1.6;
}
.note-input:focus {
  border-color: var(--border-focus);
  background: var(--bg);
  box-shadow: 0 0 0 4px rgba(196,134,59,0.08);
}
.note-input::placeholder { color: var(--text-4); font-style: italic; }

.char-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding: 0 4px;
}

.char-hint { font-size: 11px; color: var(--text-4); }

.char-count {
  font-size: 11px;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.char-count.warn { color: var(--accent-light); }
.char-count.full { color: #c4665a; }

.intent-section { padding: 0 20px 6px; }

.intent-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 8px;
}

.intent-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.intent-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-2);
  background: var(--pill-bg);
  border: 1.5px solid transparent;
  transition: all 0.2s;
  user-select: none;
}
.intent-option:hover { background: var(--pill-hover); color: var(--text); }
.intent-option.selected {
  background: var(--pill-sel-bg);
  color: var(--pill-sel-text);
  border-color: var(--pill-sel-bdr);
}
.intent-option input[type="radio"] { display: none; }
.intent-emoji { font-size: 13px; line-height: 1; }

.intent-option-custom { position: relative; padding-right: 26px; }

.intent-delete {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-4);
  cursor: pointer;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}
.intent-option-custom:hover .intent-delete { opacity: 1; }
.intent-delete:hover { color: #c4665a; background: rgba(196,102,90,0.1); }

.custom-intent-input {
  width: 100%;
  margin-top: 8px;
  padding: 6px 12px;
  border: 1.5px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color 0.2s;
}
.custom-intent-input:focus { border-color: var(--border-focus); }
.custom-intent-input::placeholder { color: var(--text-4); }

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid var(--footer-bdr);
  margin-top: 10px;
}

.footer-link {
  font-size: 12px;
  color: var(--text-3);
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
  transition: color 0.2s;
}
.footer-link:hover { color: var(--accent-hover); }

.btn-save {
  padding: 9px 28px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%);
  color: #fff;
  box-shadow: 0 2px 8px var(--shadow-accent);
  transition: all 0.2s;
}
.btn-save:hover {
  box-shadow: 0 4px 16px var(--shadow-accent2);
  transform: translateY(-1px);
}
.btn-save:active { transform: scale(0.97); }

.key-hint {
  font-size: 11px;
  color: var(--text-5);
  padding: 2px 20px 12px;
}
.key-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-family: inherit;
  color: var(--text-3);
  background: var(--kbd-bg);
  border-radius: 4px;
  border: 1px solid var(--border);
  margin: 0 2px;
}
`;

// -- HTML template -----------------------------------------------------------
function buildHTML(): string {
  return `
    <style>${CSS}</style>
    <div class="card" id="laterme-card">
      <div class="popup-header">
        <span class="popup-header-emoji">💡</span>
        <span class="popup-header-text">给未来的自己留句话</span>
      </div>
      <div class="page-info">
        <img class="page-favicon" id="pageFavicon" src="" alt="" />
        <span class="page-title" id="pageTitle"></span>
      </div>
      <div class="note-section">
        <textarea
          id="noteInput"
          class="note-input"
          placeholder="现在的你，想对以后打开这个收藏的自己说些什么..."
          maxlength="120"
          rows="2"
        ></textarea>
        <div class="char-row">
          <span class="char-hint">以后回想起为什么要收藏</span>
          <span class="char-count"><span id="charCount">0</span>/120</span>
        </div>
      </div>
      <div class="intent-section">
        <div class="intent-label">分类（可选）</div>
        <div class="intent-options">
          <label class="intent-option" data-intent="project">
            <input type="radio" name="intent" value="project" />
            <span class="intent-emoji">🛠️</span>
            <span>项目参考</span>
          </label>
          <label class="intent-option" data-intent="learn">
            <input type="radio" name="intent" value="learn" />
            <span class="intent-emoji">📖</span>
            <span>学习阅读</span>
          </label>
          <label class="intent-option" data-intent="problem">
            <input type="radio" name="intent" value="problem" />
            <span class="intent-emoji">🔧</span>
            <span>解决问题</span>
          </label>
          <label class="intent-option" data-intent="temp">
            <input type="radio" name="intent" value="temp" />
            <span class="intent-emoji">⏳</span>
            <span>临时查看</span>
          </label>
          <label class="intent-option" data-intent="idea">
            <input type="radio" name="intent" value="idea" />
            <span class="intent-emoji">💡</span>
            <span>灵感想法</span>
          </label>
          <label class="intent-option" data-intent="buy">
            <input type="radio" name="intent" value="buy" />
            <span class="intent-emoji">🛒</span>
            <span>稍后购买</span>
          </label>
          <label class="intent-option" data-intent="fun">
            <input type="radio" name="intent" value="fun" />
            <span class="intent-emoji">🎬</span>
            <span>娱乐消遣</span>
          </label>
          <label class="intent-option" data-intent="reading">
            <input type="radio" name="intent" value="reading" />
            <span class="intent-emoji">📰</span>
            <span>待读文章</span>
          </label>
        </div>
        <input
          type="text"
          id="customIntentInput"
          class="custom-intent-input"
          placeholder="或输入自定义分类..."
          maxlength="20"
        />
      </div>
      <div class="footer">
        <a class="footer-link" id="bookmarksLink" href="#">所有书签</a>
        <button id="saveBtn" class="btn-save">种下这枚时间胶囊</button>
      </div>
      <div class="key-hint">
        <kbd>Enter</kbd> 保存 &nbsp; <kbd>Esc</kbd> 取消
      </div>
    </div>
  `;
}

// -- Public API --------------------------------------------------------------

export function removeInlinePopup(): void {
  document.getElementById(HOST_ID)?.remove();
}

function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function sendSafe(message: unknown): void {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage(message).catch(() => {});
  } catch { /* context invalidated */ }
}

function getFaviconUrl(params: InlinePopupParams): string {
  if (params.favIconUrl) return params.favIconUrl;
  try {
    return `${new URL(params.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function showInlinePopup(params: InlinePopupParams): void {
  removeInlinePopup();

  const host = document.createElement('div');
  host.id = HOST_ID;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = buildHTML();
  document.documentElement.appendChild(host);

  // -- element refs --
  const noteInput         = shadow.getElementById('noteInput')         as HTMLTextAreaElement;
  const charCount         = shadow.getElementById('charCount')         as HTMLSpanElement;
  const saveBtn           = shadow.getElementById('saveBtn')           as HTMLButtonElement;
  const pageTitle         = shadow.getElementById('pageTitle')         as HTMLSpanElement;
  const pageFavicon       = shadow.getElementById('pageFavicon')       as HTMLImageElement;
  const intentOpts        = shadow.querySelectorAll<HTMLElement>('.intent-option');
  const customIntentInput = shadow.getElementById('customIntentInput') as HTMLInputElement;

  let selectedIntent: string | null = null;

  // Page info
  pageTitle.textContent = params.title || params.url;
  const favUrl = getFaviconUrl(params);
  if (favUrl) {
    pageFavicon.src = favUrl;
  } else {
    pageFavicon.style.display = 'none';
  }

  // Char counter
  noteInput.addEventListener('input', () => {
    const len = noteInput.value.length;
    charCount.textContent = String(len);
    charCount.className = '';
    if (len >= 120) charCount.className = 'full';
    else if (len >= 100) charCount.className = 'warn';
  });

  // Intent pill selection — clears custom input
  intentOpts.forEach((opt) => {
    opt.addEventListener('click', () => {
      intentOpts.forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      const radio = opt.querySelector<HTMLInputElement>('input[type="radio"]')!;
      radio.checked = true;
      selectedIntent = radio.value;
      customIntentInput.value = '';
    });
  });

  // Custom intent input — clears pill selection
  customIntentInput.addEventListener('input', () => {
    const val = customIntentInput.value.trim();
    if (val) {
      intentOpts.forEach((o) => {
        o.classList.remove('selected');
        (o.querySelector('input[type="radio"]') as HTMLInputElement).checked = false;
      });
      // Also deselect any custom pills
      shadow.querySelectorAll('.intent-option-custom').forEach((o) => o.classList.remove('selected'));
      selectedIntent = val;
    } else {
      selectedIntent = null;
    }
  });

  // Custom intent pills — render and bind
  const intentContainer = shadow.querySelector('.intent-options')!;

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
      intentOpts.forEach((o) => o.classList.remove('selected'));
      shadow.querySelectorAll('.intent-option-custom').forEach((o) => o.classList.remove('selected'));
      (customIntentInput as HTMLInputElement).value = '';
      pill.classList.add('selected');
      selectedIntent = intent;
    });
    return pill;
  }

  async function removeCustomIntent(intent: string): Promise<void> {
    if (!isContextValid()) return;
    try {
      const data = await chrome.storage.local.get('settings');
      const settings = data.settings || {};
      const customs = (settings.customIntents || []).filter((c: string) => c !== intent);
      sendSafe({ type: 'SAVE_SETTINGS', payload: { customIntents: customs } });
    } catch { /* quiet */ }
  }

  async function persistCustomIntent(intent: string): Promise<void> {
    if (!isContextValid()) return;
    try {
      const data = await chrome.storage.local.get('settings');
      const settings = data.settings || {};
      const customs = [...(settings.customIntents || [])];
      if (!customs.includes(intent)) {
        customs.push(intent);
        sendSafe({ type: 'SAVE_SETTINGS', payload: { customIntents: customs } });
      }
    } catch { /* quiet */ }
  }

  // Preset intent values (mirrored from types.ts to avoid ES module imports in content script)
  const PRESET_VALUES = new Set(['project', 'learn', 'problem', 'temp', 'idea', 'buy', 'fun', 'reading']);

  // Load existing custom intents
  if (isContextValid()) {
    chrome.storage.local.get('settings').then((data) => {
      const settings = data.settings || {};
      const customs = (settings.customIntents || []).filter((c: string) => !PRESET_VALUES.has(c));
      customs.forEach((intent: string) => { intentContainer.appendChild(renderCustomPill(intent)); });
    }).catch(() => {});
  }

  // Bookmarks link
  const bkmkLink = shadow.getElementById('bookmarksLink') as HTMLAnchorElement;
  bkmkLink.addEventListener('click', (e) => {
    e.preventDefault();
    removeInlinePopup();
    sendSafe({ type: 'OPEN_BOOKMARKS_PAGE' });
  });

  // Save
  saveBtn.addEventListener('click', async () => {
    removeInlinePopup();
    const note = noteInput.value.trim();
    const customVal = customIntentInput.value.trim();
    const intent = customVal || selectedIntent;

    // Persist new custom intent
    if (customVal && !PRESET_VALUES.has(customVal)) {
      await persistCustomIntent(customVal);
    }

    sendSafe({
      type: 'INLINE_SAVE',
      payload: { title: params.title, url: params.url, parentId: params.parentId, bookmarkId: params.bookmarkId, note, intent },
    });
  });

  // Dismiss
  const dismiss = () => { removeInlinePopup(); };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      document.removeEventListener('keydown', onKeydown, true);
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      saveBtn.click();
      document.removeEventListener('keydown', onKeydown, true);
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  // Click outside to dismiss
  document.addEventListener('click', function onDocClick(e: Event) {
    if (!host.contains(e.target as Node)) {
      dismiss();
      document.removeEventListener('click', onDocClick);
    }
  });

  // Pre-fill summary if available
  if (params.summary) {
    noteInput.value = params.summary;
    const len = params.summary.length;
    charCount.textContent = String(len);
    if (len >= 120) charCount.className = 'full';
    else if (len >= 100) charCount.className = 'warn';
  }

  noteInput.focus();
}

// -- Save Toast ----------------------------------------------------------------

export function removeSaveToast(): void {
  document.getElementById(TOAST_ID)?.remove();
}

export function showSaveToast(params: SaveToastParams): void {
  removeSaveToast();

  const host = document.createElement('div');
  host.id = TOAST_ID;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>${TOAST_CSS}</style>
    <div class="toast">
      <span class="toast-dot"></span>
      <span class="toast-label">已收藏</span>
      <button class="toast-action" id="toastNoteBtn">添加备注</button>
      <button class="toast-close" id="toastCloseBtn">&times;</button>
    </div>
  `;
  document.documentElement.appendChild(host);

  let dismissed = false;
  let timer: ReturnType<typeof setTimeout>;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    removeSaveToast();
  };

  // Auto-dismiss after 4 seconds
  timer = setTimeout(dismiss, 4000);

  // "添加备注" → open full popup for notes
  const noteBtn = shadow.getElementById('toastNoteBtn') as HTMLButtonElement;
  noteBtn.addEventListener('click', () => {
    dismiss();
    showInlinePopup({
      url: params.url,
      title: params.title,
      bookmarkId: params.bookmarkId,
    });
  });

  // Close button
  const closeBtn = shadow.getElementById('toastCloseBtn') as HTMLButtonElement;
  closeBtn.addEventListener('click', dismiss);
}
