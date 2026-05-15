import { runtime } from '../utils/browser';
import type { BookmarkMeta } from '../storage/types';
import { escapeHtml } from '../utils/format';

const NOTE_ATTR = 'data-laterme-url';
let metasCache: Map<string, BookmarkMeta> = new Map();

async function loadMetas(): Promise<void> {
  try {
    const response = await runtime.sendMessage({ type: 'GET_ALL_METAS' });
    if (response?.metas) {
      metasCache = new Map(
        (response.metas as BookmarkMeta[]).map((m) => [m.url, m])
      );
    }
  } catch {
    // background not ready
  }
}

function formatDaysAgo(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return `${days}天前`;
}

function getDaysColor(days: number): string {
  if (days > 180) return '#EF4444';
  if (days > 90) return '#F59E0B';
  return '#9CA3AF';
}

function getWarningIcon(days: number): string {
  if (days > 180) return ' ⚠️长期未读';
  if (days > 90) return ' ⚠️';
  return '';
}

function createNoteElement(meta: BookmarkMeta, url: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'laterme-note';
  container.setAttribute(NOTE_ATTR, url);

  const days = Math.floor(
    (Date.now() - meta.createdAt) / (1000 * 60 * 60 * 24)
  );
  const daysColor = getDaysColor(days);
  const warning = getWarningIcon(days);

  container.innerHTML = `
    <span class="laterme-note-icon">💬</span>
    <span class="laterme-note-text">"${escapeHtml(meta.note)}"</span>
    <span class="laterme-note-time" style="color:${daysColor}">· ${formatDaysAgo(meta.createdAt)}${warning}</span>
  `;

  container.addEventListener('click', (e) => {
    e.stopPropagation();
    showEditDialog(url, meta);
  });

  return container;
}

function createAddNoteElement(url: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'laterme-note laterme-note-empty';
  container.setAttribute(NOTE_ATTR, url);

  container.innerHTML = `
    <span class="laterme-note-icon">💬</span>
    <span class="laterme-note-add-text">点击添加备注</span>
  `;

  container.addEventListener('click', (e) => {
    e.stopPropagation();
    showAddDialog(url);
  });

  return container;
}

function sendMessageSafe(message: unknown): void {
  try {
    if (!chrome.runtime?.id) return;
  } catch { return; }
  try {
    runtime.sendMessage(message).catch(() => {});
  } catch { /* context invalidated */ }
}

// ── Inline editor (Shadow DOM) ──────────────────────────────────────────────
const EDITOR_HOST_ID = 'laterme-bm-editor-host';

