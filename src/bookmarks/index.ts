import { runtime, api } from '../utils/browser';
import type { BookmarkMeta, IntentType, ResurfacingScore } from '../storage/types';
import { INTENT_LABELS, INTENT_EMOJI } from '../storage/types';
import { escapeHtml, getAgeDays, getDaysText } from '../utils/format';

interface DisplayItem {
  bookmark: chrome.bookmarks.BookmarkTreeNode;
  meta: BookmarkMeta | null;
  folderPath: string;
}

let allItems: DisplayItem[] = [];
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';

function sortItems(items: DisplayItem[]): DisplayItem[] {
  switch (currentSort) {
    case 'newest':
      return [...items].sort((a, b) => (b.bookmark.dateAdded || 0) - (a.bookmark.dateAdded || 0));
    case 'oldest':
      return [...items].sort((a, b) => (a.bookmark.dateAdded || 0) - (b.bookmark.dateAdded || 0));
    case 'name':
      return [...items].sort((a, b) => a.bookmark.title.localeCompare(b.bookmark.title, 'zh-CN'));
    default:
      return items;
  }
}

async function loadData(): Promise<void> {
  const [tree, metasResult] = await Promise.all([
    api.bookmarks.getTree(),
    runtime.sendMessage({ type: 'GET_ALL_METAS' }),
  ]);

  const metas = (metasResult?.metas || []) as BookmarkMeta[];
  const metaMap = new Map(metas.map((m) => [m.bookmarkId, m]));

  const SYSTEM_ROOTS = new Set(['书签栏', '其他书签', 'Bookmarks bar', 'Other bookmarks']);
  const flat: { bookmark: chrome.bookmarks.BookmarkTreeNode; folderPath: string }[] = [];
  function walk(nodes: chrome.bookmarks.BookmarkTreeNode[], parents: string[]): void {
    for (const node of nodes) {
      if (node.url) {
        flat.push({ bookmark: node, folderPath: parents.join(' / ') });
      }
      if (node.children) {
        const title = SYSTEM_ROOTS.has(node.title) ? '' : node.title;
        const next = title ? [...parents, title] : parents;
        walk(node.children, next);
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
  buildIntentFilters();
  render();
}

function buildIntentFilters(): void {
  const row = document.getElementById('intentFilterRow');
  if (!row) return;

  // Collect used intents in order of frequency
  const counts = new Map<string, number>();
  for (const item of allItems) {
    if (item.meta?.intent && item.meta.status === 'active') {
      counts.set(item.meta.intent, (counts.get(item.meta.intent) || 0) + 1);
    }
  }

  if (counts.size === 0) {
    row.innerHTML = '';
    row.style.display = 'none';
    return;
  }
  row.style.display = '';

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  row.innerHTML = sorted.map(([intent]) => {
    const emoji = INTENT_EMOJI[intent] || '🏷️';
    const label = INTENT_LABELS[intent] || intent;
    const filterVal = `intent:${intent}`;
    const active = currentFilter === filterVal ? ' active' : '';
    return `<button class="filter-btn${active}" data-filter="${escapeHtml(filterVal)}">${emoji} ${escapeHtml(label)}</button>`;
  }).join('');

  row.querySelectorAll<HTMLElement>('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      render();
    });
  });
}

