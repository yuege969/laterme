// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const browser: any;

export const api: typeof chrome =
  typeof chrome !== 'undefined' ? chrome : browser;

export const bookmarks = {
  getTree: () => api.bookmarks.getTree(),
  get: (id: string) => api.bookmarks.get(id),
  create: (bookmark: chrome.bookmarks.BookmarkCreateArg) =>
    api.bookmarks.create(bookmark),
  update: (id: string, changes: chrome.bookmarks.BookmarkChangesArg) =>
    api.bookmarks.update(id, changes),
  remove: (id: string) => api.bookmarks.remove(id),
  search: (query: chrome.bookmarks.BookmarkSearchQuery) =>
    api.bookmarks.search(query),
  onCreated: {
    addListener: (
      cb: (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void
    ) => api.bookmarks.onCreated.addListener(cb),
    removeListener: (
      cb: (id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void
    ) => api.bookmarks.onCreated.removeListener(cb),
  },
  onRemoved: {
    addListener: (
      cb: (id: string, removeInfo: chrome.bookmarks.BookmarkRemoveInfo) => void
    ) => api.bookmarks.onRemoved.addListener(cb),
  },
};

export const storage = {
  sync: api.storage?.sync || api.storage?.local,
  local: api.storage?.local,
};

export const tabs = {
  create: (props: chrome.tabs.CreateProperties) => api.tabs.create(props),
  query: (props: chrome.tabs.QueryInfo) => api.tabs.query(props),
  getCurrent: () => api.tabs.getCurrent(),
  onUpdated: {
    addListener: (
      cb: (
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        tab: chrome.tabs.Tab
      ) => void
    ) => api.tabs.onUpdated.addListener(cb),
  },
};

export const alarms = {
  create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo) =>
    api.alarms.create(name, alarmInfo),
  onAlarm: {
    addListener: (cb: (alarm: chrome.alarms.Alarm) => void) =>
      api.alarms.onAlarm.addListener(cb),
  },
};

export const notifications = {
  create: (
    notificationId: string,
    options: chrome.notifications.NotificationOptions<true>
  ) => {
    if (api.notifications) {
      api.notifications.create(notificationId, options);
    }
  },
};

export const runtime = {
  onInstalled: {
    addListener: (cb: (details: chrome.runtime.InstalledDetails) => void) =>
      api.runtime.onInstalled.addListener(cb),
  },
  onMessage: {
    addListener: (
      cb: (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: unknown) => void
      ) => void | boolean
    ) => api.runtime.onMessage.addListener(cb),
  },
  sendMessage: (message: unknown) => api.runtime.sendMessage(message),
  getURL: (path: string) => api.runtime.getURL(path),
  openOptionsPage: () => {
    if (api.runtime.openOptionsPage) {
      api.runtime.openOptionsPage();
    }
  },
};

export const windows = {
  create: (createData: chrome.windows.CreateData) =>
    api.windows.create(createData),
  onFocusChanged: {
    addListener: (cb: (windowId: number) => void) =>
      api.windows.onFocusChanged.addListener(cb),
  },
};

const POPUP_WIDTH = 380;
const POPUP_HEIGHT = 440;
// Approximate height of the browser chrome (title bar + toolbar) in pixels.
// The native bookmark bubble appears just below this.
const BROWSER_TOOLBAR_HEIGHT = 90;
// Right margin so the popup sits flush to the right side of the window.
const POPUP_RIGHT_MARGIN = 16;

/**
 * Open a LaterMe popup window positioned in the top-right corner of the
 * current browser window, mimicking where Chrome's native bookmark bubble
 * would appear.
 */
export async function openPopupWindow(popupUrl: string): Promise<void> {
  let left: number | undefined;
  let top: number | undefined;
  try {
    const win = await api.windows.getLastFocused({ populate: false });
    if (
      typeof win.left === 'number' &&
      typeof win.top === 'number' &&
      typeof win.width === 'number'
    ) {
      left = win.left + win.width - POPUP_WIDTH - POPUP_RIGHT_MARGIN;
      top = win.top + BROWSER_TOOLBAR_HEIGHT;
    }
  } catch { /* fall back to default placement */ }

  await api.windows.create({
    url: popupUrl,
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    focused: true,
    ...(left !== undefined && top !== undefined ? { left, top } : {}),
  });
}

export const commands = {
  onCommand: {
    addListener: (
      cb: (command: string, tab: chrome.tabs.Tab) => void
    ) => {
      if (api.commands) {
        api.commands.onCommand.addListener(cb);
      }
    },
  },
};
