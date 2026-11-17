// Builds braincamp.app: the landing page (site/) at the root and the game (Vite) under /play/.
//   npm run build:site   →   dist-site/
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const out = 'dist-site';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
execSync(`npx tsc -b && npx vite build --outDir ${out}/play --emptyOutDir`, { stdio: 'inherit' });
cpSync('site', out, { recursive: true });
console.log(`Built ${out}/ (landing at /, game at /play/)`);