function getFilteredItems(): DisplayItem[] {
  let items = allItems;

  if (currentFilter === 'note') {
    items = items.filter((i) => i.meta && i.meta.note);
  } else if (currentFilter === 'expired') {
    items = items.filter((i) => i.meta?.status === 'expired');
  } else if (currentFilter === 'archived') {
    items = items.filter((i) => i.meta?.status === 'archived');
  } else if (currentFilter.startsWith('intent:')) {
    const intent = currentFilter.slice(7);
    items = items.filter((i) => i.meta?.intent === intent && i.meta?.status === 'active');
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
  const days = Math.floor(getAgeDays(ts));
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
  const days = Math.floor(getAgeDays(ts));
  if (days > 180) return 'age-danger';
  if (days > 90) return 'age-warn';
  return '';
}

function getFaviconUrl(url: string): string {
  try {
    const pageUrl = encodeURIComponent(url);
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${pageUrl}&size=32`;
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

function getIntentDisplay(intent: IntentType): string {
  if (!intent) return '';
  const emoji = INTENT_EMOJI[intent] || '🏷️';
  const label = INTENT_LABELS[intent] || intent;
  return `<span class="bm-intent">${escapeHtml(emoji)} ${escapeHtml(label)}</span>`;
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
          ${meta!.intent ? getIntentDisplay(meta!.intent) : ''}
          <span class="bm-time ${ageCls}">${formatTime(meta!.createdAt)}</span>
        </div>
      </div>`;
  } else {
    noteHtml = `
      <div class="bm-meta-row">
        <div class="bm-note bm-note-empty" data-bm-id="${escapeHtml(bookmarkId)}" data-url="${escapeHtml(bmUrl)}">+ 添加备注</div>
        <div class="bm-meta-right">
          ${meta?.intent ? getIntentDisplay(meta.intent) : ''}
        </div>
      </div>`;
  }

  return `
    <div class="bm-card ${statusCls}" data-bm-id="${escapeHtml(bookmarkId)}">
      <div class="bm-main">
        <img class="bm-favicon" src="${getFaviconUrl(bmUrl)}" data-fallback="hide" />
        <div class="bm-content">
          <div class="bm-title">${escapeHtml(bookmark.title)}</div>
          <div class="bm-url">${escapeHtml(bmUrl)}</div>
          ${bookmark.dateAdded ? `<div class="bm-added">收藏于 ${formatTime(bookmark.dateAdded)}</div>` : ''}
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

  const groups = new Map<string, DisplayItem[]>();
  for (const item of items) {
    const key = item.folderPath || '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  const sortedGroups = [...groups.entries()].sort((a, b) => {
    if (a[0] === '未分类') return -1;
    if (b[0] === '未分类') return 1;
    return a[0].localeCompare(b[0], 'zh-CN');
  });

  const singleFolder = sortedGroups.length <= 1;
  let html = '';
  let folderIndex = 0;

  for (const [folderName, groupItems] of sortedGroups) {
    const folderId = 'f' + folderIndex++;
    const sortedItems = sortItems(groupItems);
    const cardsHtml = sortedItems.map(({ bookmark, meta }) => renderCard(bookmark, meta)).join('');

    if (singleFolder) {
      html += `<div class="folder-items" id="${folderId}">${cardsHtml}</div>`;
    } else {
      html += `
        <div class="folder-group">
          <div class="folder-header" data-folder="${folderId}">
            <span class="folder-name">${escapeHtml(folderName)}</span>
            <span class="folder-count">${groupItems.length} 条</span>
            <span class="folder-arrow" id="arrow-${folderId}">▸</span>
          </div>
          <div class="folder-items collapsed" id="${folderId}">${cardsHtml}</div>
        </div>`;
    }
  }

  list.innerHTML = html;

  list.querySelectorAll<HTMLImageElement>('img[data-fallback="hide"]').forEach((img) => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });

  list.querySelectorAll('.folder-header').forEach((header) => {
    header.addEventListener('click', () => {
      const folderId = (header as HTMLElement).dataset.folder!;
      const itemsEl = document.getElementById(folderId)!;
      const arrow = document.getElementById('arrow-' + folderId)!;
      const collapsed = itemsEl.classList.toggle('collapsed');
      arrow.textContent = collapsed ? '▸' : '▾';
    });
  });

  list.querySelectorAll('.bm-card').forEach((el) => {
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.bm-note')) return;
      const bookmarkId = (el as HTMLElement).dataset.bmId;
      if (bookmarkId) {
        runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId } });
      }
    });
  });

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

  const wrapper = document.createElement('div');
  wrapper.className = 'bm-note-editor';
  wrapper.innerHTML = `
    <input type="text" class="bm-note-input" value="${escapeHtml(currentNote)}" maxlength="120" placeholder="给未来的自己留句话..." />
    <div class="bm-note-actions">
      <span class="bm-note-count">${currentNote.length}/120</span>
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
    countEl.textContent = `${input.value.length}/120`;
  });

  const cleanup = () => {
    wrapper.replaceWith(el);
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
    const newNote = input.value.trim().substring(0, 120);
    if (meta) {
      await runtime.sendMessage({
        type: 'UPDATE_META',
        payload: { bookmarkId, note: newNote },
      });
    } else {
      const bm = allItems.find((i) => i.bookmark.id === bookmarkId);
      await runtime.sendMessage({
        type: 'SAVE_BOOKMARK_META',
        payload: { bookmarkId, url: url || '', title: bm?.bookmark.title || '', note: newNote, intent: null },
      });
    }
    await loadData();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cleanup();
    if (e.key === 'Enter') {
      e.preventDefault();
      (saveBtn as HTMLButtonElement).click();
    }
  });
}

// Static filter buttons (all, note, expired, archived)
document.querySelectorAll('.filter-btn[data-filter]').forEach((btn) => {
  const filter = (btn as HTMLElement).dataset.filter || '';
  if (filter.startsWith('intent:')) return; // handled by buildIntentFilters
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = filter;
    render();
  });
});

// Search
document.getElementById('searchInput')?.addEventListener('input', (e) => {
  searchQuery = (e.target as HTMLInputElement).value;
  render();
});

// Sort
document.getElementById('sortSelect')?.addEventListener('change', (e) => {
  currentSort = (e.target as HTMLSelectElement).value;
  render();
});

