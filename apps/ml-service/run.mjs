// Cross-platform launcher for the Python ML service.
//   node run.mjs setup  -> creates .venv and installs requirements.txt
//   node run.mjs dev    -> starts the service with auto-reload on http://localhost:$ML_PORT (default 8000)
//   node run.mjs test   -> runs pytest
// Uses .venv when it exists, otherwise the system Python. Reads KEY=VALUE lines from .env.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const win = process.platform === 'win32';
const venvPython = path.join(here, '.venv', win ? 'Scripts' : 'bin', win ? 'python.exe' : 'python');
const systemPython = win ? 'python' : 'python3';

const env = { ...process.env };
const envFile = path.join(here, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2];
  }
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: here, env, stdio: 'inherit' });
  if (res.error) {
    console.error(`Could not run ${cmd}: ${res.error.message}. Is Python 3.10+ installed and on PATH?`);
    process.exit(1);
  }
  if (res.status) process.exit(res.status);
}

const python = existsSync(venvPython) ? venvPython : systemPython;
switch (process.argv[2]) {
  case 'setup':
    if (!existsSync(venvPython)) run(systemPython, ['-m', 'venv', '.venv']);
    run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt']);
    break;
  case 'dev':
    run(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', env.ML_PORT || '8000', '--reload']);
    break;
  case 'test':
    run(python, ['-m', 'pytest', '-q']);
    break;
  default:
    console.log('Usage: node run.mjs <setup|dev|test>');
    process.exit(1);
}
