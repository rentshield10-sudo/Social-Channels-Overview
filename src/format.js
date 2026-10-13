export const PLATFORMS = {
  tiktok: {label: 'TikTok', color: '#ff2d55'},
  instagram: {label: 'Instagram', color: '#d62976'},
  facebook: {label: 'Facebook', color: '#1877f2'},
  youtube: {label: 'YouTube', color: '#ff0000'},
  threads: {label: 'Threads', color: '#c9ced8'},
  x: {label: 'X', color: '#a3acbd'},
};

export const n = (v) => (v == null ? '—' : Intl.NumberFormat('en-US', {notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1}).format(v));

export const ago = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export const date = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}) : '—');
