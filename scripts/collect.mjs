// Builds public/data/skills.json (social skills, their accounts and generated videos)
// and public/data/research.json (the scraped TikTok research tables).
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config/accounts.json'), 'utf8'));
const outDir = path.join(root, 'public/data');
mkdirSync(outDir, {recursive: true});

// Minimal glob: '*' matches within one path segment.
const glob = (pattern) => {
  const parts = pattern.split('/');
  let paths = [parts.shift() + '/'];
  for (const part of parts) {
    const re = new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    paths = paths.flatMap((dir) => {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
      return readdirSync(dir).filter((n) => re.test(n)).map((n) => path.posix.join(dir, n));
    });
  }
  return paths.filter((p) => statSync(p).isFile());
};

const frontmatter = (text) => {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const get = (k) => m?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].replace(/^["']|["']$/g, '').trim();
  return {name: get('name'), description: get('description')};
};

// Drive copies for playback on the hosted site, keyed by upload name (Mei's final.mp4s are renamed mei-vidN.mp4).
const driveFile = path.join(root, 'config/drive-videos.json');
const drive = existsSync(driveFile) ? JSON.parse(readFileSync(driveFile, 'utf8')) : {};
const driveName = (p) => {
  const mei = p.match(/MEI\/VIDEOS\/(vid\d+)\//);
  return mei ? `mei-${mei[1]}.mp4` : path.basename(p);
};

const skills = Object.entries(config.skills).map(([id, s]) => {
  const file = path.join(config.skillsDir, id, 'SKILL.md');
  const fm = existsSync(file) ? frontmatter(readFileSync(file, 'utf8')) : {};
  const videos = s.videoGlobs
    .flatMap(glob)
    .map((p) => {
      const st = statSync(p);
      return {file: path.basename(p), folder: path.dirname(p).replaceAll('/', '\\'), path: p, sizeMB: +(st.size / 1e6).toFixed(1), modified: st.mtime.toISOString(), driveId: drive[driveName(p)] ?? null};
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
  return {
    id,
    installed: existsSync(file),
    description: fm.description ?? '',
    accounts: s.accounts.map((a) => ({id: a, ...config.accounts[a]})),
    note: s.note ?? null,
    videos,
  };
});

// Research pages build some tables with JavaScript, so render each in headless Chrome and read the DOM.
const browser = await puppeteer.launch({executablePath: config.chromePath, headless: true, args: ['--no-first-run']});
const research = [];
for (const f of config.researchFiles.filter(existsSync)) {
  const page = await browser.newPage();
  await page.goto('file:///' + f, {waitUntil: 'load'});
  const data = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // The caption of a table is the closest heading or paragraph before it.
    const captionFor = (table) => {
      for (let el = table.previousElementSibling; el; el = el.previousElementSibling) {
        if (/^(H[1-6]|P)$/.test(el.tagName) && clean(el.innerText)) return clean(el.innerText);
        if (el.tagName === 'TABLE') break;
      }
      return null;
    };
    return {
      title: document.title,
      heading: clean(document.querySelector('h1,h2')?.innerText),
      notes: [...document.querySelectorAll('body > p')].slice(0, 2).map((p) => clean(p.innerText)),
      tables: [...document.querySelectorAll('table')].map((t) => {
        const rows = [...t.rows].map((r) => [...r.cells].map((c) => ({text: clean(c.innerText), href: c.querySelector('a')?.href ?? null})));
        return {caption: captionFor(t), columns: rows[0]?.map((c) => c.text) ?? [], rows: rows.slice(1)};
      }).filter((t) => t.rows.length),
    };
  });
  research.push({file: f, modified: statSync(f).mtime.toISOString(), ...data});
  await page.close();
}
await browser.close();

writeFileSync(path.join(outDir, 'skills.json'), JSON.stringify({generatedAt: new Date().toISOString(), skills}, null, 2));
writeFileSync(path.join(outDir, 'research.json'), JSON.stringify({generatedAt: new Date().toISOString(), pages: research}, null, 2));
console.log(`collect: ${skills.length} skills, ${skills.reduce((n, s) => n + s.videos.length, 0)} videos, ${research.length} research pages`);
