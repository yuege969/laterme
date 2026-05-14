// Inline popup injected directly into the page via Shadow DOM.
// Replaces the separate chrome.windows.create approach so the UI feels
// native and stays within the current tab.

export interface InlinePopupParams {
  url: string;
  title: string;
  parentId?: string;
  summary?: string;
}

const HOST_ID = 'laterme-inline-popup-host';

// ── Styles (scoped to shadow root) ───────────────────────────────────────────
const CSS = `
:host {
  all: initial;
  position: fixed;
  top: 70px;
  right: 16px;
  z-index: 2147483647;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.popup-container {
  width: 360px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  border: 1px solid #e5e7eb;
  font-size: 14px;
  color: #374151;
  overflow: hidden;
  animation: laterme-in 0.18s ease-out;
}

@keyframes laterme-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}

/* Arrow pointing up toward the star icon */
.popup-container::before {
  content: '';
  position: absolute;
  top: -8px;
  right: 28px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-left: 1px solid #e5e7eb;
  border-top: 1px solid #e5e7eb;
  transform: rotate(45deg);
}

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.popup-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid #f3f4f6;
}

.popup-title {
  font-size: 15px;
  font-weight: 600;
  color: #4f46e5;
}

.popup-body {
  padding: 14px 20px;
}

.input-wrapper {
  margin-bottom: 12px;
}

.note-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  color: #374151;
  background: #f9fafb;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
}

.note-input:focus {
  border-color: #4f46e5;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(79,70,229,0.10);
}

.note-input::placeholder {
  color: #9ca3af;
}

.char-count {
  text-align: right;
  font-size: 12px;
  color: #9ca3af;
  margin-top: 4px;
}
.char-count.warn { color: #f59e0b; }
.char-count.full { color: #ef4444; }

.intent-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  margin-bottom: 8px;
}

.intent-options {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.intent-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  background: #fff;
}

.intent-option:hover {
  border-color: #c7d2fe;
  background: #f5f3ff;
}

.intent-option.selected {
  border-color: #4f46e5;
  background: #eef2ff;
}

.intent-option input[type="radio"] {
  display: none;
}

.intent-radio {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #d1d5db;
  flex-shrink: 0;
  position: relative;
  transition: all 0.15s;
}

.intent-option.selected .intent-radio {
  border-color: #4f46e5;
  background: #4f46e5;
}

.intent-option.selected .intent-radio::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #fff;
}

.intent-text {
  font-size: 13px;
  color: #374151;
}

.popup-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 20px;
  border-top: 1px solid #f3f4f6;
  background: #f9fafb;
}

.footer-link {
  font-size: 12px;
  color: #9ca3af;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
  padding: 0;
}

.footer-link:hover {
  color: #4f46e5;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 7px 18px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-ghost {
  background: transparent;
  color: #6b7280;
}

.btn-ghost:hover {
  background: #f3f4f6;
  color: #374151;
}

.btn-primary {
  background: #4f46e5;
  color: #fff;
}

.btn-primary:hover  { background: #4338ca; }
.btn-primary:active { background: #3730a3; }
`;

// ── HTML template ─────────────────────────────────────────────────────────────
function buildHTML(bookmarksUrl: string): string {
  return `
    <style>${CSS}</style>
    <div class="popup-container" id="laterme-popup">
      <div class="popup-header">
        <h1 class="popup-title">留一句话给未来的自己</h1>
      </div>
      <div class="popup-body">
        <div class="input-wrapper">
          <textarea
            id="noteInput"
            class="note-input"
            placeholder="比如：下次做 4G 热插拔时参考..."
            maxlength="50"
            rows="2"
          ></textarea>
          <div class="char-count"><span id="charCount">0</span>/50 字</div>
        </div>
        <div class="intent-group">
          <label class="intent-label">这个收藏是想做什么用？</label>
          <div class="intent-options">
            <label class="intent-option" data-intent="project">
              <input type="radio" name="intent" value="project" />
              <span class="intent-radio"></span>
              <span class="intent-text">以后做项目时参考</span>
            </label>
            <label class="intent-option" data-intent="learn">
              <input type="radio" name="intent" value="learn" />
              <span class="intent-radio"></span>
              <span class="intent-text">学习时再看</span>
            </label>
            <label class="intent-option" data-intent="problem">
              <input type="radio" name="intent" value="problem" />
              <span class="intent-radio"></span>
              <span class="intent-text">解决特定问题时用</span>
            </label>
            <label class="intent-option" data-intent="temp">
              <input type="radio" name="intent" value="temp" />
              <span class="intent-radio"></span>
              <span class="intent-text">临时查看（3天后过期）</span>
            </label>
          </div>
        </div>
      </div>
      <div class="popup-footer">
        <a class="footer-link" id="bookmarksLink" href="${bookmarksUrl}" target="_blank">📌 查看所有书签</a>
        <div class="footer-actions">
          <button id="skipBtn" class="btn btn-ghost">跳过</button>
          <button id="saveBtn" class="btn btn-primary">保存</button>
        </div>
      </div>
    </div>
  `;
}

