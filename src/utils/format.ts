export function getAgeDays(ts: number): number {
  return (Date.now() - ts) / (1000 * 60 * 60 * 24);
}

export function getDaysText(createdAt: number, hasNote: boolean): string {
  const ageDays = Math.floor(getAgeDays(createdAt));
  if (hasNote) {
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

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
