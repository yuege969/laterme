import { runtime } from '../utils/browser';
import type { ResurfacingScore } from '../storage/types';

const BANNER_ID = 'laterme-resurfacing-banner';
const STORAGE_KEY = 'pendingResurfacing';

async function init(): Promise<void> {
  // Check if resurfacing is already being shown or was shown today
  try {
    const shown = await runtime.sendMessage({ type: 'WAS_SHOWN_TODAY' });
    if (shown?.shown) return;
  } catch {
    // Background not ready
  }

  // Check for pending resurfacing from background alarm
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, 'pendingResurfacingDate']);
    const pending = data[STORAGE_KEY] as ResurfacingScore | undefined;
    const date = data.pendingResurfacingDate as string | undefined;

    if (pending && date === new Date().toDateString()) {
      showBanner(pending);
      await chrome.storage.local.remove(STORAGE_KEY);
      return;
    }
  } catch {
    // Storage not available
  }

  // Try manual trigger
  try {
    const result = await runtime.sendMessage({ type: 'TRIGGER_RESURFACING' });
    if (result?.result) {
      showBanner(result.result as ResurfacingScore);
    }
  } catch {
    // Background not ready
  }
}

function showBanner(score: ResurfacingScore): void {
  // Remove existing banner
  const existing = document.getElementById(BANNER_ID);
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div class="laterme-banner-inner">
      <div class="laterme-banner-content">
        <div class="laterme-banner-header">
          <span class="laterme-banner-icon">📌</span>
          <span class="laterme-banner-days">${daysAgoText(score)}</span>
        </div>
        <div class="laterme-banner-body">
          <div class="laterme-banner-title">${escapeHtml(score.title || score.url)}</div>
          <div class="laterme-banner-note">💬 "${escapeHtml(score.note)}"</div>
        </div>
      </div>
      <div class="laterme-banner-actions">
        <button class="laterme-btn laterme-btn-open" id="laterme-open">打开看看</button>
        <button class="laterme-btn laterme-btn-snooze" id="laterme-snooze">下次再说</button>
        <button class="laterme-btn laterme-btn-archive" id="laterme-archive">不再提醒</button>
      </div>
    </div>
  `;

  document.body.appendChild(banner);

  // Event handlers
  document.getElementById('laterme-open')?.addEventListener('click', async () => {
    try {
      await runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { url: score.url, action: 'opened' },
      });
      await runtime.sendMessage({
        type: 'OPEN_BOOKMARK',
        payload: { url: score.url },
      });
    } catch {
      window.open(score.url, '_blank');
    }
    banner.remove();
  });

  document.getElementById('laterme-snooze')?.addEventListener('click', async () => {
    try {
      await runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { url: score.url, action: 'snoozed' },
      });
      // Set next reminder 3 days from now
      await runtime.sendMessage({
        type: 'UPDATE_META',
        payload: {
          url: score.url,
          nextReminderAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        },
      });
    } catch {
      // Background not ready
    }
    banner.remove();
  });

  document.getElementById('laterme-archive')?.addEventListener('click', async () => {
    try {
      await runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { url: score.url, action: 'dismissed' },
      });
      // Archive the bookmark
      await runtime.sendMessage({
        type: 'UPDATE_META',
        payload: { url: score.url, status: 'archived' },
      });
    } catch {
      // Background not ready
    }
    banner.remove();
  });

  // Log that we showed it
  runtime.sendMessage({
    type: 'LOG_RESURFACING_ACTION',
    payload: { url: score.url, action: 'ignored' },
  }).catch(() => {});
}

function daysAgoText(score: ResurfacingScore): string {
  const ageDays = Math.floor(
    (Date.now() - score.createdAt) / (1000 * 60 * 60 * 24)
  );

  if (score.intentScore >= 90 && ageDays <= 3) return '即将过期的临时收藏';
  if (ageDays >= 180) return '半年前的你，给现在的你留了一句话';
  if (ageDays >= 90) return '3个月前的你，给现在的你留了一句话';
  if (ageDays >= 60) return '2个月前的你，给现在的你留了一句话';
  if (ageDays >= 30) return '1个月前的你，给现在的你留了一句话';
  return '以前的你，给现在的你留了一句话';
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
