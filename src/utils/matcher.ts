import type { BookmarkMeta, ResurfacingScore } from '../storage/types';
import { getAgeDays } from './format';

function toScore(meta: BookmarkMeta): ResurfacingScore {
  return {
    bookmarkId: meta.bookmarkId,
    url: meta.url,
    title: meta.title,
    note: meta.note,
    score: 0,
    timeScore: 0,
    intentScore: 0,
    createdAt: meta.createdAt,
  };
}

export function filterEligibleForResurfacing(metas: BookmarkMeta[]): BookmarkMeta[] {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const hasMaturedBookmark = metas.some(
    (m) => m.intent !== 'temp' && getAgeDays(m.createdAt) >= 30
  );
  const minAgeDays = hasMaturedBookmark ? 30 : 3;

  return metas.filter((meta) => {
    if (meta.status !== 'active') return false;

    const ageDays = getAgeDays(meta.createdAt);

    if (meta.intent === 'temp') {
      if (ageDays < 1 || ageDays >= 3) return false;
    } else {
      if (ageDays < minAgeDays) return false;
    }

    if (meta.nextReminderAt && meta.nextReminderAt > now) return false;
    if (meta.lastOpenedAt && meta.lastOpenedAt > todayStart.getTime()) return false;

    return true;
  });
}

export function pickBestForResurfacing(metas: BookmarkMeta[]): ResurfacingScore | null {
  const eligible = filterEligibleForResurfacing(metas);
  if (eligible.length === 0) return null;
  return toScore(eligible[Math.floor(Math.random() * eligible.length)]);
}

export function pickTopForResurfacing(metas: BookmarkMeta[], count: number): ResurfacingScore[] {
  const eligible = filterEligibleForResurfacing(metas);
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count).map(toScore);
}