function showInlineEditor(opts: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}): void {
  document.getElementById(EDITOR_HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = EDITOR_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
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
      .overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.3); }
      .card {
        position: relative;
        width: 360px;
        background: #fff;
        border-radius: 14px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.18);
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      textarea {
        width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb;
        border-radius: 8px; font-size: 14px; font-family: inherit;
        resize: none; outline: none; box-sizing: border-box;
      }
      textarea:focus { border-color: #4f46e5; }
      .row { display: flex; justify-content: space-between; align-items: center; }
      .count { font-size: 11px; color: #9ca3af; }
      .actions { display: flex; gap: 8px; justify-content: flex-end; }
      button {
        padding: 7px 18px; border: none; border-radius: 7px;
        font-size: 13px; font-family: inherit; cursor: pointer;
      }
      .save { background: #4f46e5; color: #fff; }
      .save:hover { background: #4338ca; }
      .cancel { background: #f3f4f6; color: #374151; }
      .cancel:hover { background: #e5e7eb; }
    </style>
    <div class="overlay" id="overlay"></div>
    <div class="card">
      <textarea id="input" maxlength="50" rows="2"></textarea>
      <div class="row">
        <span class="count"><span id="cnt">0</span>/50</span>
        <div class="actions">
          <button class="cancel" id="cancelBtn">取消</button>
          <button class="save" id="saveBtn">保存</button>
        </div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(host);

  const input = shadow.getElementById('input') as HTMLTextAreaElement;
  const cntEl = shadow.getElementById('cnt')!;
  input.value = opts.initialValue;
  cntEl.textContent = String(opts.initialValue.length);

  const close = () => host.remove();

  input.addEventListener('input', () => {
    cntEl.textContent = String(input.value.length);
  });

  shadow.getElementById('overlay')!.addEventListener('click', () => { close(); opts.onCancel(); });
  shadow.getElementById('cancelBtn')!.addEventListener('click', () => { close(); opts.onCancel(); });
  shadow.getElementById('saveBtn')!.addEventListener('click', () => {
    close();
    opts.onSave(input.value.trim().substring(0, 50));
  });

  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') { close(); opts.onCancel(); document.removeEventListener('keydown', handler); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(); opts.onSave(input.value.trim().substring(0, 50)); document.removeEventListener('keydown', handler); }
  }, true);

  // defer focus so shadow DOM is attached
  requestAnimationFrame(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); });
}

function showEditDialog(url: string, meta: BookmarkMeta): void {
  showInlineEditor({
    initialValue: meta.note,
    onCancel: () => { /* no-op */ },
    onSave: (newNote) => {
      if (newNote === '') {
        sendMessageSafe({ type: 'UPDATE_META', payload: { bookmarkId: meta.bookmarkId, note: '' } });
        metasCache.delete(url);
      } else {
        sendMessageSafe({ type: 'UPDATE_META', payload: { bookmarkId: meta.bookmarkId, note: newNote } });
        if (metasCache.has(url)) metasCache.get(url)!.note = newNote;
      }
      refreshBookmarkNotes();
    },
  });
}

async function showAddDialog(url: string): Promise<void> {
  let bookmarkId: string | undefined;
  let bmTitle = '';
  try {
    const results = await chrome.bookmarks.search({ url });
    if (results.length > 0) {
      bookmarkId = results[0].id;
      bmTitle = results[0].title || '';
    }
  } catch { /* quiet */ }
  if (!bookmarkId) return;

  showInlineEditor({
    initialValue: '',
    onCancel: () => { /* no-op */ },
    onSave: (note) => {
      if (!note) return;
      sendMessageSafe({
        type: 'SAVE_BOOKMARK_META',
        payload: { bookmarkId, url, title: bmTitle, note, intent: null },
      });
      metasCache.set(url, {
        bookmarkId: bookmarkId!,
        url, title: bmTitle, note, intent: null,
        createdAt: Date.now(), lastOpenedAt: Date.now(), openCount: 0, status: 'active',
      });
      refreshBookmarkNotes();
    },
  });
}


function findBookmarkLinks(): HTMLAnchorElement[] {
  // The native bookmarks page uses various structures
  // Try to find all bookmark link elements
  const links: HTMLAnchorElement[] = [];
  const allLinks = document.querySelectorAll('a[href]');
  allLinks.forEach((link) => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      links.push(link as HTMLAnchorElement);
    }
  });
  return links;
}

function refreshBookmarkNotes(): void {
  // Remove existing note elements
  document.querySelectorAll('.laterme-note').forEach((el) => el.remove());

  const links = findBookmarkLinks();
  for (const link of links) {
    const url = link.getAttribute('href')!;
    const meta = metasCache.get(url);

    if (meta && meta.note) {
      const noteEl = createNoteElement(meta, url);
      link.parentElement?.insertBefore(noteEl, link.nextSibling);
    }
  }
}

// Monitor DOM for dynamically loaded bookmarks
function observeBookmarkTree(): void {
  const observer = new MutationObserver(() => {
    // Debounce: refresh at most once per 500ms
    clearTimeout(observeBookmarkTree._timeout);
    observeBookmarkTree._timeout = setTimeout(refreshBookmarkNotes, 500);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial load
  setTimeout(refreshBookmarkNotes, 1000);
}
observeBookmarkTree._timeout = 0;

// Main init
loadMetas().then(() => {
  observeBookmarkTree();
});

// Re-load metas when receiving update from background
runtime.onMessage.addListener((message) => {
  const msg = message as { type: string };
  if (msg.type === 'REFRESH_METAS') {
    loadMetas().then(refreshBookmarkNotes);
  }
});
