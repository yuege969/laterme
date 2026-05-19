import { alarms, runtime } from '../utils/browser';
import {
  getAllMetas,
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

  // Guard: skip if already scheduled today (use storage flag, not DB log)
  const today = new Date().toDateString();
  const existing = await chrome.storage.local.get('pendingResurfacingDate');
  if ((existing.pendingResurfacingDate as string) === today) return;

  // For weekly frequency, only show on Mondays
  if (settings.resurfacingFrequency === 'weekly') {
    if (new Date().getDay() !== 1) return;
  }

  const allMetas = await getAllMetas();
  const maxAgeMs = settings.maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const ageCappedMetas = allMetas.filter((m) => (now - m.createdAt) <= maxAgeMs);

  // weekly mode: pick top 5 for a richer review session
  const isWeekly = settings.resurfacingFrequency === 'weekly';
  const picks = isWeekly
    ? pickTopForResurfacing(ageCappedMetas, 5)
    : pickTopForResurfacing(ageCappedMetas, 1);
  if (picks.length === 0) return;
  const best = picks[0];

  // Store for next new tab open (single best + full list for weekly)
  await chrome.storage.local.set({
    pendingResurfacing: best,
    pendingResurfacingList: picks,
    pendingResurfacingDate: today,
  });

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
  const [allMetas, settings] = await Promise.all([getAllMetas(), getSettings()]);
  const maxAgeMs = settings.maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const ageCappedMetas = allMetas.filter((m) => (now - m.createdAt) <= maxAgeMs);
  return pickBestForResurfacing(ageCappedMetas);
}