// ── Public API ────────────────────────────────────────────────────────────────

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

export function showInlinePopup(params: InlinePopupParams): void {
  removeInlinePopup();

  // Build bookmarks page URL while context is still valid
  const bookmarksUrl = isContextValid()
    ? chrome.runtime.getURL('bookmarks/index.html')
    : '';

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = buildHTML(bookmarksUrl);
  document.documentElement.appendChild(host);

  // ── element refs ──
  const noteInput   = shadow.getElementById('noteInput')   as HTMLTextAreaElement;
  const charCount   = shadow.getElementById('charCount')   as HTMLSpanElement;
  const skipBtn     = shadow.getElementById('skipBtn')     as HTMLButtonElement;
  const saveBtn     = shadow.getElementById('saveBtn')     as HTMLButtonElement;
  const intentOpts  = shadow.querySelectorAll<HTMLElement>('.intent-option');

  let selectedIntent: string | null = null;

  // char counter
  noteInput.addEventListener('input', () => {
    const len = noteInput.value.length;
    charCount.textContent = String(len);
    charCount.className = '';
    if (len >= 50) charCount.className = 'full';
    else if (len >= 40) charCount.className = 'warn';
  });

  // intent selection
  intentOpts.forEach((opt) => {
    opt.addEventListener('click', () => {
      intentOpts.forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      const radio = opt.querySelector<HTMLInputElement>('input[type="radio"]')!;
      radio.checked = true;
      selectedIntent = radio.value;
    });
  });

  // ── bookmarks link cleanup ──
  const bkmkLink = shadow.getElementById('bookmarksLink') as HTMLAnchorElement;
  bkmkLink.addEventListener('click', () => {
    // defer so the anchor's native navigation fires before popup removal
    setTimeout(() => removeInlinePopup(), 100);
  });

  // ── skip ──
  skipBtn.addEventListener('click', () => {
    removeInlinePopup();
    sendSafe({
      type: 'INLINE_SKIP',
      payload: { title: params.title, url: params.url, parentId: params.parentId },
    });
  });

  // ── save ──
  saveBtn.addEventListener('click', () => {
    removeInlinePopup();
    const note = noteInput.value.trim();
    sendSafe({
      type: 'INLINE_SAVE',
      payload: { title: params.title, url: params.url, parentId: params.parentId, note, intent: selectedIntent },
    });
  });

  // ── escape key — true cancel, no bookmark created ──
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeInlinePopup();
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('click', onOutsideClick, true);
    }
  };
  document.addEventListener('keydown', onKeydown, true);

  // ── click outside — true cancel, no bookmark created ──
  const onOutsideClick = (e: MouseEvent) => {
    if (e.target !== host && !host.contains(e.target as Node)) {
      removeInlinePopup();
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('click', onOutsideClick, true);
    }
  };
  // defer so the click that triggered showInlinePopup doesn't immediately close it
  setTimeout(() => document.addEventListener('click', onOutsideClick, true), 200);

  // Pre-fill summary if available
  if (params.summary) {
    noteInput.value = params.summary;
    const len = params.summary.length;
    charCount.textContent = String(len);
    if (len >= 50) charCount.className = 'full';
    else if (len >= 40) charCount.className = 'warn';
  }

  // focus textarea
  noteInput.focus();
}
