import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { relative, extname, join } from 'node:path';
import { build } from 'esbuild';

const directory = 'dist/client';
const assets = {};
for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
  if (!file.isFile()) continue;
  const path = join(file.parentPath, file.name);
  const url = '/' + relative(directory, path).replaceAll('\\', '/');
  assets[url] = [extname(path).slice(1), (await readFile(path)).toString('base64')];
}
if (!assets['/index.html']) throw new Error('Vite output is missing index.html');
assets['/licenses/react-bits.txt'] = ['txt', (await readFile('frontend/src/vendor/react-bits/LICENSE.md')).toString('base64')];

await mkdir('dist/server', { recursive: true });
await cp('backend/drizzle', 'dist/.openai/drizzle', { recursive: true });
await build({
  entryPoints: ['backend/server/worker.js'], bundle: true, format: 'esm', target: 'es2022',
  outfile: 'dist/server/index.js', legalComments: 'inline',
  plugins: [{
    name: 'static-assets',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/built-assets\.js$/ }, request => ({ path: request.path, namespace: 'site-assets' }));
      builder.onLoad({ filter: /.*/, namespace: 'site-assets' }, () => ({ contents: 'export const assets = ' + JSON.stringify(assets) }));
    }
  }]
});
