# WeChat Layout

[简体中文](README.zh-CN.md)

WeChat Layout is an Obsidian desktop plugin that formats Markdown notes for the WeChat Official Accounts editor. Pick a complete layout, preview the article on a phone or iPad, and copy the formatted body with its images in one step.

## Use the plugin

1. Open a note and click the newspaper icon or run `打开公众号排版预览` (Open WeChat preview) from the command palette. Run `排版当前选区` (Format current selection) to work with a selection.
2. Choose one of six presets. Each preset styles headings, paragraphs, lists, quotes, images, tables, and code together. Open `结尾` (Ending) to add an optional reusable Markdown ending.
3. Click `复制正文` (Copy body), then paste into the article body in the WeChat editor. The copy includes supported vault and remote images, embedded directly in the rich text. If an image cannot be prepared, the plugin reports the problem and leaves the clipboard as it was.

The More menu switches between phone and iPad previews. The preview, rich-text copy, and HTML export use the same inline article styles. Run `导出完整 HTML` (Export complete HTML) to save a standalone file with embedded images. The preview also lists the image names and shows a reference word count.

## Installation

Requires Obsidian 1.15.0 or later on desktop.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub release](https://github.com/Jackiechan24/WeChat_gzh_studio/releases/latest). Put all three files in `<vault>/.obsidian/plugins/wechat-layout/`, then enable WeChat Layout in Obsidian's Community plugins settings. To upgrade manually, replace those three files, keep `data.json`, and reload the plugin.

## Clipboard and network access

The plugin writes to the system clipboard only when you click Copy body or run `复制公众号正文` (Copy WeChat article). It writes HTML and plain text generated from the current article. It never reads the clipboard, monitors changes to it, or uploads its contents.

Formatting, vault image processing, and file export run locally. HTTP and HTTPS images are fetched from their original hosts for preview, copying, and export. The plugin has no account service, telemetry, or note upload service.

## Build from source

```sh
npm ci
npm test
npm run build
```

Version tags trigger [GitHub Actions](.github/workflows/release.yml) to test the source, build and attest the three plugin files, and publish them as release assets.

Licensed under [MIT](LICENSE). Bundled dependency licenses are documented in [Third-Party Notices](THIRD-PARTY-NOTICES.md).
