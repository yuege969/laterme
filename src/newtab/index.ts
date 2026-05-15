import { runtime } from '../utils/browser';
import type { ResurfacingScore } from '../storage/types';

// Clock
function updateClock(): void {
  const now = new Date();
  const clock = document.getElementById('clock');
  const dateEl = document.getElementById('date');
  if (clock) {
    clock.textContent = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  }
}
updateClock();
setInterval(updateClock, 10000);

// Search
document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const query = (e.target as HTMLInputElement).value.trim();
    if (query) {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
  }
});

// Resurfacing
async function checkResurfacing(): Promise<void> {
  // Check if already shown today
  try {
    const shown = await runtime.sendMessage({ type: 'WAS_SHOWN_TODAY' });
    if (shown?.shown) return;
  } catch {
    return;
  }

  // Check for pending resurfacing from background alarm
  try {
    const data = await chrome.storage.local.get([
      'pendingResurfacing',
      'pendingResurfacingList',
      'pendingResurfacingDate',
    ]);
    const date = data.pendingResurfacingDate as string | undefined;
    const today = new Date().toDateString();

    if (date === today) {
      const list = data.pendingResurfacingList as ResurfacingScore[] | undefined;
      const single = data.pendingResurfacing as ResurfacingScore | undefined;
      const items = list ?? (single ? [single] : []);
      if (items.length > 0) {
        showBannerList(items);
        await chrome.storage.local.remove(['pendingResurfacing', 'pendingResurfacingList']);
        return;
      }
    }
  } catch {
    // quiet
  }

  // Manual trigger via background
  try {
    const result = await runtime.sendMessage({ type: 'TRIGGER_RESURFACING' });
    if (result?.result) {
      showBannerList([result.result as ResurfacingScore]);
    }
  } catch {
    // quiet
  }
}

function getDaysText(score: ResurfacingScore): string {
  const ageDays = Math.floor((Date.now() - score.createdAt) / (1000 * 60 * 60 * 24));
  if (score.note) {
    if (ageDays >= 180) return '半年前的你，给现在的你留了一句话';
    if (ageDays >= 90) return '3个月前的你，给现在的你留了一句话';
    if (ageDays >= 60) return '2个月前的你，给现在的你留了一句话';
    if (ageDays >= 30) return '1个月前的你，给现在的你留了一句话';
    return '以前的你，给现在的你留了一句话';
  } else {
    if (ageDays >= 180) return '这个收藏已经沉睡了半年';
    if (ageDays >= 90) return '这个收藏已经沉睡了 3 个月';
    if (ageDays >= 60) return '这个收藏已经沉睡了 2 个月';
    if (ageDays >= 30) return '这个收藏已经沉睡了 1 个月';
    return '以前收藏的页面，还记得吗？';
  }
}

function showBannerList(items: ResurfacingScore[]): void {
  if (items.length === 0) return;
  // Single item: use the original banner layout
  if (items.length === 1) {
    showBanner(items[0]);
    return;
  }

  // Multiple items (weekly batch): render a card list inside the banner area
  const banner = document.getElementById('resurfacingBanner');
  if (!banner) return;

  banner.innerHTML = `
    <div class="resurfacing-inner resurfacing-batch">
      <button class="resurfacing-close" id="resurfacingClose">×</button>
      <div class="resurfacing-header">
        <span class="resurfacing-icon">📌</span>
        <span class="resurfacing-days">本周收藏回顾 · ${items.length} 条</span>
      </div>
      <div class="resurfacing-batch-list" id="batchList"></div>
    </div>
  `;
  banner.classList.remove('hidden');

  const list = document.getElementById('batchList')!;
  items.forEach((score, i) => {
    const row = document.createElement('div');
    row.className = 'resurfacing-batch-item';
    row.innerHTML = `
      <div class="resurfacing-batch-title">${escapeHtml(score.title || score.url)}</div>
      ${score.note ? `<div class="resurfacing-batch-note">💬 "${escapeHtml(score.note)}"</div>` : ''}
      <div class="resurfacing-batch-actions">
        <button class="resurfacing-btn resurfacing-btn-open" data-idx="${i}">打开</button>
        <button class="resurfacing-btn resurfacing-btn-archive" data-idx="${i}">不再提醒</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll<HTMLButtonElement>('.resurfacing-btn-open').forEach((btn) => {
    btn.addEventListener('click', () => {
      const score = items[Number(btn.dataset.idx)];
      runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId: score.bookmarkId } });
      runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'opened' } }).catch(() => {});
    });
  });

  list.querySelectorAll<HTMLButtonElement>('.resurfacing-btn-archive').forEach((btn) => {
    btn.addEventListener('click', () => {
      const score = items[Number(btn.dataset.idx)];
      runtime.sendMessage({ type: 'UPDATE_META', payload: { bookmarkId: score.bookmarkId, status: 'archived' } }).catch(() => {});
      btn.closest('.resurfacing-batch-item')?.remove();
      if (document.querySelectorAll('.resurfacing-batch-item').length === 0) banner.classList.add('hidden');
    });
  });

  document.getElementById('resurfacingClose')?.addEventListener('click', () => banner.classList.add('hidden'));

  // Log all shown
  items.forEach((score) => {
    runtime.sendMessage({ type: 'LOG_RESURFACING_ACTION', payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'ignored' } }).catch(() => {});
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showBanner(score: ResurfacingScore): void {
  const banner = document.getElementById('resurfacingBanner');
  if (!banner) return;

  const daysEl = document.getElementById('resurfacingDays');
  const titleEl = document.getElementById('resurfacingTitle');
  const noteEl = document.getElementById('resurfacingNote');

  if (daysEl) daysEl.textContent = getDaysText(score);
  if (titleEl) titleEl.textContent = score.title || score.url;
  if (noteEl) {
    noteEl.textContent = score.note ? `💬 "${score.note}"` : '这个收藏还没有备注';
  }

  banner.classList.remove('hidden');

  // Action buttons
  document.getElementById('resurfacingOpen')?.addEventListener('click', async () => {
    await runtime.sendMessage({
      type: 'LOG_RESURFACING_ACTION',
      payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'opened' },
    });
    runtime.sendMessage({ type: 'OPEN_BOOKMARK', payload: { bookmarkId: score.bookmarkId } });
    banner.classList.add('hidden');
  });

  document.getElementById('resurfacingSnooze')?.addEventListener('click', async () => {
    await runtime.sendMessage({
      type: 'LOG_RESURFACING_ACTION',
      payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'snoozed' },
    });
    await runtime.sendMessage({
      type: 'UPDATE_META',
      payload: {
        bookmarkId: score.bookmarkId,
        nextReminderAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
      },
    });
    banner.classList.add('hidden');
  });

  document.getElementById('resurfacingArchive')?.addEventListener('click', async () => {
    await runtime.sendMessage({
      type: 'LOG_RESURFACING_ACTION',
      payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'dismissed' },
    });
    await runtime.sendMessage({
      type: 'UPDATE_META',
      payload: { bookmarkId: score.bookmarkId, status: 'archived' },
    });
    banner.classList.add('hidden');
  });

  document.getElementById('resurfacingClose')?.addEventListener('click', () => {
    banner.classList.add('hidden');
  });

  // Log the show
  runtime.sendMessage({
    type: 'LOG_RESURFACING_ACTION',
    payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'ignored' },
  }).catch(() => {});
}

// Init
checkResurfacing();