// Open native bookmarks
document.getElementById('openNative')?.addEventListener('click', (e) => {
  e.preventDefault();
  api.tabs.create({ url: 'chrome://bookmarks/' });
});

// ── Resurfacing Banner ──────────────────────────────────────────────────────────

async function checkResurfacing(): Promise<void> {
  const banner = document.getElementById('resurfacingBanner');
  if (!banner) return;

  try {
    const data = await chrome.storage.local.get([
      'pendingResurfacing',
      'pendingResurfacingList',
      'pendingResurfacingDate',
    ]);
    const date = data.pendingResurfacingDate as string | undefined;
    const today = new Date().toDateString();
    if (date !== today) return;

    const list = data.pendingResurfacingList as ResurfacingScore[] | undefined;
    const single = data.pendingResurfacing as ResurfacingScore | undefined;
    const items = list ?? (single ? [single] : []);
    if (items.length === 0) return;

    if (items.length === 1) {
      showResurfacingSingle(banner, items[0]);
    } else {
      showResurfacingBatch(banner, items);
    }

    await chrome.storage.local.remove(['pendingResurfacing', 'pendingResurfacingList']);
  } catch { /* quiet */ }
}

function showResurfacingSingle(banner: HTMLElement, score: ResurfacingScore): void {
  const daysEl = document.getElementById('bmResurfacingDays');
  const titleEl = document.getElementById('bmResurfacingTitle');
  const noteEl = document.getElementById('bmResurfacingNote');
  const openBtn = document.getElementById('bmResurfacingOpen');
  const snoozeBtn = document.getElementById('bmResurfacingSnooze');
  const archiveBtn = document.getElementById('bmResurfacingArchive');
  const closeBtn = document.getElementById('bmResurfacingClose');

  if (daysEl) daysEl.textContent = getDaysText(score.createdAt, !!score.note);
  if (titleEl) titleEl.textContent = score.title || score.url;
  if (noteEl) noteEl.textContent = score.note ? `💬 "${score.note}"` : '这个收藏还没有备注';

  banner.classList.remove('hidden');

  const close = () => banner.classList.add('hidden');

  openBtn?.addEventListener('click', async () => {
    await runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'opened' } });
    runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId: score.bookmarkId } });
    close();
  });

  snoozeBtn?.addEventListener('click', async () => {
    await runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'snoozed' } });
    await runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId: score.bookmarkId, nextReminderAt: Date.now() + 3 * 24 * 60 * 60 * 1000 } });
    close();
  });

  archiveBtn?.addEventListener('click', async () => {
    await runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'dismissed' } });
    await runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId: score.bookmarkId, status: 'archived' } });
    showBmUndoToast(banner, score.bookmarkId);
  });

  closeBtn?.addEventListener('click', close);

  runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'ignored' } }).catch(() => {});
}

function showResurfacingBatch(banner: HTMLElement, items: ResurfacingScore[]): void {
  const inner = banner.querySelector('.bm-resurfacing-inner') as HTMLElement;
  if (!inner) return;

  const listHtml = items.map((score, i) => `
    <div class="bm-resurfacing-batch-item" data-idx="${i}">
      <div class="bm-resurfacing-batch-title">${escapeHtml(score.title || score.url)}</div>
      ${score.note ? `<div class="bm-resurfacing-batch-note">💬 "${escapeHtml(score.note)}"</div>` : ''}
      <div class="bm-resurfacing-batch-actions">
        <button class="bm-resurfacing-btn bm-resurfacing-btn-open" data-idx="${i}">打开</button>
        <button class="bm-resurfacing-btn bm-resurfacing-btn-archive" data-idx="${i}">不再提醒</button>
      </div>
    </div>
  `).join('');

  inner.innerHTML = `
    <button class="bm-resurfacing-close" id="bmResurfacingBatchClose">&times;</button>
    <div class="bm-resurfacing-header">
      <span class="bm-resurfacing-icon">📌</span>
      <span class="bm-resurfacing-days">本周收藏回顾 · ${items.length} 条</span>
    </div>
    <div class="bm-resurfacing-batch-list">${listHtml}</div>
  `;

  banner.classList.remove('hidden');

  const close = () => banner.classList.add('hidden');
  document.getElementById('bmResurfacingBatchClose')?.addEventListener('click', close);

  inner.querySelectorAll<HTMLButtonElement>('.bm-resurfacing-btn-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      const score = items[Number(btn.dataset.idx)];
      runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'opened' } });
      runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId: score.bookmarkId } });
    });
  });

  inner.querySelectorAll<HTMLButtonElement>('.bm-resurfacing-btn-archive').forEach((btn) => {
    btn.addEventListener('click', () => {
      const score = items[Number(btn.dataset.idx)];
      const row = btn.closest('.bm-resurfacing-batch-item') as HTMLElement;
      runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'dismissed' } }).catch(() => {});
      runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId: score.bookmarkId, status: 'archived' } }).catch(() => {});
      if (row) showBmUndoToast(row, score.bookmarkId);
    });
  });

  items.forEach((score) => {
    runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'ignored' } }).catch(() => {});
  });
}

