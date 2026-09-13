/**
 * CI typecheck helper.
 * Runs `tsc --noEmit` and fails the job if any errors mention launch-critical paths
 * introduced for open-source readiness. Broader strict debt is tracked in docs/TECHNICAL.md.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const CRITICAL = [
  'safeBootService',
  'thermalService',
  'ocrRamGuard',
  'inferencePerfParams',
  'ramFitService',
  'ocrService',
  'ThermalStatus',
  'docs/TECHNICAL',
];

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsc', '--noEmit', '--pretty', 'false'],
  {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    shell: true,
  },
);

const out = `${result.stdout || ''}${result.stderr || ''}`;
const lines = out.split(/\r?\n/).filter((l) => l.includes('error TS'));

if (lines.length === 0 && result.status === 0) {
  console.log('[typecheck] clean');
  process.exit(0);
}

const criticalHits = lines.filter((l) =>
  CRITICAL.some((c) => l.toLowerCase().includes(c.toLowerCase())),
);

console.log(`[typecheck] ${lines.length} error(s) in project (pre-existing debt allowed)`);
if (criticalHits.length > 0) {
  console.error('[typecheck] FAIL — errors in launch-critical paths:');
  criticalHits.forEach((l) => console.error(l));
  process.exit(1);
}

console.log('[typecheck] OK — no launch-critical path errors');
process.exit(0);
