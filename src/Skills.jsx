import React, {useState} from 'react';
import {PLATFORMS, date, n} from './format.js';

export default function Skills({skills, social}) {
  const [playing, setPlaying] = useState(null);
  if (!skills) return <p className="empty">No skill data yet. Run <code>npm run update</code>.</p>;

  return (
    <>
      <section className="skills">
        {skills.skills.map((s) => (
          <div key={s.id} className="card skill">
            <div className="card-head">
              <h2>{s.id}</h2>
              {!s.installed && <span className="err">not installed</span>}
            </div>
            <p className="desc">{s.description}</p>

            <h3>Connected social media</h3>
            <div className="chips">
              {s.accounts.length ? (
                s.accounts.map((a) => {
                  const live = social?.accounts?.[a.id];
                  return (
                    <a key={a.id} className="chip" href={a.url} target="_blank" rel="noreferrer" style={{'--accent': PLATFORMS[a.platform].color}}>
                      {live?.avatar && <img className="chip-avatar" src={live.avatar} alt="" />}
                      <b>{PLATFORMS[a.platform].label}</b> {a.name}
                      {live?.followers != null && <span className="muted"> · {n(live.followers)} followers</span>}
                    </a>
                  );
                })
              ) : (
                <span className="none">None</span>
              )}
            </div>

            <h3>Generated videos ({s.videos.length})</h3>
            {s.note && <p className="muted">{s.note}</p>}
            {s.videos.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Location</th>
                      <th className="num">Size</th>
                      <th>Made</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {s.videos.map((v) => (
                      <tr key={v.path}>
                        <td className="mono">{v.file}</td>
                        <td className="mono path" title={v.folder}>
                          {v.folder}
                        </td>
                        <td className="num">{v.sizeMB} MB</td>
                        <td>{date(v.modified)}</td>
                        <td>
                          <button className="play" onClick={() => setPlaying(v)}>
                            ▶
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !s.note && <span className="none">None</span>
            )}
          </div>
        ))}
      </section>

      {playing && (
        <div className="modal" onClick={() => setPlaying(null)}>
          <div className="player" onClick={(e) => e.stopPropagation()}>
            <video src={`/media?path=${encodeURIComponent(playing.path)}`} controls autoPlay />
            <div className="mono path">
              {playing.folder}\{playing.file}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
