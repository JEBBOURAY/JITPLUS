#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sets up `adb reverse` for the backend port so a USB-connected Android device
 * can reach http://localhost:3000 on the host machine.
 * Silently no-ops if adb is missing or no device is connected.
 */
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const BACKEND_PORT = process.env.BACKEND_PORT || '3000';
// Extra ports (e.g. Metro dev server) passed as CLI args or via METRO_PORT env.
// Reversing the Metro port lets a USB device reach the bundler on localhost.
const EXTRA_PORTS = [...process.argv.slice(2), process.env.METRO_PORT]
  .filter(Boolean)
  .map((p) => String(p).trim())
  .filter((p) => /^\d+$/.test(p));

function resolveAdb() {
  // 1. adb on PATH
  try {
    execSync('adb version', { stdio: 'ignore' });
    return 'adb';
  } catch {}
  // 2. ANDROID_HOME / ANDROID_SDK_ROOT
  const sdkEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdkEnv) {
    const p = path.join(sdkEnv, 'platform-tools', os.platform() === 'win32' ? 'adb.exe' : 'adb');
    if (fs.existsSync(p)) return p;
  }
  // 3. Default Windows location
  if (os.platform() === 'win32' && process.env.LOCALAPPDATA) {
    const p = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
    if (fs.existsSync(p)) return p;
  }
  // 4. Default macOS / Linux
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library/Android/sdk/platform-tools/adb'),
    path.join(home, 'Android/Sdk/platform-tools/adb'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

const adb = resolveAdb();
if (!adb) {
  console.log('[adb-reverse] adb not found, skipping.');
  process.exit(0);
}

try {
  const devices = execSync(`"${adb}" devices`).toString();
  const hasDevice = devices.split('\n').slice(1).some((l) => /\tdevice\b/.test(l));
  if (!hasDevice) {
    console.log('[adb-reverse] No USB device connected, skipping.');
    process.exit(0);
  }
  const ports = [BACKEND_PORT, ...EXTRA_PORTS];
  for (const port of ports) {
    execSync(`"${adb}" reverse tcp:${port} tcp:${port}`, { stdio: 'inherit' });
    console.log(`[adb-reverse] tcp:${port} -> localhost:${port} OK`);
  }
} catch (e) {
  console.log('[adb-reverse] Failed (non-fatal):', e.message);
}
