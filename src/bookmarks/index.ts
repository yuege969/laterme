import { runtime, api } from '../utils/browser';
import type { BookmarkMeta, IntentType } from '../storage/types';

const INTENT_LABELS: Record<string, string> = {
  project: '项目参考',
  learn: '学习中',
  problem: '解决问题',
  temp: '临时查看',
};

const INTENT_EMOJI: Record<string, string> = {
  project: '🛠',
  learn: '📖',
  problem: '🔧',
  temp: '⏳',
};

interface DisplayItem {
  bookmark: chrome.bookmarks.BookmarkTreeNode;
  meta: BookmarkMeta | null;
  folderPath: string;
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

  // Flatten bookmark tree, tracking folder paths
  const flat: { bookmark: chrome.bookmarks.BookmarkTreeNode; folderPath: string }[] = [];
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], parents: string[]): void {
    for (const node of nodes) {
      if (node.url) {
        flat.push({ bookmark: node, folderPath: parents.join(' / ') });
      }
      if (node.children) {
        walk(node.children, [...parents, node.title]);
      }
    }
  }
  walk(tree, []);

  allItems = flat.map(({ bookmark, folderPath }) => ({
    bookmark,
    folderPath,
    meta: bookmark.id ? (metaMap.get(bookmark.id) || null) : null,
  }));

  document.getElementById('bookmarkCount')!.textContent = `${allItems.length} 个书签`;
  render();
}

function getFilteredItems(): DisplayItem[] {
  let items = allItems;

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
  if (days > 365) return `${Math.floor(days / 365)} 年前`;
  if (days > 180) return '半年前';
  if (days > 90) return '3 个月前';
  if (days > 60) return '2 个月前';
  if (days > 30) return '1 个月前';
  return `${days} 天前`;
}

function getNoteAgeClass(ts: number): string {
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days > 180) return 'age-danger';
  if (days > 90) return 'age-warn';
  return '';
}

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

function getStatusClass(meta: BookmarkMeta | null): string {
  if (!meta) return '';
  if (meta.status === 'expired') return 'card-expired';
  if (meta.status === 'archived') return 'card-archived';
  return '';
}

function renderCard(bookmark: chrome.bookmarks.BookmarkTreeNode, meta: BookmarkMeta | null): string {
  const bmUrl = bookmark.url || '';
  const bookmarkId = bookmark.id || '';
  const hasNote = !!(meta && meta.note);
  const statusCls = getStatusClass(meta);

  let noteHtml = '';
  if (hasNote) {
    const ageCls = getNoteAgeClass(meta!.createdAt);
    noteHtml = `
      <div class="bm-meta-row">
        <div class="bm-note" data-bm-id="${escapeHtml(bookmarkId)}">
          <span class="bm-note-text">"${escapeHtml(meta!.note)}"</span>
        </div>
        <div class="bm-meta-right">
          ${meta!.intent ? `<span class="bm-intent ${meta!.intent}">${INTENT_EMOJI[meta!.intent] || ''} ${INTENT_LABELS[meta!.intent] || ''}</span>` : ''}
          <span class="bm-time ${ageCls}">${formatTime(meta!.createdAt)}</span>
        </div>
      </div>`;
  } else {
    noteHtml = `
      <div class="bm-meta-row">
        <div class="bm-note bm-note-empty" data-bm-id="${escapeHtml(bookmarkId)}" data-url="${escapeHtml(bmUrl)}">+ 添加备注</div>
        <div class="bm-meta-right">
          ${meta?.intent ? `<span class="bm-intent ${meta.intent}">${INTENT_EMOJI[meta.intent] || ''} ${INTENT_LABELS[meta.intent] || ''}</span>` : ''}
        </div>
      </div>`;
  }

  return `
    <div class="bm-card ${statusCls}" data-bm-id="${escapeHtml(bookmarkId)}">
      <div class="bm-main">
        <img class="bm-favicon" src="${getFaviconUrl(bmUrl)}" onerror="this.style.display='none'" />
        <div class="bm-content">
          <div class="bm-title">${escapeHtml(bookmark.title)}</div>
          <div class="bm-url">${escapeHtml(bmUrl)}</div>
        </div>
        <div class="bm-actions">
          ${meta?.status === 'expired' ? '<span class="bm-status-tag expired">已过期</span>' : ''}
          ${meta?.status === 'archived' ? '<span class="bm-status-tag archived">已归档</span>' : ''}
        </div>
      </div>
      ${noteHtml}
    </div>`;
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

  // Group items by folder path
  const groups = new Map<string, DisplayItem[]>();
  for (const item of items) {
    const key = item.folderPath || '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  // Sort groups: root first, then alphabetically
  const sortedGroups = [...groups.entries()].sort((a, b) => {
    if (a[0] === '未分类') return -1;
    if (b[0] === '未分类') return 1;
    return a[0].localeCompare(b[0], 'zh-CN');
  });

  let html = '';
  let folderIndex = 0;
  for (const [folderName, groupItems] of sortedGroups) {
    const folderId = 'f' + folderIndex++;
    const isFirst = folderIndex === 1;
    html += `
      <div class="folder-group">
        <div class="folder-header" data-folder="${folderId}">
          <span class="folder-arrow" id="arrow-${folderId}">${isFirst ? '▾' : '▸'}</span>
          <span class="folder-icon">📁</span>
          <span class="folder-name">${escapeHtml(folderName)}</span>
          <span class="folder-count">${groupItems.length}</span>
        </div>
        <div class="folder-items${isFirst ? '' : ' collapsed'}" id="${folderId}">
          ${groupItems.map(({ bookmark, meta }) => renderCard(bookmark, meta)).join('')}
        </div>
      </div>`;
  }
  list.innerHTML = html;

  // Bind folder collapse/expand
  list.querySelectorAll('.folder-header').forEach((header) => {
    header.addEventListener('click', () => {
      const folderId = (header as HTMLElement).dataset.folder!;
      const itemsEl = document.getElementById(folderId)!;
      const arrow = document.getElementById('arrow-' + folderId)!;
      const collapsed = itemsEl.classList.toggle('collapsed');
      arrow.textContent = collapsed ? '▸' : '▾';
    });
  });

  // Bind click handlers -- open bookmark
  list.querySelectorAll('.bm-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bm-note')) return;
      const bookmarkId = (el as HTMLElement).dataset.bmId;
      if (bookmarkId) {
        runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId } });
      }
    });
  });

  // Bind note click handlers -- inline edit
  list.querySelectorAll('.bm-note').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const bookmarkId = (el as HTMLElement).dataset.bmId;
      const url = (el as HTMLElement).dataset.url;
      if (!bookmarkId) return;
      showNoteEditor(el as HTMLElement, bookmarkId, url || '');
    });
  });
}

