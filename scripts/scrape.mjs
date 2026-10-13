// Scrapes public follower/view numbers for every account in config/accounts.json into
// public/data/social.json (latest) and public/data/history.json (hourly snapshots).
// Runs headless Chrome with its own profile (.scraper-profile), so nothing appears on screen.
// Facebook per-Reel views only show when that profile is logged in (npm run login); Instagram's public Reels tab shows them.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(path.join(root, 'config/accounts.json'), 'utf8'));
const socialFile = path.join(root, 'public/data/social.json');
const historyFile = path.join(root, 'public/data/history.json');
const avatarDir = path.join(root, 'public/avatars');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const num = (s) => {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const m = String(s).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({k: 1e3, m: 1e6, b: 1e9}[(m[2] || '').toLowerCase()] || 1));
};

const ogImage = (page) => page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content ?? null);

// Every object anywhere in a JSON value.
function* walk(v) {
  if (v && typeof v === 'object') {
    yield v;
    for (const x of Object.values(v)) yield* walk(x);
  }
}

async function tiktok(page, acct) {
  const lists = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/post/item_list')) lists.push(await r.json().catch(() => null));
  });
  await page.goto(acct.url, {waitUntil: 'networkidle2', timeout: 90000});
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 4000));
    await new Promise((r) => setTimeout(r, 2500));
  }
  const info = await page.evaluate(() => {
    const s = document.querySelector('#__UNIVERSAL_DATA_FOR_REHYDRATION__');
    return s ? JSON.parse(s.textContent).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo : null;
  });
  if (!info) throw new Error('profile data not found (blocked or captcha)');
  const handle = info.user.uniqueId;
  const seen = new Map();
  for (const item of lists.flatMap((l) => l?.itemList ?? [])) {
    seen.set(item.id, {
      id: item.id,
      title: item.desc,
      views: item.stats?.playCount ?? null,
      likes: item.stats?.diggCount ?? null,
      comments: item.stats?.commentCount ?? null,
      postedAt: item.createTime ? new Date(item.createTime * 1000).toISOString() : null,
      url: `https://www.tiktok.com/@${handle}/video/${item.id}`,
    });
  }
  return {followers: info.stats.followerCount, likes: info.stats.heartCount, posts: info.stats.videoCount, videos: [...seen.values()], avatarUrl: info.user.avatarLarger ?? info.user.avatarMedium};
}

async function youtube(_page, acct) {
  const res = await fetch(acct.url + '/shorts', {headers: {'user-agent': UA, 'accept-language': 'en-US,en;q=0.9'}});
  const html = await res.text();
  const json = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  if (!json) throw new Error(`no ytInitialData (HTTP ${res.status})`);
  const data = JSON.parse(json);
  const subs = JSON.stringify(data).match(/"([\d.,]+[KMB]?) subscribers?"/i)?.[1];
  const videos = [];
  for (const o of walk(data)) {
    const s = o.shortsLockupViewModel;
    if (!s) continue;
    const id = s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ?? s.entityId?.replace('shorts-shelf-item-', '');
    const text = s.accessibilityText ?? '';
    videos.push({
      id,
      title: s.overlayMetadata?.primaryText?.content ?? text.replace(/, [\d.,KMB]+ views.*$/i, ''),
      views: num(s.overlayMetadata?.secondaryText?.content ?? text.match(/([\d.,]+[KMB]?) views/i)?.[1]),
      likes: null,
      comments: null,
      postedAt: null,
      url: `https://www.youtube.com/shorts/${id}`,
    });
  }
  const avatarUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
  return {followers: num(subs), likes: null, posts: videos.length, videos, avatarUrl};
}

