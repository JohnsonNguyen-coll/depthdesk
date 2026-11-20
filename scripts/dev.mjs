import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'scripts/local-server.mjs', '--api-only'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' })
];
function stop(code) {
  for (const child of processes) child.kill();
  process.exitCode = code ?? 0;
}
for (const child of processes) child.on('exit', stop);
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
