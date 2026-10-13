import React, {useEffect, useState} from 'react';
import Social from './Social.jsx';
import Skills from './Skills.jsx';
import Research from './Research.jsx';
import {ago} from './format.js';

const TABS = [
  {id: 'social', label: 'Social Stats'},
  {id: 'skills', label: 'Skills & Videos'},
  {id: 'research', label: 'TikTok Research'},
];

const load = (name) => fetch(`/data/${name}.json`, {cache: 'no-store'}).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// The hourly task rewrites public/data/*.json; the page re-reads it every minute.
const useData = () => {
  const [data, setData] = useState({});
  useEffect(() => {
    const refresh = async () => {
      const [social, history, skills, research] = await Promise.all(['social', 'history', 'skills', 'research'].map(load));
      setData({social, history, skills, research});
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);
  return data;
};

export default function App() {
  const data = useData();
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'social');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const go = (id) => {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="dot" />
          <h1>Mission Control</h1>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="updated" title={data.social?.updatedAt}>
          Stats updated <b>{ago(data.social?.updatedAt)}</b>
        </div>
      </header>
      <main>
        {tab === 'social' && <Social social={data.social} history={data.history} />}
        {tab === 'skills' && <Skills skills={data.skills} social={data.social} />}
        {tab === 'research' && <Research research={data.research} />}
      </main>
    </div>
  );
}
