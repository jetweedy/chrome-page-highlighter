# Page Highlighter (Chrome Extension)

A lightweight Chrome extension that lets you highlight text on any webpage in multiple colors, automatically restores those highlights when the page reloads, and allows you to print or export the page with highlights preserved.

This project was originally built to make it easier to review and export conference schedules, but it works on any webpage.

---

## Features

- Highlight selected text in multiple colors
- Floating highlight toolbar appears when text is selected
- Highlights persist across page reloads
- Automatically restores highlights even on pages that load content dynamically
- Export only your highlighted text to a clean printable view or PDF
- Print or save full pages with highlights intact
- Highlights sync across your Chrome profile (via Chrome Sync)
- Clear all highlights for a page with one click
- Works on most standard HTML pages and many modern web apps

---

## Installation (Developer Mode)

This extension is currently installed manually from source.

1. Clone this repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/page-highlighter.git
   ```

2. Open Chrome and navigate to:

   ```
   chrome://extensions/
   ```

3. Enable **Developer mode** (top right)

4. Click **Load unpacked**

5. Select the project folder

The extension will now be installed.

---

## Usage

### Highlight text

Option 1:

- Select text on any webpage
- Click a color in the floating toolbar

Option 2:

- Select text
- Right-click
- Choose **Page Highlighter**
- Select a highlight color

---

### Export highlights only

- Click the extension icon
- Click **Export highlights only**
- Use Chrome's print dialog to save as PDF

---

### Print page with highlights

- Click the extension icon
- Click **Print / Save as PDF**

---

### Clear highlights

- Click the extension icon and select **Clear highlights**, or
- Right-click the page and choose **Clear highlights on this page**

---

## How It Works

Highlights are stored using Chrome's Sync storage API, allowing them to persist across page reloads and sync across your Chrome profile.

Highlights are anchored using DOM position paths with text-based fallback matching for reliability.

The extension monitors the page for dynamic content changes and restores highlights if the page re-renders.

---

## Storage

Highlights are stored using Chrome Sync storage.

This allows highlights to:

- Persist across browser restarts
- Sync across devices where you are signed into Chrome

No external servers are used.

---

## Limitations

This is an MVP and has some limitations:

- Very complex selections across many nested elements may not highlight correctly
- Some highly dynamic or virtualized web apps may require additional tuning
- Highlights are stored per-page URL (origin + pathname)

---

## Privacy

This extension:

- Does NOT collect personal data
- Does NOT send any data externally
- Stores all highlights locally using Chrome storage

---

## Project Structure

```
manifest.json      Chrome extension configuration  
background.js     Context menu and messaging  
content.js        Highlight logic and persistence  
popup.html        Extension popup UI  
popup.js  
popup.css  
```

---

## Future Improvements

Possible enhancements include:

- Floating highlight toolbar
- Highlight notes
- Export highlights only
- JSON import/export
- Chrome sync support

---

## Current Version

v1.0

Includes:

- Floating highlight toolbar
- Persistent highlights
- Export highlights only
- Chrome Sync support

---

## License

MIT License

---

## Author

Jonathan Tweedy

---

## Why This Exists

Many existing annotation extensions are heavy, complex, or unreliable on modern web apps.

This extension focuses on:

- Simplicity
- Reliability
- Export usefulness
- Minimal footprint