// Inline popup injected directly into the page via Shadow DOM.

export interface InlinePopupParams {
  url: string;
  title: string;
  parentId?: string;
  bookmarkId?: string;
  summary?: string;
  favIconUrl?: string;
}

const HOST_ID = 'laterme-inline-popup-host';

// -- Styles (scoped to shadow root) -------------------------------------------
const CSS = `
:host {
  all: initial;
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Card — warm paper feel */
.card {
  width: 400px;
  max-width: calc(100vw - 32px);
  background: #fffef9;
  border-radius: 16px;
  box-shadow:
    0 0 0 1px rgba(180,160,130,0.12),
    0 4px 24px rgba(80,60,30,0.08),
    0 16px 64px rgba(80,60,30,0.06);
  animation: cardIn 0.25s cubic-bezier(0.22,1,0.36,1);
  overflow: hidden;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(-12px) scale(0.95); }
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Header */
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
  color: #3d2e1c;
  letter-spacing: -0.01em;
}

/* Page info */
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
  color: #a39378;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Note input */
.note-section {
  padding: 0 20px 12px;
}

.note-input {
  width: 100%;
  padding: 14px 16px;
  border: 1.5px solid #e8e0d3;
  border-radius: 12px;
  font-size: 15px;
  font-family: inherit;
  color: #3d2e1c;
  background: #fefcf7;
  resize: none;
  outline: none;
  transition: border-color 0.25s, box-shadow 0.25s, background 0.25s;
  line-height: 1.6;
}

.note-input:focus {
  border-color: #c4863b;
  background: #fffef9;
  box-shadow: 0 0 0 4px rgba(196,134,59,0.08);
}

.note-input::placeholder {
  color: #c4b89e;
  font-style: italic;
}

.char-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding: 0 4px;
}

.char-hint {
  font-size: 11px;
  color: #c4b89e;
}

.char-count {
  font-size: 11px;
  color: #c4b89e;
  font-variant-numeric: tabular-nums;
}
.char-count.warn { color: #d4933c; }
.char-count.full { color: #c4665a; }

/* Intent pills */
.intent-section {
  padding: 0 20px 6px;
}

.intent-label {
  font-size: 11px;
  font-weight: 600;
  color: #b8a083;
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
  padding: 6px 14px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: #8b7355;
  background: #faf6ef;
  border: 1.5px solid transparent;
  transition: all 0.2s;
  user-select: none;
}

.intent-option:hover {
  background: #f5ede0;
  color: #5c3d1a;
}

.intent-option.selected {
  background: #faf3e8;
  color: #b8761f;
  border-color: #d4a574;
}

.intent-option input[type="radio"] {
  display: none;
}

.intent-emoji {
  font-size: 14px;
  line-height: 1;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid #f0eadb;
  margin-top: 10px;
}

.footer-link {
  font-size: 12px;
  color: #b8a083;
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
  transition: color 0.2s;
}
.footer-link:hover { color: #8b6914; }

.btn-save {
  padding: 9px 28px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: linear-gradient(135deg, #d4933c 0%, #c4863b 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(180,120,40,0.25);
  transition: all 0.2s;
}
.btn-save:hover  {
  background: linear-gradient(135deg, #c4863b 0%, #b8761f 100%);
  box-shadow: 0 4px 16px rgba(180,120,40,0.35);
  transform: translateY(-1px);
}
.btn-save:active { transform: scale(0.97); }

.key-hint {
  font-size: 11px;
  color: #d4c9b5;
  padding: 2px 20px 12px;
}
.key-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  font-size: 10px;
  font-family: inherit;
  color: #b8a083;
  background: #faf6ef;
  border-radius: 4px;
  border: 1px solid #e8e0d3;
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
        </div>
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
  // Prefer caller-supplied URL (extracted from page DOM, no external request).
  if (params.favIconUrl) return params.favIconUrl;
  // Fallback: /favicon.ico of the target site (one same-origin request).
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
  const noteInput   = shadow.getElementById('noteInput')   as HTMLTextAreaElement;
  const charCount   = shadow.getElementById('charCount')   as HTMLSpanElement;
  const saveBtn     = shadow.getElementById('saveBtn')     as HTMLButtonElement;
  const pageTitle   = shadow.getElementById('pageTitle')   as HTMLSpanElement;
  const pageFavicon = shadow.getElementById('pageFavicon') as HTMLImageElement;
  const intentOpts  = shadow.querySelectorAll<HTMLElement>('.intent-option');

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

  // Intent selection
  intentOpts.forEach((opt) => {
    opt.addEventListener('click', () => {
      intentOpts.forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      const radio = opt.querySelector<HTMLInputElement>('input[type="radio"]')!;
      radio.checked = true;
      selectedIntent = radio.value;
    });
  });

  // Bookmarks link
  const bkmkLink = shadow.getElementById('bookmarksLink') as HTMLAnchorElement;
  bkmkLink.addEventListener('click', (e) => {
    e.preventDefault();
    removeInlinePopup();
    sendSafe({ type: 'OPEN_BOOKMARKS_PAGE' });
  });

  // Save
  saveBtn.addEventListener('click', () => {
    removeInlinePopup();
    const note = noteInput.value.trim();
    sendSafe({
      type: 'INLINE_SAVE',
      payload: { title: params.title, url: params.url, parentId: params.parentId, bookmarkId: params.bookmarkId, note, intent: selectedIntent },
    });
  });

  // Dismiss -- cancel, no bookmark created
  const dismiss = () => {
    removeInlinePopup();
  };

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

  // Click outside the popup to dismiss
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
