import { alarms, tabs, runtime } from '../utils/browser';
import {
  getAllMetas,
  addResurfacingLog,
  wasShownToday,
  getSettings,
  updateMeta,
} from '../storage/db';
import { pickBestForResurfacing, pickTopForResurfacing } from '../utils/matcher';
import type { ResurfacingScore } from '../storage/types';

const RESURFACING_ALARM = 'resurfacing-check';

export function initResurfacingAlarm(): void {
  alarms.create(RESURFACING_ALARM, {
    periodInMinutes: 24 * 60,
    delayInMinutes: 1,
  });

  // Also check on browser startup via alarm listener
  alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === RESURFACING_ALARM) {
      await checkAndNotifyResurfacing();
    } else if (alarm.name === 'expiry-check') {
      await checkExpiredBookmarks();
    }
  });
}

export async function checkAndNotifyResurfacing(): Promise<void> {
  const settings = await getSettings();
  if (!settings.resurfacingEnabled) return;
  if (settings.resurfacingFrequency === 'never') return;

  // Check if already shown today
  const todayShown = await wasShownToday();
  if (todayShown) return;

  // For weekly frequency, only show on Mondays
  if (settings.resurfacingFrequency === 'weekly') {
    if (new Date().getDay() !== 1) return;
  }

  const allMetas = await getAllMetas();

  // weekly mode: pick top 5 for a richer review session
  const isWeekly = settings.resurfacingFrequency === 'weekly';
  const picks = isWeekly
    ? pickTopForResurfacing(allMetas, 5)
    : pickTopForResurfacing(allMetas, 1);
  if (picks.length === 0) return;
  const best = picks[0];

  // Store that we showed something today
  await addResurfacingLog({
    bookmarkId: best.bookmarkId,
    url: best.url,
    shownAt: Date.now(),
    action: 'ignored',
  });

  // Store for next new tab open (single best + full list for weekly)
  await chrome.storage.local.set({
    pendingResurfacing: best,
    pendingResurfacingList: picks,
    pendingResurfacingDate: new Date().toDateString(),
  });

  // Try to update already-open newtab pages
  const patterns = ['chrome://newtab/*', 'edge://newtab/*', 'about:newtab*'];
  for (const pattern of patterns) {
    try {
      const matched = await tabs.query({ url: [pattern] });
      for (const tab of matched) {
        if (tab.id) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SHOW_RESURFACING',
              payload: { best, list: picks },
            });
            break;
          } catch { /* not ready */ }
        }
      }
      if (matched.length > 0) break;
    } catch { /* pattern not valid in this browser */ }
  }
}

async function checkExpiredBookmarks(): Promise<void> {
  const allMetas = await getAllMetas();
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  let expiredCount = 0;

  for (const meta of allMetas) {
    if (meta.intent === 'temp' && meta.status === 'active') {
      if (now - meta.createdAt > threeDays) {
        await updateMeta(meta.bookmarkId, { status: 'expired' });
        expiredCount++;
      }
    }
  }

  if (expiredCount > 0) {
    // Notify user about expired temp bookmarks
    try {
      await chrome.notifications?.create('expired-temp', {
        type: 'basic',
        iconUrl: runtime.getURL('icons/icon48.png'),
        title: 'LaterMe',
        message: `${expiredCount} 个临时收藏已过期`,
        priority: 0,
      });
    } catch {
      // Notifications might not be available
    }
  }
}

export async function triggerResurfacingManual(): Promise<ResurfacingScore | null> {
  const allMetas = await getAllMetas();
  return pickBestForResurfacing(allMetas);
}
