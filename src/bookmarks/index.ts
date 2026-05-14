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
  const metaMap = new Map(metas.map((m) => [m.bookmarkId, m]));

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
    meta: bm.id ? (metaMap.get(bm.id) || null) : null,
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
      const bookmarkId = bookmark.id || '';
      const hasNote = meta && meta.note;
      const daysAgo = meta
        ? Math.floor((Date.now() - meta.createdAt) / (1000 * 60 * 60 * 24))
        : 0;

      let noteHtml = '';
      if (hasNote) {
        noteHtml = `
          <div class="bookmark-note" data-bookmark-id="${escapeHtml(bookmarkId)}">
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
          <div class="bookmark-note" data-bookmark-id="${escapeHtml(bookmarkId)}" data-url="${escapeHtml(bmUrl)}">
            <span class="note-icon">💬</span>
            <span class="note-text-empty">点击添加备注</span>
          </div>`;
      }

      return `
        <div class="bookmark-item" data-bookmark-id="${escapeHtml(bookmarkId)}">
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
      const bookmarkId = (el as HTMLElement).dataset.bookmarkId;
      if (bookmarkId) {
        runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId } });
      }
    });
  });

  list.querySelectorAll('.bookmark-note').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const bookmarkId = (el as HTMLElement).dataset.bookmarkId;
      const url = (el as HTMLElement).dataset.url;
      if (!bookmarkId) return;
      const meta = allItems.find((i) => i.bookmark.id === bookmarkId)?.meta;
      if (meta?.note) {
        const newNote = prompt('修改备注（最多50字）：', meta.note);
        if (newNote !== null) {
          runtime.sendMessage({
            type: 'UPDATE_META',
            payload: { bookmarkId, note: newNote.trim().substring(0, 50) },
          }).then(() => loadData());
        }
      } else {
        const note = prompt('留一句话给未来的自己（最多50字）：');
        if (note && note.trim()) {
          runtime.sendMessage({
            type: 'SAVE_BOOKMARK_META',
            payload: {
              bookmarkId,
              url: url || '',
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

// ── Review Mode ────────────────────────────────────────────────────────────────

interface ReviewCandidate {
  bookmark: chrome.bookmarks.BookmarkTreeNode;
  meta: BookmarkMeta;
}

let reviewCandidates: ReviewCandidate[] = [];
let reviewIndex = 0;
let reviewStats = { kept: 0, archived: 0, deleted: 0 };

function getReviewCandidates(): ReviewCandidate[] {
  return allItems
    .filter((item) => {
      if (!item.meta) return false;
      if (!item.meta.note) return false;
      if (item.meta.status !== 'active') return false;
      return true;
    })
    .sort((a, b) => a.meta!.createdAt - b.meta!.createdAt)
    .map((item) => ({
      bookmark: item.bookmark,
      meta: item.meta!,
    }));
}

function openReviewMode(): void {
  reviewCandidates = getReviewCandidates();
  if (reviewCandidates.length === 0) {
    alert('没有需要复盘的书签。\n只有已添加备注且状态为活跃的书签才会出现在这里。');
    return;
  }
  reviewIndex = 0;
  reviewStats = { kept: 0, archived: 0, deleted: 0 };
  document.getElementById('reviewMode')!.classList.remove('hidden');
  document.getElementById('reviewComplete')!.classList.add('hidden');
  document.querySelector('.review-overlay')!.classList.remove('hidden');
  showReviewCard();
  document.addEventListener('keydown', onReviewKeydown);
}

function closeReviewMode(): void {
  document.getElementById('reviewMode')!.classList.add('hidden');
  document.removeEventListener('keydown', onReviewKeydown);
  loadData();
}

function showReviewCard(): void {
  if (reviewIndex >= reviewCandidates.length) {
    showReviewComplete();
    return;
  }

  const candidate = reviewCandidates[reviewIndex];
  const { bookmark, meta } = candidate;
  const bmUrl = bookmark.url || '';
  const daysAgo = Math.floor((Date.now() - meta.createdAt) / (1000 * 60 * 60 * 24));
  const lastOpenDays = meta.openCount > 0
    ? `${Math.floor((Date.now() - meta.lastOpenedAt) / (1000 * 60 * 60 * 24))} 天前打开过`
    : '从未打开';
  const total = reviewCandidates.length;
  const progress = Math.round((reviewIndex / total) * 100);

  document.getElementById('reviewProgress')!.style.width = `${progress}%`;
  document.getElementById('reviewProgressText')!.textContent = `已处理 ${reviewIndex}/${total}`;

  // Resolve intent label
  const intentLabels: Record<string, string> = {
    project: '项目参考',
    learn: '学习中',
    problem: '解决问题',
    temp: '临时查看',
  };

  document.getElementById('reviewCardBody')!.innerHTML = `
    <div class="review-card-title">
      <img class="review-card-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(bmUrl).hostname)}&sz=32" onerror="this.style.display='none'" />
      ${escapeHtml(bookmark.title)}
    </div>
    <div class="review-card-url">${escapeHtml(bmUrl)}</div>
    <div class="review-card-note">
      <div class="review-card-note-text">💬 "${escapeHtml(meta.note)}"</div>
    </div>
    <div class="review-card-meta">
      <span class="review-meta-tag old">📅 ${daysAgo} 天前收藏</span>
      ${meta.openCount === 0
        ? '<span class="review-meta-tag old">⚠️ 从未打开</span>'
        : `<span class="review-meta-tag">👁 ${meta.openCount} 次访问 · ${lastOpenDays}</span>`}
      ${meta.intent ? `<span class="review-meta-tag ${meta.intent === 'temp' ? 'warn' : ''}">${intentLabels[meta.intent] || meta.intent}</span>` : ''}
    </div>
  `;
}

async function reviewAction(action: 'keep' | 'archive' | 'delete'): Promise<void> {
  if (reviewIndex >= reviewCandidates.length) return;
  const candidate = reviewCandidates[reviewIndex];
  const { bookmarkId } = candidate.meta;

  switch (action) {
    case 'keep':
      reviewStats.kept++;
      break;
    case 'archive':
      reviewStats.archived++;
      await runtime.sendMessage({
        type: 'UPDATE_META',
        payload: { bookmarkId, status: 'archived' },
      });
      break;
    case 'delete':
      reviewStats.deleted++;
      await runtime.sendMessage({
        type: 'DELETE_BOOKMARK',
        payload: { bookmarkId },
      });
      break;
  }

  reviewIndex++;
  showReviewCard();
}

function showReviewComplete(): void {
  document.querySelector('.review-overlay')!.classList.add('hidden');
  document.getElementById('reviewComplete')!.classList.remove('hidden');
  document.getElementById('reviewStats')!.innerHTML = `
    保留了 ${reviewStats.kept} 个，归档了 ${reviewStats.archived} 个，删除了 ${reviewStats.deleted} 个
  `;
  document.removeEventListener('keydown', onReviewKeydown);
}

function onReviewKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    reviewAction('keep');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    reviewAction('archive');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    reviewAction('delete');
  } else if (e.key === 'Escape') {
    closeReviewMode();
  }
}

// Event bindings
document.getElementById('reviewBtn')?.addEventListener('click', openReviewMode);
document.getElementById('reviewExit')?.addEventListener('click', closeReviewMode);
document.getElementById('reviewBack')?.addEventListener('click', closeReviewMode);
document.getElementById('reviewKeep')?.addEventListener('click', () => reviewAction('keep'));
document.getElementById('reviewArchive')?.addEventListener('click', () => reviewAction('archive'));
document.getElementById('reviewDelete')?.addEventListener('click', () => reviewAction('delete'));
