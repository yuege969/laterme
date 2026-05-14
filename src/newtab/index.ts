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
      'pendingResurfacingDate',
    ]);
    const pending = data.pendingResurfacing as ResurfacingScore | undefined;
    const date = data.pendingResurfacingDate as string | undefined;

    if (pending && date === new Date().toDateString()) {
      showBanner(pending);
      await chrome.storage.local.remove('pendingResurfacing');
      return;
    }
  } catch {
    // quiet
  }

  // Manual trigger via background
  try {
    const result = await runtime.sendMessage({ type: 'TRIGGER_RESURFACING' });
    if (result?.result) {
      showBanner(result.result as ResurfacingScore);
    }
  } catch {
    // quiet
  }
}

function showBanner(score: ResurfacingScore): void {
  const banner = document.getElementById('resurfacingBanner');
  if (!banner) return;

  const ageDays = Math.floor(
    (Date.now() - score.createdAt) / (1000 * 60 * 60 * 24)
  );

  let daysText: string;
  if (score.note) {
    if (ageDays >= 180) daysText = '半年前的你，给现在的你留了一句话';
    else if (ageDays >= 90) daysText = '3个月前的你，给现在的你留了一句话';
    else if (ageDays >= 60) daysText = '2个月前的你，给现在的你留了一句话';
    else if (ageDays >= 30) daysText = '1个月前的你，给现在的你留了一句话';
    else daysText = '以前的你，给现在的你留了一句话';
  } else {
    if (ageDays >= 180) daysText = '这个收藏已经沉睡了半年';
    else if (ageDays >= 90) daysText = '这个收藏已经沉睡了 3 个月';
    else if (ageDays >= 60) daysText = '这个收藏已经沉睡了 2 个月';
    else if (ageDays >= 30) daysText = '这个收藏已经沉睡了 1 个月';
    else daysText = '以前收藏的页面，还记得吗？';
  }

  const daysEl = document.getElementById('resurfacingDays');
  const titleEl = document.getElementById('resurfacingTitle');
  const noteEl = document.getElementById('resurfacingNote');

  if (daysEl) daysEl.textContent = daysText;
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
