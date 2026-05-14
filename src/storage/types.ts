export type IntentType = 'project' | 'learn' | 'problem' | 'temp' | null;

export type BookmarkStatus = 'active' | 'archived' | 'expired';

export interface BookmarkMeta {
  bookmarkId: string;
  url: string;
  title: string;
  note: string;
  intent: IntentType;
  createdAt: number;
  lastOpenedAt: number;
  openCount: number;
  status: BookmarkStatus;
  nextReminderAt?: number;
}

export interface ResurfacingLog {
  bookmarkId: string;
  url: string;
  shownAt: number;
  action: 'opened' | 'dismissed' | 'snoozed' | 'ignored';
}

export interface ResurfacingScore {
  bookmarkId: string;
  url: string;
  title?: string;
  note: string;
  score: number;
  timeScore: number;
  intentScore: number;
  createdAt: number;
}

export interface AppSettings {
  resurfacingEnabled: boolean;
  resurfacingFrequency: 'daily' | 'weekly' | 'never';
  maxAgeDays: number;
  lastResurfacingDate: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  resurfacingEnabled: true,
  resurfacingFrequency: 'daily',
  maxAgeDays: 365,
  lastResurfacingDate: '',
};

export const INTENT_LABELS: Record<NonNullable<IntentType>, string> = {
  project: '以后做项目时参考',
  learn: '学习时再看',
  problem: '解决特定问题时用',
  temp: '临时查看（3天后过期）',
};
