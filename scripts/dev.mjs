import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const processes = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'backend/scripts/start.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))], { cwd: new URL('../frontend/', import.meta.url), stdio: 'inherit' })
];
function stop(code) {
  for (const child of processes) child.kill();
  process.exitCode = code ?? 0;
}
for (const child of processes) child.on('exit', stop);
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
