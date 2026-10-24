import React, {useState} from 'react';
import {PLATFORMS, ago, date, n} from './format.js';

// Follower change between the oldest and newest hourly snapshot.
const growth = (history, id) => {
  const points = (history ?? []).map((h) => h.accounts[id]?.followers).filter((v) => v != null);
  return points.length > 1 ? points.at(-1) - points[0] : null;
};

const Icon = ({platform}) => <span className="picon" style={{'--icon': `url(/icons/${platform}.svg)`, color: PLATFORMS[platform].color}} />;

function AccountCard({id, a, history}) {
  const p = PLATFORMS[a.platform];
  const g = growth(history, id);
  return (
    <div className="card account" style={{'--accent': p.color}}>
      <div className="card-head">
        <a href={a.url} target="_blank" rel="noreferrer" className="avatar" title={`Open ${a.name} on ${p.label}`}>
          {a.avatar ? <img src={a.avatar} alt="" /> : <span>{a.name.replace('@', '')[0]}</span>}
        </a>
        <div className="who">
          <a href={a.url} target="_blank" rel="noreferrer">
            {a.name}
          </a>
          <span className="badge">{p.label}</span>
        </div>
        <a className="open" href={a.url} target="_blank" rel="noreferrer">
          Open profile ↗
        </a>
      </div>
      <div className="stats">
        <div>
          <span className="big">{n(a.followers)}</span>
          <span className="lbl">{a.platform === 'youtube' ? 'subscribers' : 'followers'}</span>
          {g != null && g !== 0 && <span className={`delta ${g > 0 ? 'up' : 'down'}`}>{g > 0 ? '+' : ''}{n(g)}</span>}
        </div>
        <div>
          <span className="big">{n(a.totalViews)}</span>
          <span className="lbl">
            {a.platform === 'threads' ? `views aren't public on Threads (${a.videos?.length ?? 0} posts)` : `views on ${a.videos?.length ?? 0} tracked videos`}
          </span>
        </div>
        {a.likes != null && (
          <div>
            <span className="big">{n(a.likes)}</span>
            <span className="lbl">likes</span>
          </div>
        )}
      </div>
      {a.latest && (
        <a className="latest" href={a.latest.url} target="_blank" rel="noreferrer" title="Open the latest upload">
          <div className="latest-thumb">{a.latest.thumb ? <img src={a.latest.thumb} alt="" loading="lazy" /> : <span>no thumbnail</span>}</div>
          <div className="latest-info">
            <span className="lbl">Latest upload · {date(a.latest.postedAt)}</span>
            <span className="latest-title">{a.latest.title || a.latest.id}</span>
            <span className="latest-stats">
              <b>{n(a.latest.views)}</b> views · <b>{n(a.latest.likes)}</b> likes · <b>{n(a.latest.comments)}</b> comments
            </span>
          </div>
        </a>
      )}
      <div className="card-foot">
        {a.ok ? <span className="ok">● live</span> : <span className="err">● last run failed: {a.error}</span>}
        {a.needsLogin && <span className="warn">video views need login (npm run login)</span>}
        <span className="muted">checked {ago(a.scrapedAt)}</span>
      </div>
    </div>
  );
}

export default function Social({social, history}) {
  const accounts = Object.entries(social?.accounts ?? {});
  const [platform, setPlatform] = useState('all');
  const [pick, setPick] = useState('all');
  const [sort, setSort] = useState('views');
  if (!social) return <p className="empty">No stats yet. Run <code>npm run update</code>.</p>;

  const platforms = [...new Set(accounts.map(([, acc]) => acc.platform))];
  const shown = accounts.filter(([, acc]) => platform === 'all' || acc.platform === platform);
  const current = shown.some(([id]) => id === pick) ? pick : 'all';
  const a = current === 'all' ? null : social.accounts[current];
  const pool = current === 'all' ? shown : shown.filter(([id]) => id === current);
  const videos = pool.flatMap(([id, acc]) => (acc.videos ?? []).map((v) => ({...v, acct: id}))).sort((x, y) =>
    sort === 'views' ? (y.views ?? -1) - (x.views ?? -1) : (y.postedAt ?? '').localeCompare(x.postedAt ?? ''),
  );

  return (
    <>
      <div className="filters">
        <div className="tabs">
          <button className={platform === 'all' ? 'on' : ''} onClick={() => setPlatform('all')}>All</button>
          {platforms.map((pl) => (
            <button key={pl} className={platform === pl ? 'on' : ''} onClick={() => setPlatform(pl)} style={{'--accent': PLATFORMS[pl].color}}>
              <Icon platform={pl} /> {PLATFORMS[pl].label}
            </button>
          ))}
        </div>
        <div className="tabs channel-tabs">
          <button className={current === 'all' ? 'on' : ''} onClick={() => setPick('all')}>All channels</button>
          {shown.map(([id, acc]) => (
            <button key={id} className={id === current ? 'on' : ''} onClick={() => setPick(id)} style={{'--accent': PLATFORMS[acc.platform].color}}>
              <Icon platform={acc.platform} /> {acc.name}
            </button>
          ))}
        </div>
      </div>

      <section className="grid accounts">
        {pool.map(([id, acc]) => (
          <AccountCard key={id} id={id} a={acc} history={history} />
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Posted videos</h2>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="views">Most views</option>
            <option value="date">Newest</option>
          </select>
        </div>
        {videos.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Video</th>
                  {current === 'all' && <th>Channel</th>}
                  <th className="num">Views</th>
                  <th className="num">Likes</th>
                  <th className="num">Comments</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={`${v.acct}-${v.id}`}>
                    <td className="caption">
                      <a href={v.url} target="_blank" rel="noreferrer">
                        {v.title || v.id}
                      </a>
                    </td>
                    {current === 'all' && (
                      <td className="chan">
                        <Icon platform={social.accounts[v.acct].platform} /> {social.accounts[v.acct].name}
                      </td>
                    )}
                    <td className="num strong">{n(v.views)}</td>
                    <td className="num">{n(v.likes)}</td>
                    <td className="num">{n(v.comments)}</td>
                    <td>{date(v.postedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{a?.needsLogin ? 'Per-video views for this account need the scraper to be logged in: run npm run login once.' : 'No videos found.'}</p>
        )}
      </section>
    </>
  );
}
