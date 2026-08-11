import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(directory, 'ZA-Table-Prototype.html');
const sourcePath = path.join(directory, 'ZA-Table-Prototype.source.html');
const templatePattern = /(<script type="__bundler\/template">\s*)([\s\S]*?)(\s*<\/script>)/;

function readBundle() {
  return fs.readFileSync(bundlePath, 'utf8');
}

function extract() {
  const bundle = readBundle();
  const match = bundle.match(templatePattern);

  if (!match) throw new Error('Bundled prototype template was not found.');

  fs.writeFileSync(sourcePath, JSON.parse(match[2]));
  console.log(`Extracted ${path.basename(sourcePath)}`);
}

function build() {
  const bundle = readBundle();
  const source = fs.readFileSync(sourcePath, 'utf8');
  const encodedSource = JSON.stringify(source).replace(/<\//g, '<\\u002F');

  if (!templatePattern.test(bundle)) {
    throw new Error('Bundled prototype template was not found.');
  }

  const nextBundle = bundle.replace(
    templatePattern,
    (_, opening, __, closing) => `${opening}${encodedSource}${closing}`,
  );

  fs.writeFileSync(bundlePath, nextBundle);
  console.log(`Built ${path.basename(bundlePath)}`);
}

function verify() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const bundle = readBundle();
  const match = bundle.match(templatePattern);

  if (!match) throw new Error('Bundled prototype template was not found.');
  if (JSON.parse(match[2]) !== source) {
    throw new Error('Readable source and bundled prototype are out of sync.');
  }
  if (match[2].includes('</')) {
    throw new Error('Bundled template contains an unsafe raw closing tag.');
  }

  const islands = {};
  for (const name of ['manifest', 'ext_resources', 'page_order', 'template']) {
    const island = bundle.match(new RegExp(`<script type="__bundler/${name}">\\s*([\\s\\S]*?)\\s*<\\/script>`));
    if (!island) throw new Error(`Missing ${name} JSON island.`);
    islands[name] = JSON.parse(island[1]);
  }

  const component = source.match(/<script type="text\/x-dc"[\s\S]*?>([\s\S]*?)<\/script>/);
  if (!component) throw new Error('Component script was not found in readable source.');
  new Function(component[1]);

  const manifestText = JSON.stringify(islands.manifest);
  const referencedAssets = new Set(source.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []);
  for (const assetId of referencedAssets) {
    if (!manifestText.includes(assetId)) throw new Error(`Referenced asset ${assetId} is missing from the manifest.`);
  }

  console.log(`Bundle verified: source match, 4 JSON islands, valid component syntax, ${referencedAssets.size} mapped assets.`);
}

const command = process.argv[2];

if (command === 'extract') extract();
else if (command === 'build') build();
else if (command === 'verify') verify();
else {
  throw new Error('Usage: node prototype-bundle.mjs <extract|build|verify>');
}
