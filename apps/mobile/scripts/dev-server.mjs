// Dev server for Wakey Dev, reachable from the phone over Tailscale, that restarts itself.
//
//   npm run dev:remote            (from apps/mobile; Ctrl+C to stop)
//
// - Serves Metro on port 19082 (8081 is left free for other apps).
// - Points Tailscale Serve at it, so the phone connects to https://<this-pc>.<tailnet>.ts.net
// - If Metro exits for any reason, it is started again (with backoff if it keeps failing).
// - If a dev server is already running on the port, waits and takes over when it stops.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const PORT = 19082;
const MOBILE_DIR = new URL('..', import.meta.url);

const log = (msg) => console.log(`[dev-server ${new Date().toLocaleTimeString()}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tailscaleCli() {
  const win = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  return process.platform === 'win32' && existsSync(win) ? win : 'tailscale';
}

/** https://<this-machine>.<tailnet>.ts.net, after making sure Tailscale Serve forwards to Metro. */
function setUpTailscale() {
  if (process.env.EXPO_PACKAGER_PROXY_URL) return process.env.EXPO_PACKAGER_PROXY_URL;
  const cli = tailscaleCli();
  try {
    const status = JSON.parse(execFileSync(cli, ['status', '--json'], { encoding: 'utf8' }));
    const host = String(status.Self?.DNSName ?? '').replace(/\.$/, '');
    if (!host) throw new Error('Tailscale has no DNS name for this machine');
    execFileSync(cli, ['serve', '--bg', String(PORT)], { stdio: 'ignore' });
    return `https://${host}`;
  } catch (e) {
    log(`Tailscale not available (${e.message}); the phone will need to be on the same Wi-Fi.`);
    return undefined;
  }
}

async function metroRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/status`, { signal: AbortSignal.timeout(2000) });
    return (await res.text()).includes('packager-status:running');
  } catch {
    return false;
  }
}

let child = null;
let stopping = false;

function startMetro(proxyUrl) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (proxyUrl) env.EXPO_PACKAGER_PROXY_URL = proxyUrl;
    child = spawn('npx', ['expo', 'start', '--dev-client', '--scheme', 'wakeywakey-dev', '--port', String(PORT)], {
      cwd: MOBILE_DIR,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code, signal) => {
      child = null;
      resolve(signal ?? code);
    });
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopping = true;
    if (child) child.kill();
    else process.exit(0);
  });
}

const proxyUrl = setUpTailscale();
log(proxyUrl ? `Phone URL: ${proxyUrl}` : `Phone URL: http://<this-pc-ip>:${PORT}`);

let failures = 0;
while (!stopping) {
  if (await metroRunning()) {
    log(`A dev server is already running on port ${PORT}; waiting for it to stop.`);
    while (!stopping && (await metroRunning())) await sleep(30_000);
    continue;
  }
  const startedAt = Date.now();
  log('Starting Metro');
  const result = await startMetro(proxyUrl);
  if (stopping) break;
  // A run that lasted a while was a real session, not a startup failure.
  failures = Date.now() - startedAt > 60_000 ? 0 : failures + 1;
  const wait = Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5));
  log(`Metro exited (${result}); restarting in ${Math.round(wait / 1000)}s`);
  await sleep(wait);
}
log('Stopped');
