# ApplyFlow Job Extractor

An automated Chrome Extension (Manifest V3) designed to extract clean, structured job postings (title, company, description, direct ATS apply URL, salary, location, work model) across major job boards including:
- **LinkedIn**
- **HiringCafe**
- **ZipRecruiter**
- **JobRight**
- **Generic ATS / Job Portals**

---

## 🚀 Quick Install (Using the pre-built ZIP)

If you just want to run the extension without building from source:

1. Download or extract `job-extractor-dist.zip` (or `extension/dist.zip`) to any folder on your computer (e.g., `applyflow-job-extractor/`).
2. Open Google Chrome and navigate to `chrome://extensions`.
3. In the top-right corner, toggle **Developer mode** on.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the unzipped folder containing `manifest.json`.
6. That's it! The **ApplyFlow Job Extractor** extension is now installed and ready to use.

---

## 🛠️ Development & Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (`npm i -g pnpm`)

### Installation & Build
```bash
# Navigate to the extension directory
cd extension

# Install dependencies
pnpm install

# Build the production bundle into extension/dist/
pnpm run build

# Or package directly into dist.zip
pnpm run zip
```

---

## ⌨️ Shortcuts & Features
- **Alt + J** (`extract-job`): Instant one-click extraction of the currently viewed job.
- **Floating Button / Popup**: Toggle the extension popup or click the floating button on supported job boards.
- **Automatic ATS Unwrapping**: Unwraps tracking and redirect links directly to native ATS portals (Workday, Greenhouse, Lever, Ashby, etc.).
