import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const { version } = JSON.parse(await readFile('manifest.json', 'utf8'));
const notices = (await readFile('THIRD-PARTY-NOTICES.md', 'utf8')).replace(/\r\n/g, '\n');
// Use Obsidian's CommonJS loader even for the optional, lazily loaded Electron API.
await build({ entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'electron'], platform: 'node', format: 'cjs', target: 'es2022', supported: { 'dynamic-import': false }, outfile: 'main.js', logLevel: 'info', banner: { js: `/* WeChat Layout ${version}\n${notices.replaceAll('*/', '* /')}\n*/` } });
