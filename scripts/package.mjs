import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const dir = 'release/wechat-layout';
await mkdir(dir, { recursive: true });
for (const name of ['main.js', 'manifest.json', 'styles.css', 'README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md']) await copyFile(name, `${dir}/${name}`);
const manifest = JSON.parse((await readFile('manifest.json', 'utf8')).replace(/^\uFEFF/, ''));
let versions = {};
try { versions = JSON.parse((await readFile('versions.json', 'utf8')).replace(/^\uFEFF/, '')); } catch {}
await writeFile('versions.json', JSON.stringify({ ...versions, [manifest.version]: manifest.minAppVersion }, null, 2) + '\n');
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${dir}' -DestinationPath 'release/wechat-layout-${manifest.version}.zip' -Force`], { stdio: 'inherit' });
console.log(`Created release/wechat-layout-${manifest.version}.zip`);