async function instagram(page, acct) {
  const found = new Map();
  page.on('response', async (r) => {
    if (!/graphql|api\/v1/.test(r.url())) return;
    const body = await r.json().catch(() => null);
    for (const o of walk(body)) {
      const views = o.play_count ?? o.ig_play_count ?? o.video_view_count ?? o.view_count;
      if (o.code && views != null) {
        found.set(o.code, {
          id: o.code,
          title: (o.caption?.text ?? '').slice(0, 120),
          views,
          likes: o.like_count ?? null,
          comments: o.comment_count ?? null,
          postedAt: o.taken_at ? new Date(o.taken_at * 1000).toISOString() : null,
          url: `https://www.instagram.com/reel/${o.code}/`,
        });
      }
    }
  });
  await page.goto(acct.url, {waitUntil: 'networkidle2', timeout: 90000});
  const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content ?? '');
  const m = og.match(/([\d.,]+[KMB]?) Followers, ([\d.,]+[KMB]?) Following, ([\d.,]+[KMB]?) Posts/i);
  if (!m) throw new Error('profile numbers not found');
  const avatarUrl = await ogImage(page);
  await page.goto(acct.url.replace(/\/?$/, '/reels/'), {waitUntil: 'networkidle2', timeout: 90000}).catch(() => {});
  // The public Reels tab prints each reel's view count on its tile, no login needed.
  const tiles = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/reel/"]')].map((a) => ({href: a.getAttribute('href'), text: a.innerText, alt: a.querySelector('img')?.alt ?? ''})),
  );
  for (const t of tiles) {
    const code = t.href.match(/\/reel\/([\w-]+)/)?.[1];
    if (!code || found.has(code)) continue;
    found.set(code, {id: code, title: t.alt.slice(0, 120) || null, views: num(t.text.trim().split('\n')[0] || null), likes: null, comments: null, postedAt: null, url: `https://www.instagram.com/reel/${code}/`});
  }
  return {followers: num(m[1]), likes: null, posts: num(m[3]), videos: [...found.values()], needsLogin: false, avatarUrl};
}

async function facebook(page, acct) {
  await page.goto(acct.url, {waitUntil: 'networkidle2', timeout: 90000});
  const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content ?? '');
  const followers = og.match(/([\d.,]+[KMB]?) followers?/i)?.[1];
  const likes = og.match(/([\d.,]+[KMB]?) likes?/i)?.[1];
  const avatarUrl = await ogImage(page);
  // Reel view counts render on the Reels tab only for logged-in sessions.
  await page.goto(acct.url + (acct.url.includes('?') ? '&' : '?') + 'sk=reels_tab', {waitUntil: 'networkidle2', timeout: 90000}).catch(() => {});
  const reels = await page.evaluate(() =>
    [...new Map([...document.querySelectorAll('a[href*="/reel/"]')].map((a) => [a.href.match(/\/reel\/(\d+)/)?.[1], a])).entries()]
      .filter(([id]) => id)
      .map(([id, a]) => ({id, text: a.innerText, url: `https://www.facebook.com/reel/${id}/`})),
  );
  const videos = reels.map((r) => ({id: r.id, title: null, views: num(r.text.match(/[\d.,]+[KMB]?/)?.[0]), likes: null, comments: null, postedAt: null, url: r.url}));
  const loggedIn = await page.evaluate(() => !document.querySelector('form[action*="login"], a[href*="/login"]'));
  if (followers == null && !videos.length) throw new Error('page numbers not found');
  return {followers: num(followers), likes: num(likes), posts: null, videos, needsLogin: !loggedIn && !videos.length, avatarUrl};
}

// Threads shows follower and post counts logged out, but not per-post views.
async function threads(page, acct) {
  await page.goto(acct.url, {waitUntil: 'networkidle2', timeout: 90000});
  const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content ?? '');
  const m = og.match(/([\d.,]+[KMB]?) Followers? • ([\d.,]+[KMB]?) Threads?/i);
  if (!m) throw new Error('profile numbers not found');
  const posts = await page.evaluate(() =>
    [...new Map([...document.querySelectorAll('a[href*="/post/"]')].map((a) => [a.href.match(/\/post\/([\w-]+)/)?.[1], a])).entries()]
      .filter(([id]) => id)
      .map(([id, a]) => ({id, url: a.href.split('?')[0], text: a.closest('[data-pressable-container]')?.innerText ?? ''})),
  );
  const videos = posts.map((p) => ({id: p.id, title: p.text.split('\n').find((l) => l.length > 20)?.slice(0, 120) ?? null, views: null, likes: null, comments: null, postedAt: null, url: p.url}));
  return {followers: num(m[1]), likes: null, posts: num(m[2]), videos, avatarUrl: await ogImage(page)};
}