function showBmUndoToast(container: HTMLElement, bookmarkId: string): void {
  const originalHTML = container.innerHTML;
  container.innerHTML = `<div class="bm-resurfacing-toast">已归档 · <button class="bm-resurfacing-toast-undo">撤销</button></div>`;
  let undone = false;

  container.querySelector('.bm-resurfacing-toast-undo')?.addEventListener('click', async () => {
    undone = true;
    await runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId, status: 'active' } });
    container.innerHTML = originalHTML;
  });

  setTimeout(() => {
    if (!undone) container.style.display = 'none';
  }, 5000);
}

// Init
loadData();
checkResurfacing();

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
    .filter((item) => item.meta && item.meta.status === 'active')
    .sort((a, b) => a.meta!.createdAt - b.meta!.createdAt)
    .map((item) => ({ bookmark: item.bookmark, meta: item.meta! }));
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
  const createdAt = bookmark.dateAdded || meta.createdAt;
  const daysAgo = Math.floor(getAgeDays(createdAt));
  const lastOpenDays = meta.openCount > 0
    ? `${Math.floor(getAgeDays(meta.lastOpenedAt))} 天前打开过`
    : '从未打开';
  const total = reviewCandidates.length;
  const progress = Math.round((reviewIndex / total) * 100);

  document.getElementById('reviewProgress')!.style.width = `${progress}%`;
  document.getElementById('reviewProgressText')!.textContent = `已处理 ${reviewIndex}/${total}`;

  const intentTag = meta.intent
    ? `<span class="review-meta-tag ${meta.intent === 'temp' ? 'warn' : ''}">${INTENT_EMOJI[meta.intent] || '🏷️'} ${INTENT_LABELS[meta.intent] || meta.intent}</span>`
    : '';

  document.getElementById('reviewCardBody')!.innerHTML = `
    <div class="review-card-title">
      <img class="review-card-favicon" src="${getFaviconUrl(bmUrl)}" data-fallback="hide" />
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
      ${intentTag}
    </div>
  `;

  document.querySelector<HTMLImageElement>('.review-card-favicon[data-fallback="hide"]')
    ?.addEventListener('error', (e) => { (e.target as HTMLImageElement).style.display = 'none'; });
}

async function reviewAction(action: 'open' | 'keep' | 'archive' | 'delete'): Promise<void> {
  if (reviewIndex >= reviewCandidates.length) return;
  const candidate = reviewCandidates[reviewIndex];
  const { bookmarkId } = candidate.meta;

  switch (action) {
    case 'open':
      runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId } });
      return;
    case 'keep':
      reviewStats.kept++;
      break;
    case 'archive':
      reviewStats.archived++;
      await runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId, status: 'archived' } });
      break;
    case 'delete':
      reviewStats.deleted++;
      await runtime.sendMessage({ type: 'DELETE_BOOKMARK', payload: { bookmarkId } });
      break;
  }

  reviewIndex++;
  showReviewCard();
}

function showReviewComplete(): void {
  document.querySelector('.review-overlay')!.classList.add('hidden');
  document.getElementById('reviewComplete')!.classList.remove('hidden');
  document.getElementById('reviewStats')!.innerHTML = `
    🌱 保留了 ${reviewStats.kept} 颗种子 · 📦 归档了 ${reviewStats.archived} 个 · 🗑 清理了 ${reviewStats.deleted} 个
  `;
  document.removeEventListener('keydown', onReviewKeydown);
}

function onReviewKeydown(e: KeyboardEvent): void {
  if (e.key === 'ArrowUp')    { e.preventDefault(); reviewAction('open'); }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); reviewAction('keep'); }
  else if (e.key === 'ArrowDown')  { e.preventDefault(); reviewAction('archive'); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); reviewAction('delete'); }
  else if (e.key === 'Escape')     { closeReviewMode(); }
}

document.getElementById('reviewBtn')?.addEventListener('click', openReviewMode);
document.getElementById('reviewExit')?.addEventListener('click', closeReviewMode);
document.getElementById('reviewBack')?.addEventListener('click', closeReviewMode);
document.getElementById('reviewOpen')?.addEventListener('click', () => reviewAction('open'));
document.getElementById('reviewKeep')?.addEventListener('click', () => reviewAction('keep'));
document.getElementById('reviewArchive')?.addEventListener('click', () => reviewAction('archive'));
document.getElementById('reviewDelete')?.addEventListener('click', () => reviewAction('delete'));
