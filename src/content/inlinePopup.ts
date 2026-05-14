// Inline popup injected directly into the page via Shadow DOM.

export interface InlinePopupParams {
  url: string;
  title: string;
  parentId?: string;
  summary?: string;
}

const HOST_ID = 'laterme-inline-popup-host';

// -- Styles (scoped to shadow root) -------------------------------------------
const CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

/* Backdrop */
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.3);
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Card */
.card {
  position: relative;
  width: 400px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05);
  animation: cardIn 0.22s cubic-bezier(0.16,1,0.3,1);
  overflow: hidden;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Page info */
.page-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px 14px;
}

.page-favicon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
}

.page-title {
  font-size: 13px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

/* Note input */
.note-section {
  padding: 0 20px 14px;
}

.note-input {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 15px;
  font-family: inherit;
  color: #1f2937;
  background: #f9fafb;
  resize: none;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  line-height: 1.5;
}

.note-input:focus {
  border-color: #4f46e5;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.10);
}

.note-input::placeholder {
  color: #c4c4c4;
}

.char-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.char-hint {
  font-size: 11px;
  color: #d1d5db;
}

.char-count {
  font-size: 11px;
  color: #c4c4c4;
}
.char-count.warn { color: #f59e0b; }
.char-count.full { color: #ef4444; }

/* Intent pills */
.intent-section {
  padding: 0 20px 4px;
}

.intent-label {
  font-size: 11px;
  font-weight: 500;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  padding: 5px 12px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: #6b7280;
  background: #f3f4f6;
  border: 1.5px solid transparent;
  transition: all 0.15s;
  user-select: none;
}

.intent-option:hover {
  background: #e5e7eb;
  color: #374151;
}

.intent-option.selected {
  background: #eef2ff;
  color: #4f46e5;
  border-color: #4f46e5;
}

.intent-option input[type="radio"] {
  display: none;
}

.intent-emoji {
  font-size: 13px;
  line-height: 1;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  border-top: 1px solid #f3f4f6;
  margin-top: 12px;
}

.footer-link {
  font-size: 12px;
  color: #9ca3af;
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
  transition: color 0.15s;
}
.footer-link:hover { color: #4f46e5; }

.btn-save {
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  background: #4f46e5;
  color: #fff;
  transition: all 0.15s;
}
.btn-save:hover  { background: #4338ca; }
.btn-save:active { background: #3730a3; transform: scale(0.98); }

.key-hint {
  font-size: 11px;
  color: #d1d5db;
  padding: 4px 20px 12px;
}
.key-hint kbd {
  display: inline-block;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  color: #9ca3af;
  background: #f3f4f6;
  border-radius: 3px;
  border: 1px solid #e5e7eb;
  margin: 0 2px;
}
`;

// -- HTML template -----------------------------------------------------------
function buildHTML(): string {
  return `
    <style>${CSS}</style>
    <div class="overlay" id="laterme-overlay"></div>
    <div class="card" id="laterme-card">
      <div class="page-info">
        <img class="page-favicon" id="pageFavicon" src="" alt="" />
        <span class="page-title" id="pageTitle"></span>
      </div>
      <div class="note-section">
        <textarea
          id="noteInput"
          class="note-input"
          placeholder="给未来的自己留句话..."
          maxlength="50"
          rows="2"
        ></textarea>
        <div class="char-row">
          <span class="char-hint">方便以后想起为什么要收藏</span>
          <span class="char-count"><span id="charCount">0</span>/50</span>
        </div>
      </div>
      <div class="intent-section">
        <div class="intent-label">分类（可选）</div>
        <div class="intent-options">
          <label class="intent-option" data-intent="project">
            <input type="radio" name="intent" value="project" />
            <span class="intent-emoji">🛠</span>
            <span>项目参考</span>
          </label>
          <label class="intent-option" data-intent="learn">
            <input type="radio" name="intent" value="learn" />
            <span class="intent-emoji">📖</span>
            <span>学习中</span>
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
        <button id="saveBtn" class="btn-save">保存</button>
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

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
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
  const favUrl = getFaviconUrl(params.url);
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
    if (len >= 50) charCount.className = 'full';
    else if (len >= 40) charCount.className = 'warn';
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
      payload: { title: params.title, url: params.url, parentId: params.parentId, note, intent: selectedIntent },
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

  // Click overlay to dismiss
  const overlay = shadow.getElementById('laterme-overlay')!;
  overlay.addEventListener('click', () => dismiss());

  // Pre-fill summary if available
  if (params.summary) {
    noteInput.value = params.summary;
    const len = params.summary.length;
    charCount.textContent = String(len);
    if (len >= 50) charCount.className = 'full';
    else if (len >= 40) charCount.className = 'warn';
  }

  noteInput.focus();
}
