export type IntentType = string | null;

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
  resurfacingCooldownDays: number;
  customIntents: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  resurfacingEnabled: true,
  resurfacingFrequency: 'daily',
  maxAgeDays: 365,
  lastResurfacingDate: '',
  resurfacingCooldownDays: 3,
  customIntents: [],
};

export const INTENT_LABELS: Record<string, string> = {
  project: '项目参考',
  learn: '学习阅读',
  problem: '解决问题',
  temp: '临时查看',
  idea: '灵感想法',
  buy: '稍后购买',
  fun: '娱乐消遣',
  reading: '待读文章',
};

export const INTENT_EMOJI: Record<string, string> = {
  project: '🛠️',
  learn: '📖',
  problem: '🔧',
  temp: '⏳',
  idea: '💡',
  buy: '🛒',
  fun: '🎬',
  reading: '📰',
};

export interface PresetIntent {
  value: string;
  label: string;
  emoji: string;
}

export const PRESET_INTENTS: PresetIntent[] = [
  { value: 'project', label: '项目参考', emoji: '🛠️' },
  { value: 'learn',   label: '学习阅读', emoji: '📖' },
  { value: 'problem', label: '解决问题', emoji: '🔧' },
  { value: 'temp',    label: '临时查看', emoji: '⏳' },
  { value: 'idea',    label: '灵感想法', emoji: '💡' },
  { value: 'buy',     label: '稍后购买', emoji: '🛒' },
  { value: 'fun',     label: '娱乐消遣', emoji: '🎬' },
  { value: 'reading', label: '待读文章', emoji: '📰' },
];
