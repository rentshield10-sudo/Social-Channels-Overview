import React, {useState} from 'react';
import {PLATFORMS, ago, date, n} from './format.js';

// Follower change between the oldest and newest hourly snapshot.
const growth = (history, id) => {
  const points = (history ?? []).map((h) => h.accounts[id]?.followers).filter((v) => v != null);
  return points.length > 1 ? points.at(-1) - points[0] : null;
};

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
  const [pick, setPick] = useState(null);
  const [sort, setSort] = useState('views');
  if (!social) return <p className="empty">No stats yet. Run <code>npm run update</code>.</p>;

  const current = pick ?? accounts[0]?.[0];
  const a = social.accounts[current];
  const videos = [...(a?.videos ?? [])].sort((x, y) =>
    sort === 'views' ? (y.views ?? -1) - (x.views ?? -1) : (y.postedAt ?? '').localeCompare(x.postedAt ?? ''),
  );

  return (
    <>
      <section className="grid accounts">
        {accounts.map(([id, acc]) => (
          <AccountCard key={id} id={id} a={acc} history={history} />
        ))}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Posted videos</h2>
          <div className="pills">
            {accounts.map(([id, acc]) => (
              <button key={id} className={id === current ? 'on' : ''} onClick={() => setPick(id)} style={{'--accent': PLATFORMS[acc.platform].color}}>
                {PLATFORMS[acc.platform].label} · {acc.name}
              </button>
            ))}
          </div>
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
                  <th className="num">Views</th>
                  <th className="num">Likes</th>
                  <th className="num">Comments</th>
                  <th>Posted</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id}>
                    <td className="caption">
                      <a href={v.url} target="_blank" rel="noreferrer">
                        {v.title || v.id}
                      </a>
                    </td>
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
