import type { BookmarkMeta, ResurfacingScore } from '../storage/types';

/**
 * Calculate resurfacing score for a bookmark.
 * Higher score = more likely to be shown to the user.
 */
export function calculateResurfacingScore(meta: BookmarkMeta): ResurfacingScore {
  const now = Date.now();
  const ageDays = (now - meta.createdAt) / (1000 * 60 * 60 * 24);

  let timeScore = 0;
  let intentScore = 0;

  if (meta.intent === 'temp') {
    // temp bookmarks expire at day 3: urgency rises linearly as expiry approaches.
    // day 1 = 60, day 2 = 80, day 2.5+ = 100
    timeScore = Math.min(100, 40 + (ageDays / 3) * 60);
    intentScore = 100;
  } else {
    // Time decay score: follows a curve
    // 30d=60, 90d=100 (peak), 180d=80, 360d=50
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
      problem: 80,
      learn: 60,
      project: 40,
    };
    intentScore = meta.intent ? intentScoreMap[meta.intent] ?? 20 : 20;
  }

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
 * - temp: created 1–3 days ago (remind before expiry)
 * - others: created more than 30 days ago, OR if user has no bookmarks that old yet,
 *   fall back to 3 days (new-user grace period avoids a dead zone on first install)
 * - Not snoozed (nextReminderAt is in the past or not set)
 * - Not opened today
 */
export function filterEligibleForResurfacing(metas: BookmarkMeta[]): BookmarkMeta[] {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // New-user grace period: if no non-temp bookmark is older than 30 days yet,
  // lower the minimum age threshold to 3 days so users see value immediately.
  const hasMaturedBookmark = metas.some(
    (m) => m.intent !== 'temp' && (now - m.createdAt) / (1000 * 60 * 60 * 24) >= 30
  );
  const minAgeDays = hasMaturedBookmark ? 30 : 3;

  return metas.filter((meta) => {
    if (meta.status !== 'active') return false;

    const ageDays = (now - meta.createdAt) / (1000 * 60 * 60 * 24);

    if (meta.intent === 'temp') {
      // Remind once before the 3-day expiry window
      if (ageDays < 1 || ageDays >= 3) return false;
    } else {
      if (ageDays < minAgeDays) return false;
    }

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
  const top = pickTopForResurfacing(metas, 1);
  return top[0] ?? null;
}

/**
 * Pick the top N bookmarks to resurface, sorted by score descending.
 */
export function pickTopForResurfacing(
  metas: BookmarkMeta[],
  count: number
): ResurfacingScore[] {
  const eligible = filterEligibleForResurfacing(metas);
  if (eligible.length === 0) return [];
  const scored = eligible.map(calculateResurfacingScore);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count);
}
