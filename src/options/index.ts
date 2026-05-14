import { runtime } from '../utils/browser';
import type { AppSettings } from '../storage/types';
import { DEFAULT_SETTINGS } from '../storage/types';

// DOM elements
const resurfacingEnabled = document.getElementById('resurfacingEnabled') as HTMLInputElement;
const resurfacingFrequency = document.getElementById('resurfacingFrequency') as HTMLSelectElement;
const maxAgeDays = document.getElementById('maxAgeDays') as HTMLSelectElement;
const importBookmarksBtn = document.getElementById('importBookmarksBtn') as HTMLButtonElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const importBtn = document.getElementById('importBtn') as HTMLButtonElement;
const importFile = document.getElementById('importFile') as HTMLInputElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const statsInfo = document.getElementById('statsInfo') as HTMLDivElement;
const toast = document.getElementById('toast') as HTMLDivElement;

let settings: AppSettings = DEFAULT_SETTINGS;

// Toast helper
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// Load settings
async function loadSettings(): Promise<void> {
  try {
    const response = await runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (response?.settings) {
      settings = response.settings as AppSettings;
    }
  } catch {
    // Use defaults
  }

  resurfacingEnabled.checked = settings.resurfacingEnabled;
  resurfacingFrequency.value = settings.resurfacingFrequency;
  maxAgeDays.value = String(settings.maxAgeDays);
}

// Save settings
async function saveSetting(patch: Partial<AppSettings>): Promise<void> {
  try {
    await runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      payload: patch,
    });
    Object.assign(settings, patch);
  } catch {
    showToast('保存失败', 'error');
  }
}

// Load stats
async function loadStats(): Promise<void> {
  try {
    const response = await runtime.sendMessage({ type: 'GET_ALL_METAS' });
    const metas = response?.metas || [];
    const active = metas.filter((m: { status: string }) => m.status === 'active').length;
    const withNotes = metas.filter(
      (m: { note: string; status: string }) => m.note && m.note.trim() && m.status === 'active'
    ).length;
    const expired = metas.filter((m: { status: string }) => m.status === 'expired').length;
    const archived = metas.filter((m: { status: string }) => m.status === 'archived').length;

    statsInfo.innerHTML = `
      📊 共 ${metas.length} 条收藏记录<br />
      · ${active} 个活跃收藏（其中 ${withNotes} 个有备注）<br />
      · ${expired} 个已过期 · ${archived} 个已归档
    `;
  } catch {
    statsInfo.textContent = '无法加载统计信息';
  }
}

// Event bindings
resurfacingEnabled.addEventListener('change', () => {
  saveSetting({ resurfacingEnabled: resurfacingEnabled.checked });
});

resurfacingFrequency.addEventListener('change', () => {
  saveSetting({
    resurfacingFrequency: resurfacingFrequency.value as AppSettings['resurfacingFrequency'],
  });
});

maxAgeDays.addEventListener('change', () => {
  saveSetting({ maxAgeDays: parseInt(maxAgeDays.value, 10) });
});

// Import browser bookmarks
importBookmarksBtn.addEventListener('click', async () => {
  importBookmarksBtn.disabled = true;
  importBookmarksBtn.textContent = '导入中...';
  try {
    const response = await runtime.sendMessage({ type: 'IMPORT_BOOKMARKS' });
    if (response?.error) {
      showToast(`导入失败: ${response.error}`, 'error');
    } else {
      const count = (response?.count as number) || 0;
      showToast(`已导入 ${count} 个浏览器书签`, 'success');
      loadStats();
    }
  } catch {
    showToast('导入失败，请重试', 'error');
  } finally {
    importBookmarksBtn.disabled = false;
    importBookmarksBtn.innerHTML = '<span class="btn-icon">📥</span> 导入浏览器书签';
  }
});

// Export
exportBtn.addEventListener('click', async () => {
  try {
    const response = await runtime.sendMessage({ type: 'EXPORT_DATA' });
    const data = response?.data;
    if (!data) {
      showToast('导出失败', 'error');
      return;
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laterme-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('数据已导出');
  } catch {
    showToast('导出失败', 'error');
  }
});

// Import
importBtn.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.bookmarks_meta || !data.resurfacing_logs || !data.settings) {
      showToast('无效的数据格式', 'error');
      return;
    }

    const confirmed = confirm(
      '导入将覆盖现有的所有数据，确定继续吗？'
    );
    if (!confirmed) return;

    await runtime.sendMessage({
      type: 'IMPORT_DATA',
      payload: data,
    });

    showToast('数据已导入，请刷新页面');
    setTimeout(() => window.location.reload(), 1500);
  } catch {
    showToast('导入失败，请检查文件格式', 'error');
  }
});

// Clear all data
clearBtn.addEventListener('click', async () => {
  const confirmed = confirm(
    '确定要清除所有 LaterMe 数据吗？\n\n这将删除所有备注和提醒记录。\n浏览器的原生书签不会受影响。'
  );
  if (!confirmed) return;

  const doubleConfirmed = confirm('再次确认：真的要清除所有数据吗？此操作不可撤销。');
  if (!doubleConfirmed) return;

  try {
    await runtime.sendMessage({
      type: 'IMPORT_DATA',
      payload: {
        bookmarks_meta: [],
        resurfacing_logs: [],
        settings: DEFAULT_SETTINGS,
      },
    });
    showToast('所有数据已清除');
    setTimeout(() => window.location.reload(), 1500);
  } catch {
    showToast('清除失败', 'error');
  }
});

// Init
loadSettings();
loadStats();
