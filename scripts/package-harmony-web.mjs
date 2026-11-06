import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./package-harmony-release.py', import.meta.url));
const command = process.platform === 'win32' ? 'py' : 'python3';
const args = [...(process.platform === 'win32' ? ['-3'] : []), script, ...process.argv.slice(2)];
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
