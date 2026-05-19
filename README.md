# LaterMe

> Leave a note for your future self. Turn your bookmark graveyard into a knowledge garden.

LaterMe is a browser extension that doesn't help you "save more" — it helps you **reopen**. Every time you bookmark a page, leave a short note to your future self explaining why you saved it. Weeks or months later, when that bookmark resurfaces, you'll thank your past self for the context.

## Why

Browser bookmarks suffer from a universal problem: we save pages with good intentions, then never look at them again. The bookmark folder becomes a graveyard of forgotten URLs — interesting articles we meant to read, tools we thought we'd need, ideas we wanted to explore.

LaterMe fixes this with two simple ideas:

1. **Capture intent at the moment of saving** — a short note, a category, a reason.
2. **Resurface old bookmarks periodically** — bring them back into view before they're forgotten.

## Features

### Time Capsule Notes

Press `Ctrl+D` (or `Cmd+D` on Mac) to bookmark a page. Instead of just a star icon, you'll see a warm card where you can:

- Write a note (up to 120 characters) — *"The recursion trick in the second code example is exactly what I need for the parser refactor"*
- Pick an intent category — project reference, learning, problem-solving, temporary, idea, shopping, entertainment, reading, or a custom tag

The page description is pre-filled automatically when available, so you can save with one click.

### Smart Resurfacing

LaterMe periodically brings old bookmarks back to your attention:

- **Daily or weekly reminders** — configure how often you want to be reminded
- **Contextual notes** — each reminder shows the note you left when you first saved it
- **Age-aware messages** — *"The you from 3 months ago left a note for you"*
- **Batch review on Mondays** — weekly mode shows up to 5 bookmarks for a richer review session

### Review & Cleanup Mode

Open the bookmarks page and click "Review Cleanup" to enter a focused triage mode:

- Go through bookmarks one at a time, oldest first
- See when you saved it, how many times you've opened it, and your original note
- **Keep**, **archive**, or **delete** — with keyboard shortcuts (`K` / `A` / `D`)
- Progress bar and stats when you're done

### Silent Expiry

Bookmarks tagged as "temporary" automatically expire after 3 days. No cleanup needed.

### Intent Filters

The bookmarks page shows dynamic intent filters based on how you've categorized your saves. Click any tag to see only bookmarks in that category.

### Fully Local & Private

All data is stored in your browser's IndexedDB. Nothing is uploaded to any server. No analytics, no tracking, no AI/LLM API calls. Your notes stay on your device.

## Installation

```bash
npm install
npm run build      # outputs to dist/
npm run dev        # watch mode for development
```

In Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked** and select the `dist/` directory

## Usage

| Action | How |
|--------|-----|
| Bookmark with a note | Press `Ctrl+D` (Mac: `Cmd+D`) or click the browser star icon |
| Bookmark current page | Click the LaterMe toolbar icon |
| Browse all bookmarks | Click the toolbar icon, then "All Bookmarks" (or open the bookmarks page directly) |
| Search & filter | Search bar, intent tags, and sort options on the bookmarks page |
| Review & cleanup | Bookmarks page → "Review Cleanup" button |
| Settings | Right-click the extension icon → Options |

### Keyboard Shortcuts

**Inline popup:** `Enter` to save, `Esc` to dismiss

**Review mode:** `O` open · `K` keep · `A` archive · `D` delete · `Esc` exit

## Settings

| Setting | Options | Default |
|---------|---------|---------|
| Resurfacing | Enabled / Disabled | Enabled |
| Cooldown | 1–30 days before same bookmark resurfaces | 3 days |
| Frequency | Daily / Weekly / Never | Daily |
| Age range | 90 days – Unlimited | 1 year |

## Tech Stack

TypeScript · Vite (custom build plugin) · Manifest V3 · IndexedDB · Chrome/Edge compatible

## Package

```bash
npm run zip       # generates laterme.zip ready for store submission
```

## Project Structure

```
src/
├── background/       # Service worker — lifecycle, alarms, message routing
│   ├── index.ts      #   Main handler, message dispatch, install/update hooks
│   ├── bookmark.ts   #   Bookmark create listener, history tracking
│   ├── resurfacing.ts#   Alarm scheduling, candidate selection
│   └── alarm.ts      #   Expiry check alarm
├── content/          # Content scripts injected into every page
│   ├── capture.ts    #   Entry point — listens for popup requests
│   ├── inlinePopup.ts#   Shadow DOM popup with note editor and intent picker
│   └── popup/        #   Fallback popup window (for chrome:// pages)
├── bookmarks/        # Bookmarks management page
│   ├── index.html    #   Full-page bookmarks view
│   ├── index.ts      #   Render, filter, sort, search, review mode
│   └── style.css     #   Page styles
├── options/          # Settings page
│   ├── index.html
│   ├── index.ts      #   Settings form, import/export, stats
│   └── style.css
├── welcome/          # First-install welcome page
├── storage/          # IndexedDB layer
│   ├── db.ts         #   CRUD operations for metas, logs, settings
│   └── types.ts      #   Type definitions, constants, defaults
└── utils/
    ├── browser.ts    #   Chrome API wrappers (cross-browser compat)
    ├── extractor.ts  #   Page metadata extraction (favicon, description)
    ├── format.ts     #   Date formatting, HTML escaping
    └── matcher.ts    #   Resurfacing candidate selection logic
```

## Privacy

LaterMe does not collect, transmit, or store any data on remote servers. All bookmark metadata, notes, and settings live exclusively in your browser's local storage (IndexedDB). Uninstalling the extension does not affect your native browser bookmarks.

## License

MIT
