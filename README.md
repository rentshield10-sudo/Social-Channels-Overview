# Mission Control

Local dashboard for social skills, their generated videos, social stats and TikTok research.
Open **http://localhost:5180** (fixed port, `--strictPort`). The site starts hidden at Windows logon (task "Mission Control - site");
the same task re-runs every 5 minutes as a watchdog, so a crashed site comes back on its own (a second copy exits because the port is taken).

| Command | What it does |
|---|---|
| `npm run update` | Refresh everything now (collect + scrape). Runs hourly, hidden (task "Mission Control - social stats hourly"). |
| `npm run collect` | Rebuild skills, videos and research data only. |
| `npm run scrape` | Scrape TikTok / Instagram / Facebook / YouTube / Threads / X only. Profile pictures are saved to `public/avatars/`. |
| `npm run login` | Open the scraper's own Chrome profile to sign in to Facebook (only needed for extra per-Reel views; Instagram views come from the public Reels tab). |
| `npm run dev` | Run the site in a terminal instead of hidden. |

- Accounts, skills and video folders: `config/accounts.json`.
- Data the site reads (re-read every minute): `public/data/*.json`.
- Logs: `logs/update.log`.
