import type { ResurfacingScore } from '../storage/types';
import { getDaysText, escapeHtml } from '../utils/format';

const BANNER_ID = 'laterme-resurfacing-banner';

async function init(): Promise<void> {
  if (window !== window.top) return;

  const { protocol } = window.location;
  if (!protocol.startsWith('http')) return;

  const today = new Date().toDateString();

  // Fast guard: check local storage for today's flag
  try {
    const flag = await chrome.storage.local.get('resurfacingShownDate');
    if (flag.resurfacingShownDate === today) return;
  } catch { return; }

  // Claim the slot for today (best-effort — if another tab races, one wins)
  await chrome.storage.local.set({ resurfacingShownDate: today });

  // Check if banner was already shown today (via background log)
  try {
    const shown = await chrome.runtime.sendMessage({ type: 'WAS_SHOWN_TODAY' });
    if (shown?.shown) return;
  } catch { return; }

  // Check for pending resurfacing from background alarm
  let score: ResurfacingScore | null = null;

  try {
    const data = await chrome.storage.local.get([
      'pendingResurfacing',
      'pendingResurfacingDate',
    ]);
    const pending = data.pendingResurfacing as ResurfacingScore | undefined;
    const date = data.pendingResurfacingDate as string | undefined;

    if (pending && date === today) {
      score = pending;
      await chrome.storage.local.remove('pendingResurfacing');
    }
  } catch { /* quiet */ }

  // If no pending from alarm, try manual trigger
  if (!score) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'TRIGGER_RESURFACING',
      });
      if (result?.result) {
        score = result.result as ResurfacingScore;
      }
    } catch { return; }
  }

  if (!score) return;

  showBanner(score);
}

function showBanner(score: ResurfacingScore): void {
  if (document.getElementById(BANNER_ID)) return;

  const daysText = getDaysText(score.createdAt, !!score.note);

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.innerHTML = `
    <div class="laterme-banner-inner">
      <button class="laterme-banner-close" id="laterme-close">×</button>
      <div class="laterme-banner-content">
        <div class="laterme-banner-header">
          <span class="laterme-banner-icon">📌</span>
          <span class="laterme-banner-days">${daysText}</span>
        </div>
        <div class="laterme-banner-body">
          <div class="laterme-banner-title">${escapeHtml(score.title || score.url)}</div>
          <div class="laterme-banner-note">${score.note ? `💬 "${escapeHtml(score.note)}"` : '这个收藏还没有备注'}</div>
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

  bindEvents(score);
}

function bindEvents(score: ResurfacingScore): void {
  const banner = document.getElementById(BANNER_ID)!;

  const closeBanner = () => banner.remove();

  document.getElementById('laterme-close')?.addEventListener('click', closeBanner);

  document.getElementById('laterme-open')?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'opened' },
      });
      await chrome.runtime.sendMessage({
        type: 'OPEN_BOOKMARK',
        payload: { bookmarkId: score.bookmarkId },
      });
    } catch {
      window.open(score.url, '_blank');
    }
    closeBanner();
  });

  document.getElementById('laterme-snooze')?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'snoozed' },
      });
      await chrome.runtime.sendMessage({
        type: 'UPDATE_META',
        payload: {
          bookmarkId: score.bookmarkId,
          nextReminderAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        },
      });
    } catch { /* quiet */ }
    closeBanner();
  });

  document.getElementById('laterme-archive')?.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({
        type: 'LOG_RESURFACING_ACTION',
        payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'dismissed' },
      });
      await chrome.runtime.sendMessage({
        type: 'UPDATE_META',
        payload: { bookmarkId: score.bookmarkId, status: 'archived' },
      });
    } catch { /* quiet */ }
    closeBanner();
  });

  // Log that we showed it
  try {
    chrome.runtime.sendMessage({
      type: 'LOG_RESURFACING_ACTION',
      payload: { bookmarkId: score.bookmarkId, url: score.url, action: 'ignored' },
    }).catch(() => {});
  } catch { /* context invalidated */ }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
