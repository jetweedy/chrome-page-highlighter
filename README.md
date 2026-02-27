# Page Highlighter (Chrome Extension)

A lightweight Chrome extension that lets you highlight text on any webpage in multiple colors, automatically restores those highlights when the page reloads, and allows you to print or export the page with highlights preserved.

This project was originally built to make it easier to review and export conference schedules, but it works on any webpage.

---

## Features

- Highlight selected text in multiple colors
- Highlights persist across page reloads
- Automatically restores highlights even on pages that load content dynamically
- Print or save pages as PDF with highlights intact
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

- Select text on any webpage
- Right-click
- Choose **Page Highlighter**
- Select a highlight color

### Export / Print

- Click the extension icon in the Chrome toolbar
- Click **Print / Save as PDF**

### Clear highlights

- Right-click the page
- Choose **Clear highlights on this page**

---

## How It Works

Highlights are stored locally using Chrome's extension storage API and anchored to the page using a combination of:

- DOM position paths
- Text quote matching

The extension also monitors the page for dynamic content changes and restores highlights if the page re-renders.

No data is sent to any external server.

All highlights remain private and stored locally on your machine.

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