function showNoteEditor(el: HTMLElement, bookmarkId: string, url: string): void {
  const meta = allItems.find((i) => i.bookmark.id === bookmarkId)?.meta;
  const currentNote = meta?.note || '';

  // Replace element with inline editor
  const wrapper = document.createElement('div');
  wrapper.className = 'bm-note-editor';
  wrapper.innerHTML = `
    <input type="text" class="bm-note-input" value="${escapeHtml(currentNote)}" maxlength="50" placeholder="给未来的自己留句话..." />
    <div class="bm-note-actions">
      <span class="bm-note-count">${currentNote.length}/50</span>
      <button class="bm-note-save">保存</button>
      <button class="bm-note-cancel">取消</button>
    </div>
  `;
  el.replaceWith(wrapper);

  const input = wrapper.querySelector('.bm-note-input') as HTMLInputElement;
  const countEl = wrapper.querySelector('.bm-note-count')!;
  const saveBtn = wrapper.querySelector('.bm-note-save')!;
  const cancelBtn = wrapper.querySelector('.bm-note-cancel')!;

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  input.addEventListener('input', () => {
    countEl.textContent = `${input.value.length}/50`;
  });

  const cleanup = () => {
    wrapper.replaceWith(el);
    // Re-bind the click handler
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showNoteEditor(el, bookmarkId, url);
    });
  };

  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });

  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const newNote = input.value.trim().substring(0, 50);
    if (meta) {
      await runtime.sendMessage({
        type: 'UPDATE_META',
        payload: { bookmarkId, note: newNote },
      });
    } else {
      const bm = allItems.find((i) => i.bookmark.id === bookmarkId);
      await runtime.sendMessage({
        type: 'SAVE_BOOKMARK_META',
        payload: {
          bookmarkId,
          url: url || '',
          title: bm?.bookmark.title || '',
          note: newNote,
          intent: null,
        },
      });
    }
    await loadData();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cleanup();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      (saveBtn as HTMLButtonElement).click();
    }
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
    alert('没有需要复盘的书签。\n请先导入或收藏一些书签。');
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
      ${meta.note
        ? `<div class="review-card-note-text">💬 "${escapeHtml(meta.note)}"</div>`
        : '<div class="review-card-note-text review-card-no-note">还没有备注，要现在添加吗？</div>'}
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
