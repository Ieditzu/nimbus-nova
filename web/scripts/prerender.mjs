import { readFile, writeFile } from 'node:fs/promises';
import { render, siteUrl } from '../.prerender/prerender.js';

let html = await readFile('dist/index.html', 'utf8');
html = html.replace('<div id="root"><!--app-html--></div>', `<div id="root" data-prerendered="true">${render()}</div>`);
if (siteUrl) {
  const url = new URL(siteUrl).origin;
  html = html.replace('</head>', `<link rel="canonical" href="${url}/" /><meta property="og:url" content="${url}/" /><meta property="og:image" content="${url}/social.svg" /></head>`);
  await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url}/</loc></url><url><loc>${url}/explore</loc></url></urlset>`);
  const robots = await readFile('dist/robots.txt', 'utf8');
  await writeFile('dist/robots.txt', robots + `\nSitemap: ${url}/sitemap.xml\n`);
}
await writeFile('dist/index.html', html);
console.log('Landing page prerendered. ' + (siteUrl ? 'Production metadata added.' : 'Set VITE_SITE_URL when a public domain is configured.'));