// X shows the profile and recent posts (with view counts) to logged-out visitors.
async function x(page, acct) {
  await page.goto(acct.url, {waitUntil: 'networkidle2', timeout: 90000});
  await page.waitForSelector('article', {timeout: 15000}).catch(() => {});
  const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content ?? '');
  const followers = og.match(/([\d.,]+[KMB]?) followers?/i)?.[1];
  if (followers == null) throw new Error('profile numbers not found');
  // Logged-out X renders posts without data-testids: read the status link and the button labels.
  const posts = await page.evaluate(() =>
    [...document.querySelectorAll('article')].map((a) => {
      const btn = (label) => [...a.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label)?.innerText.trim() ?? '';
      return {
        path: [...a.querySelectorAll('a')].map((l) => l.getAttribute('href')).find((h) => /^\/[^/]+\/status\/\d+$/.test(h ?? '')),
        lines: a.innerText.split('\n').filter((l) => l.trim()),
        views: btn('View count'),
        likes: btn('Like'),
        replies: btn('Reply'),
      };
    }),
  );
  const videos = posts
    .filter((p) => p.path)
    .map((p) => {
      const id = p.path.match(/status\/(\d+)/)[1];
      return {
        id,
        // Lines are name, handle, age, then the post text, then video duration and view count.
        title: p.lines.slice(3).filter((l) => !/^[\d:]+$/.test(l)).join(' ').slice(0, 120),
        views: num(p.views || null),
        likes: num(p.likes || null),
        comments: num(p.replies || null),
        // Post IDs are snowflakes: the top bits are milliseconds since X's epoch.
        postedAt: new Date(Number((BigInt(id) >> 22n) + 1288834974657n)).toISOString(),
        url: `https://x.com${p.path}`,
      };
    });
  return {followers: num(followers), likes: null, posts: null, videos, avatarUrl: await ogImage(page)};
}

// Saves the profile picture locally; CDN links from TikTok/Instagram expire within days.
async function saveAvatar(id, url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {headers: {'user-agent': UA}});
    if (!res.ok) return null;
    mkdirSync(avatarDir, {recursive: true});
    writeFileSync(path.join(avatarDir, `${id}.jpg`), Buffer.from(await res.arrayBuffer()));
    return `/avatars/${id}.jpg?v=${Date.now()}`;
  } catch {
    return null;
  }
}

const scrapers = {tiktok, youtube, instagram, facebook, threads, x};

const previous = existsSync(socialFile) ? JSON.parse(readFileSync(socialFile, 'utf8')) : {accounts: {}};
const browser = await puppeteer.launch({
  executablePath: config.chromePath,
  headless: true,
  userDataDir: path.join(root, '.scraper-profile'),
  args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
});
const accounts = {};
for (const [id, acct] of Object.entries(config.accounts)) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  const at = new Date().toISOString();
  try {
    const {avatarUrl, ...r} = await scrapers[acct.platform](page, acct);
    r.avatar = (await saveAvatar(id, avatarUrl)) ?? previous.accounts[id]?.avatar ?? null;
    const totalViews = r.videos.some((v) => v.views != null) ? r.videos.reduce((n, v) => n + (v.views ?? 0), 0) : null;
    accounts[id] = {...acct, ...r, totalViews, ok: true, error: null, scrapedAt: at, lastSuccessAt: at};
    console.log(`${id}: followers ${r.followers}, ${r.videos.length} videos, views ${totalViews}`);
  } catch (e) {
    // Keep the last good numbers so one failed run doesn't blank the dashboard.
    accounts[id] = {...previous.accounts[id], ...acct, ok: false, error: e.message, scrapedAt: at};
    console.log(`${id}: FAILED ${e.message}`);
  }
  await page.close();
}
await browser.close();

const updatedAt = new Date().toISOString();
writeFileSync(socialFile, JSON.stringify({updatedAt, accounts}, null, 2));

const history = existsSync(historyFile) ? JSON.parse(readFileSync(historyFile, 'utf8')) : [];
history.push({
  at: updatedAt,
  accounts: Object.fromEntries(Object.entries(accounts).filter(([, a]) => a.ok).map(([id, a]) => [id, {followers: a.followers, totalViews: a.totalViews}])),
});
writeFileSync(historyFile, JSON.stringify(history.slice(-24 * 60)));
