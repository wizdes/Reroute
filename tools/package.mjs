// Package the extension into dist/reroute-v<version>.zip for the Chrome Web Store.
// Only the runtime files are included (no tests, tooling, node_modules, docs).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, cpSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

const dist = join(root, 'dist');
const stage = join(dist, 'reroute');
rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const f of ['manifest.json', 'background.js', 'src', 'ui', 'icons']) {
  cpSync(join(root, f), join(stage, f), { recursive: true });
}

// Zip the CONTENTS of the stage dir so manifest.json sits at the zip root.
const zipName = `reroute-v${version}.zip`;
execFileSync('zip', ['-r', '-q', join('..', zipName), '.'], { cwd: stage });
console.log(`packaged dist/${zipName}`);
