import { api, runtime } from '../utils/browser';

document.getElementById('tryBtn')?.addEventListener('click', () => {
  // Close the welcome page so the user lands back on whatever tab was open before.
  // They can then press Ctrl+D on any page to try LaterMe.
  window.close();
});

document.getElementById('bookmarksLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  api.tabs.create({ url: runtime.getURL('bookmarks/index.html') });
  window.close();
});
