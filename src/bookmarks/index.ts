import { runtime, api } from '../utils/browser';
import type { BookmarkMeta, IntentType } from '../storage/types';

const INTENT_LABELS: Record<string, string> = {
  project: '项目参考',
  learn: '学习中',
  problem: '解决问题',
  temp: '临时查看',
};

interface DisplayItem {
  bookmark: chrome.bookmarks.BookmarkTreeNode;
  meta: BookmarkMeta | null;
}

let allItems: DisplayItem[] = [];
let currentFilter = 'all';
let searchQuery = '';

async function loadData(): Promise<void> {
  const [tree, metasResult] = await Promise.all([
    api.bookmarks.getTree(),
    runtime.sendMessage({ type: 'GET_ALL_METAS' }),
  ]);

  const metas = (metasResult?.metas || []) as BookmarkMeta[];
  const metaMap = new Map(metas.map((m) => [m.url, m]));

  // Flatten bookmark tree
  const flat: chrome.bookmarks.BookmarkTreeNode[] = [];
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[]): void {
    for (const node of nodes) {
      if (node.url) flat.push(node);
      if (node.children) walk(node.children);
    }
  }
  walk(tree);

  allItems = flat.map((bm) => ({
    bookmark: bm,
    meta: bm.url ? (metaMap.get(bm.url) || null) : null,
  }));

  document.getElementById('bookmarkCount')!.textContent = `${allItems.length} 个书签`;
  render();
}

function getFilteredItems(): DisplayItem[] {
  let items = allItems;

  // Filter by category
  switch (currentFilter) {
    case 'note':
      items = items.filter((i) => i.meta && i.meta.note);
      break;
    case 'temp':
      items = items.filter(
        (i) => i.meta?.intent === 'temp' && i.meta?.status === 'active'
      );
      break;
    case 'expired':
      items = items.filter((i) => i.meta?.status === 'expired');
      break;
    case 'archived':
      items = items.filter((i) => i.meta?.status === 'archived');
      break;
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(
      (i) =>
        i.bookmark.title.toLowerCase().includes(q) ||
        i.bookmark.url?.toLowerCase().includes(q) ||
        i.meta?.note?.toLowerCase().includes(q)
    );
  }

  return items;
}

function formatTime(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days > 180) return `<span class="note-age very-old">${days}天前</span>`;
  if (days > 90) return `<span class="note-age old">${days}天前</span>`;
  return `${days}天前`;
}

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

function render(): void {
  const list = document.getElementById('bookmarkList')!;
  const empty = document.getElementById('emptyState')!;
  const items = getFilteredItems();

  if (items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  list.innerHTML = items
    .map(({ bookmark, meta }) => {
      const bmUrl = bookmark.url || '';
      const hasNote = meta && meta.note;
      const daysAgo = meta
        ? Math.floor((Date.now() - meta.createdAt) / (1000 * 60 * 60 * 24))
        : 0;

      let noteHtml = '';
      if (hasNote) {
        noteHtml = `
          <div class="bookmark-note" data-url="${escapeHtml(bmUrl)}">
            <span class="note-icon">💬</span>
            <span class="note-text">"${escapeHtml(meta!.note)}"</span>
          </div>
          <div class="note-meta">
            ${meta!.intent ? `<span class="intent-tag ${meta!.intent} ${meta!.status === 'expired' ? 'expired' : ''} ${meta!.status === 'archived' ? 'archived' : ''}">${INTENT_LABELS[meta!.intent] || ''}</span>` : ''}
            <span>${formatTime(meta!.createdAt)}</span>
            ${meta!.status === 'expired' ? '<span class="intent-tag expired">已过期</span>' : ''}
            ${meta!.status === 'archived' ? '<span class="intent-tag archived">已归档</span>' : ''}
          </div>`;
      } else {
        noteHtml = `
          <div class="bookmark-note" data-url="${escapeHtml(bmUrl)}">
            <span class="note-icon">💬</span>
            <span class="note-text-empty">点击添加备注</span>
          </div>`;
      }

      return `
        <div class="bookmark-item" data-url="${escapeHtml(bmUrl)}">
          <div class="bookmark-item-row">
            <img class="bookmark-favicon" src="${getFaviconUrl(bmUrl)}" onerror="this.style.display='none'" />
            <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
          </div>
          <div class="bookmark-url">${escapeHtml(bmUrl)}</div>
          ${noteHtml}
        </div>`;
    })
    .join('');

  // Bind click handlers
  list.querySelectorAll('.bookmark-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      const url = (el as HTMLElement).dataset.url;
      if (url) {
        runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { url } });
      }
    });
  });

  list.querySelectorAll('.bookmark-note').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = (el as HTMLElement).dataset.url;
      if (!url) return;
      const meta = allItems.find((i) => i.bookmark.url === url)?.meta;
      if (meta?.note) {
        const newNote = prompt('修改备注（最多50字）：', meta.note);
        if (newNote !== null) {
          runtime.sendMessage({
            type: 'UPDATE_META',
            payload: { url, note: newNote.trim().substring(0, 50) },
          }).then(() => loadData());
        }
      } else {
        const note = prompt('留一句话给未来的自己（最多50字）：');
        if (note && note.trim()) {
          runtime.sendMessage({
            type: 'SAVE_BOOKMARK_META',
            payload: {
              url,
              note: note.trim().substring(0, 50),
              intent: null,
            },
          }).then(() => loadData());
        }
      }
    });
  });
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('.filter-btn')
      .forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = (btn as HTMLElement).dataset.filter || 'all';
    render();
  });
});

// Search
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  render();
});

// Open native bookmarks
document.getElementById('openNative')?.addEventListener('click', (e) => {
  e.preventDefault();
  api.tabs.create({ url: 'chrome://bookmarks/' });
});

// Init
loadData();
