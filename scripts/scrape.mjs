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
      thumb: item.video?.cover ?? item.video?.originCover ?? null,
      pinned: !!item.isPinnedItem,
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
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  // long-form uploads live on /videos as lockupViewModel cards (Shorts-only channels just have none)
  const vres = await fetch(acct.url + '/videos', {headers: {'user-agent': UA, 'accept-language': 'en-US,en;q=0.9'}});
  const vjson = (await vres.text()).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/)?.[1];
  for (const o of vjson ? walk(JSON.parse(vjson)) : []) {
    const l = o.lockupViewModel;
    if (!l?.contentId || videos.some((v) => v.id === l.contentId)) continue;
    const parts = (l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows ?? []).flatMap((r) => r.metadataParts ?? []);
    const views = parts.find((p) => /views?$/i.test(p.accessibilityLabel ?? p.text?.content ?? ''));
    videos.push({
      id: l.contentId,
      title: l.metadata?.lockupMetadataViewModel?.title?.content ?? '',
      views: num(views?.text?.content?.replace(/ views?$/i, '')),
      likes: null,
      comments: null,
      postedAt: null,
      url: `https://www.youtube.com/watch?v=${l.contentId}`,
      thumb: `https://i.ytimg.com/vi/${l.contentId}/hqdefault.jpg`,
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
          thumb: o.image_versions2?.candidates?.[0]?.url ?? o.display_uri ?? o.thumbnail_src ?? `https://www.instagram.com/p/${o.code}/media/?size=l`,
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
    [...document.querySelectorAll('a[href*="/reel/"]')].map((a) => ({href: a.getAttribute('href'), text: a.innerText, alt: a.querySelector('img')?.alt ?? '', img: a.querySelector('img')?.src ?? null})),
  );
  for (const t of tiles) {
    const code = t.href.match(/\/reel\/([\w-]+)/)?.[1];
    if (!code || found.has(code)) continue;
    found.set(code, {id: code, title: t.alt.slice(0, 120) || null, views: num(t.text.trim().split('\n')[0] || null), likes: null, comments: null, postedAt: null, url: `https://www.instagram.com/reel/${code}/`, thumb: t.img || `https://www.instagram.com/p/${code}/media/?size=l`});
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
      .map(([id, a]) => ({id, text: a.innerText, url: `https://www.facebook.com/reel/${id}/`, img: a.querySelector('img')?.src ?? null})),
  );
  const videos = reels.map((r) => ({id: r.id, title: null, views: num(r.text.match(/[\d.,]+[KMB]?/)?.[0]), likes: null, comments: null, postedAt: null, url: r.url, thumb: r.img}));
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
      .map(([id, a]) => {
        const c = a.closest('[data-pressable-container]');
        const img = [...(c?.querySelectorAll('img') ?? [])].find((i) => !/profile picture/i.test(i.alt) && i.naturalWidth > 100);
        return {id, url: a.href.split('?')[0], text: c?.innerText ?? '', img: c?.querySelector('video')?.poster || img?.src || null};
      }),
  );
  const videos = posts.map((p) => ({id: p.id, title: p.text.split('\n').find((l) => l.length > 20)?.slice(0, 120) ?? null, views: null, likes: null, comments: null, postedAt: null, url: p.url, thumb: p.img}));
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
        img: a.querySelector('video')?.poster || [...a.querySelectorAll('img')].find((i) => /pbs\.twimg\.com\/(?!profile_images)/.test(i.src))?.src || null,
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
        thumb: p.img,
      };
    });
  return {followers: num(followers), likes: null, posts: null, videos, avatarUrl: await ogImage(page)};
}

// Saves an image (profile picture, latest-video thumbnail) locally; CDN links from TikTok/Instagram expire within days.
async function saveImage(dir, id, url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {headers: {'user-agent': UA}});
    if (!res.ok) return null;
    mkdirSync(path.join(root, 'public', dir), {recursive: true});
    writeFileSync(path.join(root, 'public', dir, `${id}.jpg`), Buffer.from(await res.arrayBuffer()));
    return `/${dir}/${id}.jpg?v=${Date.now()}`;
  } catch {
    return null;
  }
}
const saveAvatar = (id, url) => saveImage('avatars', id, url);

// Date, likes and comments of one YouTube video from its public watch page (the channel tabs don't list them).
async function youtubeDetails(v) {
  try {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${v.id}`, {headers: {'user-agent': UA, 'accept-language': 'en-US,en;q=0.9'}})).text();
    const likes = html.match(/"likeCount":"(\d+)"/)?.[1];
    const posted = html.match(/"(?:publishDate|uploadDate)":"([^"]+)"/)?.[1];
    // The comment count only arrives with the comments section: ask for it with the page's continuation token.
    const at = html.indexOf('comment-item-section');
    const token = at > 0 ? [...html.slice(Math.max(0, at - 2000), at).matchAll(/"token":"([^"]+)"/g)].at(-1)?.[1] : null;
    const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
    let comments = null;
    if (token && clientVersion) {
      const res = await fetch('https://www.youtube.com/youtubei/v1/next', {
        method: 'POST',
        headers: {'content-type': 'application/json', 'user-agent': UA},
        body: JSON.stringify({context: {client: {clientName: 'WEB', clientVersion, hl: 'en'}}, continuation: token}),
      });
      for (const o of walk(await res.json().catch(() => null))) {
        if (o.commentsHeaderRenderer) {
          comments = num(o.commentsHeaderRenderer.countText?.runs?.[0]?.text);
          break;
        }
      }
    }
    return {...v, postedAt: posted ? new Date(posted).toISOString() : v.postedAt, likes: likes != null ? Number(likes) : v.likes, comments: comments ?? v.comments};
  } catch {
    return v;
  }
}

// The newest upload: by date where the platform gives one, else the first non-pinned item in profile order (newest first).
async function latestVideo(id, acct, videos) {
  let pool = videos.filter((v) => !v.pinned);
  if (acct.platform === 'youtube') {
    // Shorts and long-form are separate lists: date the newest of each and keep the newer.
    const firsts = [pool.find((v) => v.url.includes('/shorts/')), pool.find((v) => v.url.includes('watch?v='))].filter(Boolean);
    pool = await Promise.all(firsts.map(youtubeDetails));
  }
  const dated = pool.filter((v) => v.postedAt);
  const v = dated.length ? dated.reduce((a, b) => (b.postedAt > a.postedAt ? b : a)) : pool[0];
  if (!v) return null;
  return {...v, thumb: (await saveImage('thumbs', id, v.thumb)) ?? v.thumb ?? null};
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
    r.latest = (await latestVideo(id, acct, r.videos)) ?? previous.accounts[id]?.latest ?? null;
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
