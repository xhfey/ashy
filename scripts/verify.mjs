import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import process from 'process';

const root = process.cwd();

function walkFiles(dir, out = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkFiles(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

function runNode(args, label, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(`\n[verify] Failed: ${label}`);
    if (!options.inherit) {
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    return false;
  }
  return true;
}

function verifySyntax() {
  const srcDir = join(root, 'src');
  if (!existsSync(srcDir)) {
    console.error('[verify] Missing src directory');
    return false;
  }

  const files = walkFiles(srcDir).filter((f) => f.endsWith('.js'));
  let ok = true;

  for (const file of files) {
    const passed = runNode(['--check', file], `parse ${file}`);
    if (!passed) ok = false;
  }

  if (ok) {
    console.log(`[verify] Syntax OK (${files.length} files)`);
  }
  return ok;
}

function verifyCriticalImports() {
  return runNode(['test-import.mjs'], 'critical imports', { inherit: true });
}

function verifyTests() {
  const jestBin = join(root, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!existsSync(jestBin)) {
    console.warn('[verify] Jest not installed, skipping tests');
    return true;
  }

  return runNode(
    ['--experimental-vm-modules', jestBin, '--passWithNoTests'],
    'tests',
    { inherit: true }
  );
}

const syntaxOk = verifySyntax();
const importsOk = verifyCriticalImports();
const testsOk = verifyTests();

if (!syntaxOk || !importsOk || !testsOk) {
  process.exit(1);
}

console.log('[verify] All checks passed');
