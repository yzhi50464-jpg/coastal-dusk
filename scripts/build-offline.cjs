'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const inlineScript = (source) =>
  '<script>\n' + source.replace(/<\/script/gi, '<\\/script') + '\n</script>';

let html = read('index.html');
function replaceTag(tag, replacement) {
  if (html.split(tag).length !== 2) {
    throw new Error('Expected exactly one entry tag: ' + tag);
  }
  html = html.replace(tag, () => replacement);
}

replaceTag(
  '<link rel="stylesheet" href="style.css">',
  '<style>\n' + read('style.css') + '\n</style>',
);

const three = 'vendor/three.min.js';
const modules = [
  three, 'quality.js', 'assets.js', 'nature-assets.js', 'coast-assets.js',
  'ocean.js', 'terrain.js', 'post.js', 'softgoods.js', 'interior.js', 'scene.js',
];

for (const file of modules) {
  const license = file === three
    ? '<!-- Three.js 0.160.1 · MIT License\n' + read('vendor/LICENSE') + '\n-->\n'
    : '';
  replaceTag('<script src="' + file + '"></script>', license + inlineScript(read(file)));
}
replaceTag('href="./index.html"', 'href="#"');

const output = path.join(root, 'offline', '暮岸.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, html, 'utf8');
console.log('Built offline/暮岸.html (' + Buffer.byteLength(html) + ' bytes)');
