#!/usr/bin/env node
/**
 * Cross-platform Gradle wrapper runner.
 * Works seamlessly on Windows (cmd, PowerShell), macOS, and Linux.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const cmd = isWin ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2);
const androidDir = path.join(__dirname, '..', 'android');

const result = spawnSync(cmd, args, {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status ?? 0);
