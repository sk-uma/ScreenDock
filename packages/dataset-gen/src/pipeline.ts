import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PKG_ROOT = resolve(fileURLToPath(import.meta.url), '../..');

function run(script: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const p = spawn('node', ['--import', 'tsx/esm', `src/${script}.ts`], {
      cwd: PKG_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    p.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}

await run('generate');
await run('capture');
