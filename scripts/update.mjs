// One refresh: rebuild skills/videos/research, then scrape social stats. Run hourly by the scheduled task.
import {execFileSync} from 'node:child_process';
import {appendFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
mkdirSync(path.join(root, 'logs'), {recursive: true});
const log = (s) => appendFileSync(path.join(root, 'logs/update.log'), `[${new Date().toISOString()}] ${s}\n`);
for (const script of ['collect.mjs', 'scrape.mjs']) {
  try {
    const out = execFileSync(process.execPath, [path.join(root, 'scripts', script)], {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15 * 60_000});
    log(`${script} ok\n${out.trim()}`);
  } catch (e) {
    log(`${script} FAILED ${e.message}\n${e.stdout ?? ''}`);
  }
}
