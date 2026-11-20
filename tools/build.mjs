#!/usr/bin/env node
/* Bundle the playroom into single files (no dependencies).
 *
 *   node tools/build.mjs
 *
 * Reads index.html and inlines every local stylesheet and script, writing:
 *   dist/pocket-playroom.html  a complete page you can open or host anywhere
 *   dist/artifact.html         the same page as a head-less fragment
 *                              (title + styles + body) for hosts that wrap
 *                              the page in their own <html> skeleton
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const html = read('index.html');
const isRemote = (u) => /^(https?:)?\/\//.test(u);

const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'Pocket Playroom'])[1].trim();
const head = (html.match(/<head>([\s\S]*?)<\/head>/) || [, ''])[1];
let body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/) || [, ''])[1];

// --- styles: keep remote <link>s, inline local ones in document order
const remoteLinks = [];
const css = [];
for (const m of head.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)) {
  const href = (m[0].match(/href=["']([^"']+)["']/) || [])[1];
  if (!href) continue;
  if (isRemote(href)) remoteLinks.push(m[0]);
  else css.push(`/* ${href} */\n${read(href).trim()}`);
}

// --- scripts: inline local ones in place
const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
let scriptCount = 0;
body = body.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/g, (all, a, src) => {
  if (isRemote(src)) return all;
  scriptCount++;
  return `<script>/* ${src} */\n${safeScript(read(src).trim())}\n</script>`;
});
body = body.replace(/<!--[\s\S]*?-->\n?/g, '').trim();

const metas = [...head.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]);
const fragmentMetas = metas.filter((m) => /name=["']claude:/.test(m));
const style = `<style>\n${css.join('\n\n')}\n</style>`;

const fragment = [
  `<title>${title}</title>`,
  ...fragmentMetas,
  ...remoteLinks,
  style,
  body,
  '',
].join('\n');

const standalone = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  ...metas,
  `<title>${title}</title>`,
  ...remoteLinks,
  style,
  '</head>',
  '<body>',
  body,
  '</body>',
  '</html>',
  '',
].join('\n');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'artifact.html'), fragment);
writeFileSync(join(root, 'dist', 'pocket-playroom.html'), standalone);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`built ${css.length} stylesheets + ${scriptCount} scripts`);
console.log(`  dist/pocket-playroom.html  ${kb(standalone)}`);
console.log(`  dist/artifact.html         ${kb(fragment)}`);
