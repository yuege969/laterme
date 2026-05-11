import type { BookmarkMeta, ResurfacingLog, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

const DB_NAME = 'LaterMeDB';
const DB_VERSION = 1;
const META_STORE = 'bookmarks_meta';
const LOG_STORE = 'resurfacing_logs';
const SETTINGS_STORE = 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'url' });
      }
      if (!db.objectStoreNames.contains(LOG_STORE)) {
        const logStore = db.createObjectStore(LOG_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        logStore.createIndex('url', 'url', { unique: false });
        logStore.createIndex('shownAt', 'shownAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function store(db: IDBDatabase, name: string, mode: IDBTransactionMode = 'readonly') {
  return db.transaction(name, mode).objectStore(name);
}

// BookmarkMeta CRUD

export async function getMeta(url: string): Promise<BookmarkMeta | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, META_STORE).get(url);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMetas(): Promise<BookmarkMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, META_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMeta(meta: BookmarkMeta): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, META_STORE, 'readwrite').put(meta);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMeta(url: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, META_STORE, 'readwrite').delete(url);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function updateMeta(
  url: string,
  patch: Partial<BookmarkMeta>
): Promise<void> {
  const existing = await getMeta(url);
  if (!existing) return;
  return putMeta({ ...existing, ...patch });
}

export async function getMetasByStatus(
  status: BookmarkMeta['status']
): Promise<BookmarkMeta[]> {
  const all = await getAllMetas();
  return all.filter((m) => m.status === status);
}

// Resurfacing logs

export async function addResurfacingLog(log: Omit<ResurfacingLog, 'id'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, LOG_STORE, 'readwrite').add(log);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getResurfacingLogsByUrl(url: string): Promise<ResurfacingLog[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, LOG_STORE).index('url').getAll(url);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function wasShownToday(): Promise<boolean> {
  const db = await openDB();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return new Promise((resolve, reject) => {
    const req = store(db, LOG_STORE).index('shownAt').getAll(
      IDBKeyRange.lowerBound(todayStart.getTime())
    );
    req.onsuccess = () => resolve(req.result.length > 0);
    req.onerror = () => reject(req.error);
  });
}

// Settings

export async function getSettings(): Promise<AppSettings> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, SETTINGS_STORE).get('app');
    req.onsuccess = () => {
      resolve(req.result ? { ...DEFAULT_SETTINGS, ...req.result.value } : DEFAULT_SETTINGS);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = store(db, SETTINGS_STORE, 'readwrite').put({
      key: 'app',
      value: merged,
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Data export/import

export async function exportData(): Promise<{
  bookmarks_meta: BookmarkMeta[];
  resurfacing_logs: ResurfacingLog[];
  settings: AppSettings;
}> {
  const [bookmarks_meta, resurfacing_logs, settings] = await Promise.all([
    getAllMetas(),
    (async () => {
      const db = await openDB();
      return new Promise<ResurfacingLog[]>((resolve, reject) => {
        const req = store(db, LOG_STORE).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    })(),
    getSettings(),
  ]);
  return { bookmarks_meta, resurfacing_logs, settings };
}

export async function importData(data: {
  bookmarks_meta: BookmarkMeta[];
  resurfacing_logs: ResurfacingLog[];
  settings: AppSettings;
}): Promise<void> {
  const db = await openDB();
  // Clear existing data
  await Promise.all([
    new Promise<void>((resolve, reject) => {
      const req = store(db, META_STORE, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
    new Promise<void>((resolve, reject) => {
      const req = store(db, LOG_STORE, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
    new Promise<void>((resolve, reject) => {
      const req = store(db, SETTINGS_STORE, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  ]);

  // Import new data
  const tx = db.transaction(
    [META_STORE, LOG_STORE, SETTINGS_STORE],
    'readwrite'
  );
  for (const meta of data.bookmarks_meta) {
    tx.objectStore(META_STORE).put(meta);
  }
  for (const log of data.resurfacing_logs) {
    tx.objectStore(LOG_STORE).add(log);
  }
  tx.objectStore(SETTINGS_STORE).put({ key: 'app', value: data.settings });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
