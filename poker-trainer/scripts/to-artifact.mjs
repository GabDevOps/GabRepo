// Turns the single-file Vite build into a claude.ai Artifact page: the Artifact host supplies
// <!doctype>/<html>/<head>/<body>, so we emit only title, metas, font link, styles, root and script.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const grab = (re) => [...html.matchAll(re)].map((m) => m[0]);
const title = grab(/<title>[\s\S]*?<\/title>/g);
const metas = grab(/<meta name="claude:[^>]*>/g);
const links = grab(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g);
const styles = grab(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = grab(/<script type="module"[^>]*>[\s\S]*?<\/script>/g);
if (!title.length || !scripts.length) throw new Error('Unexpected build output');
const out = [...title, ...metas, ...links, ...styles, '<div id="root"></div>', ...scripts].join('\n');
writeFileSync('dist/poker-trainer.html', out + '\n');
console.log(`dist/poker-trainer.html: ${(out.length / 1024).toFixed(0)} KB`);
