import React, {useMemo, useState} from 'react';
import {date} from './format.js';

// "1.2M" / "12,400" / "3.5x" -> number, for sorting.
const value = (t) => {
  const m = t.replace(/,/g, '').match(/^([\d.]+)\s*([KMB])?x?$/i);
  return m ? parseFloat(m[1]) * ({k: 1e3, m: 1e6, b: 1e9}[(m[2] || '').toLowerCase()] || 1) : null;
};

function DataTable({table, query}) {
  const [sort, setSort] = useState(null);
  const rows = useMemo(() => {
    const q = query.toLowerCase();
    let r = table.rows.filter((row) => !q || row.some((c) => c.text.toLowerCase().includes(q)));
    if (sort) {
      r = [...r].sort((a, b) => {
        const x = a[sort.i]?.text ?? '';
        const y = b[sort.i]?.text ?? '';
        const vx = value(x);
        const vy = value(y);
        const c = vx != null && vy != null ? vx - vy : x.localeCompare(y);
        return sort.desc ? -c : c;
      });
    }
    return r;
  }, [table, query, sort]);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="sortable" onClick={() => setSort({i, desc: sort?.i === i ? !sort.desc : true})}>
                {c}
                {sort?.i === i ? (sort.desc ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => (
                <td key={ci} className={table.columns[ci] === 'Caption' ? 'caption' : value(c.text) != null ? 'num' : ''}>
                  {c.href ? (
                    <a href={c.href} target="_blank" rel="noreferrer">
                      {c.text || 'open'}
                    </a>
                  ) : (
                    c.text
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Research({research}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  if (!research?.pages?.length) return <p className="empty">No research files found.</p>;
  const p = research.pages[page];

  return (
    <>
      <div className="section-head">
        <div className="pills">
          {research.pages.map((r, i) => (
            <button key={r.file} className={i === page ? 'on' : ''} onClick={() => setPage(i)}>
              {r.title} <span className="muted">{r.tables.reduce((s, t) => s + t.rows.length, 0)}</span>
            </button>
          ))}
        </div>
        <input className="search" placeholder="Filter creators, captions…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <section className="card">
        <h2>{p.heading}</h2>
        <p className="muted mono">
          {p.file} · scraped {date(p.modified)}
        </p>
        {p.tables.map((t, i) => (
          <div key={i} className="research-table">
            {t.caption && <p className="note">{t.caption}</p>}
            <DataTable table={t} query={query} />
          </div>
        ))}
      </section>
    </>
  );
}
