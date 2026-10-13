import {createReadStream, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Streams local MP4s listed in public/data/skills.json so the dashboard can play them.
// Only files the collector found are served, never arbitrary paths.
const localMedia = () => ({
  name: 'local-media',
  configureServer(server) {
    server.middlewares.use('/media', (req, res) => {
      const file = new URL(req.url, 'http://x').searchParams.get('path');
      const skills = JSON.parse(readFileSync(path.resolve('public/data/skills.json'), 'utf8')).skills;
      if (!skills.some((s) => s.videos.some((v) => v.path === file))) {
        res.statusCode = 404;
        return res.end();
      }
      const size = statSync(file).size;
      const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
      const start = range?.[1] ? +range[1] : 0;
      const end = range?.[2] ? +range[2] : size - 1;
      res.writeHead(range ? 206 : 200, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
        ...(range && {'content-range': `bytes ${start}-${end}/${size}`}),
      });
      createReadStream(file, {start, end}).pipe(res);
    });
  },
});

export default defineConfig({
  plugins: [react(), localMedia()],
  server: {port: 5180},
  preview: {port: 5180},
});
