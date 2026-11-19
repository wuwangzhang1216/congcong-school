import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../apps/harmony/', import.meta.url));
const executable = process.env.HVIGORW || (process.platform === 'win32' ? 'hvigorw.bat' : 'hvigorw');
const probe = spawnSync(executable, ['--version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  console.error('SDK build NOT RUN: install the official HarmonyOS API 23 SDK/DevEco tools and put hvigorw on PATH, or set HVIGORW to its executable. Node tests are not an SDK build.');
  process.exitCode = 78;
} else if (!existsSync(path.join(root, 'entry/src/main/resources/rawfile/site/harmony-build.json'))) {
  console.error('SDK build NOT RUN: first run harmony:prepare-web with the matching verified release resources.');
  process.exitCode = 78;
} else {
  const result = spawnSync(executable, ['--mode','module','-p','product=default','-p','module=entry@default','-p','buildMode=debug','assembleHap','--no-daemon'], { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
