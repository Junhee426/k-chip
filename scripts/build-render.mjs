/** Dependency-free static build and reproducible source ZIP for Render. */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'build');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const modules = ['fault-lab.js', 'data.js', 'model.js', 'lab-view.js', 'app.js'];
const publicNames = ['index.html', 'styles.css', ...modules];
const sourceName = `kleo-chip-v${pkg.version}-source.zip`;
const read = name => readFileSync(join(root, name), 'utf8');

function checkJS(source, label) {
  const checked = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: source, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (checked.error || checked.status !== 0) {
    throw new Error(`${label}: ${checked.error?.message || checked.stderr}`);
  }
}

// Check module and generated standalone entrypoints before publishing.
for (const name of modules) {
  const source = read(`dist/${name}`);
  checkJS(source, name);
  for (const match of source.matchAll(/^import .*?from ['"]\.\/([^'"]+)['"];?$/gm)) {
    if (!modules.includes(match[1])) throw new Error(`Missing module: ${match[1]}`);
  }
}
const html = read('dist/index.html');
for (const match of html.matchAll(/(?:src|href)=["']\.\/([^"']+)["']/g)) {
  if (!publicNames.includes(match[1])) throw new Error(`Missing public asset: ${match[1]}`);
}
const sourceLink = `<a href="./${sourceName}" download>소스 코드 다운로드</a>`;
if (!read('dist/app.js').includes(sourceLink)) throw new Error('Source download link/version mismatch');
let script = modules.map(name => read(`dist/${name}`)
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/^export (?=(?:const|function|class)\b)/gm, '')).join('\n');
script = script.replace(sourceLink, `V${pkg.version} · 독립 실행본`);
checkJS(script, 'standalone');
const standalone = html
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>${read('dist/styles.css')}</style>`)
  .replace('<script type="module" src="./app.js"></script>',
    () => `<script type="module">\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`);

// Explicit inclusion excludes accounts, Git, credentials and stale archives.
const sourceFiles = [
  'README.md', 'PROJECT.md', 'RENDER_DEPLOYMENT.md', 'RENDER_RELEASE.md',
  'SCENARIO_SCHEMA.md', 'SERVICE_EXPANSION_REVIEW.md',
  'package.json', 'render.yaml', '.node-version', '.gitignore', 'start.py',
  'scripts/build-render.mjs', 'scripts/package-source.py',
  ...publicNames.map(name => `dist/${name}`),
  ...readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.mjs'))
    .sort().map(name => `tests/${name}`),
];
const prefix = `kleo-chip-v${pkg.version}/`;
const entries = sourceFiles.map(name => ({ name: prefix + name, data: readFileSync(join(root, name)) }));
entries.push({ name: prefix + 'dist/kleo-chip-standalone.html', data: Buffer.from(standalone) });

// UTF-8 ZIP, raw DEFLATE, fixed timestamps and CRC-32; no external packages.
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const { name, data } of files) {
    const filename = Buffer.from(name);
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(33, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(8, 10);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    local.push(header, filename, compressed);
    central.push(record, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const archive = zip(entries);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const name of publicNames) writeFileSync(join(output, name), readFileSync(join(root, 'dist', name)));
writeFileSync(join(output, 'kleo-chip-standalone.html'), standalone);
writeFileSync(join(output, sourceName), archive);
console.log(`Render static build: ${output}`);
console.log(`Source ZIP: ${sourceName} (${archive.length.toLocaleString()} bytes, ${entries.length} files)`);
