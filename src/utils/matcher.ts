import type { BookmarkMeta, ResurfacingScore } from '../storage/types';

/**
 * Calculate resurfacing score for a bookmark.
 * Higher score = more likely to be shown to the user.
 */
export function calculateResurfacingScore(meta: BookmarkMeta): ResurfacingScore {
  const now = Date.now();
  const ageDays = (now - meta.createdAt) / (1000 * 60 * 60 * 24);

  // Time decay score: follows a curve
  // 30d=60, 90d=100 (peak), 180d=80, 360d=50
  let timeScore = 0;
  if (ageDays < 30) {
    timeScore = (ageDays / 30) * 60;
  } else if (ageDays < 90) {
    timeScore = 60 + ((ageDays - 30) / 60) * 40;
  } else if (ageDays < 180) {
    timeScore = 100 - ((ageDays - 90) / 90) * 20;
  } else if (ageDays < 360) {
    timeScore = 80 - ((ageDays - 180) / 180) * 30;
  } else {
    timeScore = Math.max(0, 50 - ((ageDays - 360) / 360) * 50);
  }

  // Intent urgency score
  const intentScoreMap: Record<string, number> = {
    temp: 100,
    problem: 80,
    learn: 60,
    project: 40,
  };
  const intentScore = meta.intent
    ? intentScoreMap[meta.intent] || 0
    : 20;

  // Final weighted score
  const score = timeScore * 0.6 + intentScore * 0.4;

  return {
    bookmarkId: meta.bookmarkId,
    url: meta.url,
    title: meta.title,
    note: meta.note,
    score: Math.round(score * 100) / 100,
    timeScore: Math.round(timeScore * 100) / 100,
    intentScore: Math.round(intentScore * 100) / 100,
    createdAt: meta.createdAt,
  };
}

/**
 * Filter bookmarks eligible for resurfacing:
 * - Status is 'active'
 * - Created more than 30 days ago
 * - Not snoozed (nextReminderAt is in the past or not set)
 * - Not opened today
 */
export function filterEligibleForResurfacing(metas: BookmarkMeta[]): BookmarkMeta[] {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return metas.filter((meta) => {
    if (meta.status !== 'active') return false;
    const ageDays = (now - meta.createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays < 30) return false;

    // Skip if snoozed
    if (meta.nextReminderAt && meta.nextReminderAt > now) return false;

    // Skip if opened today
    if (meta.lastOpenedAt && meta.lastOpenedAt > todayStart.getTime()) return false;

    return true;
  });
}

/**
 * Pick the best bookmark to resurface from the eligible list.
 * Returns the one with the highest score.
 */
export function pickBestForResurfacing(
  metas: BookmarkMeta[]
): ResurfacingScore | null {
  const eligible = filterEligibleForResurfacing(metas);
  if (eligible.length === 0) return null;

  const scored = eligible.map(calculateResurfacingScore);
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}
