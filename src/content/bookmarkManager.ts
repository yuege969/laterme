import { runtime } from '../utils/browser';
import type { BookmarkMeta } from '../storage/types';

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

function showEditDialog(url: string, meta: BookmarkMeta): void {
  const newNote = prompt('修改备注（最多50字）：', meta.note);
  if (newNote === null) return; // cancelled
  if (newNote.trim() === '') {
    // Delete note
    runtime.sendMessage({
      type: 'UPDATE_META',
      payload: { url, note: '' },
    });
    metasCache.delete(url);
  } else {
    const trimmed = newNote.trim().substring(0, 50);
    runtime.sendMessage({
      type: 'UPDATE_META',
      payload: { url, note: trimmed },
    });
    if (metasCache.has(url)) {
      metasCache.get(url)!.note = trimmed;
    }
  }
  refreshBookmarkNotes();
}

function showAddDialog(url: string): void {
  const note = prompt('留一句话给未来的自己（最多50字）：');
  if (!note || note.trim() === '') return;
  const trimmed = note.trim().substring(0, 50);

  runtime.sendMessage({
    type: 'SAVE_BOOKMARK_META',
    payload: {
      url,
      note: trimmed,
      intent: null,
    },
  });

  metasCache.set(url, {
    url,
    note: trimmed,
    intent: null,
    createdAt: Date.now(),
    lastOpenedAt: Date.now(),
    openCount: 0,
    status: 'active',
  });

  refreshBookmarkNotes();
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
