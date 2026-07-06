// ufcstats.com network layer — PoW-aware, replaces the (now Cloudflare-blocked)
// Sherdog crawl as the weekly recency source. ufcstats gates content behind a
// TRANSPARENT SHA-256 proof-of-work ("Checking your browser…"): the page hands
// you a nonce + a target (N leading hex zeros); you find the n where
// sha256(`${nonce}:${n}`) starts with the zeros, POST it to /__c for a clearance
// cookie, then the real page loads. This ports that published challenge to Node.
//
// Polite + principled: ufcstats serves NO robots.txt (nothing disallowed), the
// PoW is the intended access mechanism (any browser solves it in <1ms), and this
// keeps the honest identifying UA + heavy rate-limiting + on-disk caching.
//
// ⚠️  Run by YOU or CI at build time — never by the app, never by Claude. Use the
//     CLI to save fixtures for offline parser work:
//       jiti scripts/ufcstats/fetchUfcStats.ts <url> <outfile>
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const BASE = 'http://ufcstats.com';
const CACHE_DIR = path.join(process.cwd(), 'data', '.ufcstats_cache');
const UA =
  process.env.UFCSTATS_UA ??
  `FergRank-research/1.0 (personal MMA ranking project; ${process.env.SHERDOG_CONTACT ?? 'set SHERDOG_CONTACT env'})`;
const MIN_DELAY_MS = 2000; // polite gap between requests
const TIMEOUT_MS = 20000;
const MAX_POW_ZEROS = 6;   // sanity cap — real difficulty is ~2; more = parse error

// Process-lifetime cookie jar. The challenge may set a pre-cookie on the GET and
// the clearance cookie on the /__c POST — we accumulate both and resend all.
const cookieJar: Record<string, string> = {};
function cookieHeader(): string {
  return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorbCookies(res: Response): void {
  const set = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of set) {
    const nv = c.split(';')[0];
    const i = nv.indexOf('=');
    if (i > 0) cookieJar[nv.slice(0, i).trim()] = nv.slice(i + 1).trim();
  }
}

let lastRequestAt = 0;
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
async function throttle(): Promise<void> {
  const wait = lastRequestAt + MIN_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// The interstitial (not the real page) if it's telling us to run JS / has the
// /__c proof-of-work script.
function isChallenge(html: string): boolean {
  return /Checking your browser/i.test(html) || (/\/__c/.test(html) && /var nonce=/.test(html));
}

// Find the smallest n whose sha256("<nonce>:<n>") hex starts with `zeros` zeros.
function solvePow(nonce: string, zeros: number): number {
  const target = '0'.repeat(zeros);
  for (let n = 0; ; n++) {
    const h = crypto.createHash('sha256').update(`${nonce}:${n}`).digest('hex');
    if (h.startsWith(target)) return n;
  }
}

async function rawGet(url: string): Promise<{ res: Response; html: string }> {
  await throttle();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', ...(cookieHeader() ? { Cookie: cookieHeader() } : {}) },
      signal: controller.signal,
      redirect: 'follow',
    });
    absorbCookies(res);
    return { res, html: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

// Parse the challenge page, solve the PoW, POST it to /__c to earn the clearance
// cookie (captured into the jar).
async function clearChallenge(challengeHtml: string): Promise<void> {
  const nonce = challengeHtml.match(/var nonce="([^"]+)"/)?.[1];
  const zeros = parseInt(challengeHtml.match(/new Array\((\d+)\s*\+\s*1\)/)?.[1] ?? '', 10);
  if (!nonce || !Number.isFinite(zeros)) throw new Error('ufcstats challenge: could not parse nonce/target');
  if (zeros > MAX_POW_ZEROS) throw new Error(`ufcstats challenge: implausible difficulty (${zeros} zeros) — parser likely stale`);
  const n = solvePow(nonce, zeros);

  await throttle();
  const res = await fetch(`${BASE}/__c`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
    },
    body: `nonce=${encodeURIComponent(nonce)}&n=${n}`,
    redirect: 'follow',
  });
  absorbCookies(res);
  if (!(res.status >= 200 && res.status < 300)) throw new Error(`ufcstats /__c rejected the proof (HTTP ${res.status})`);
}

// Cache-aware GET that transparently clears the PoW gate. Returns real page HTML.
export async function getPage(url: string, opts: { force?: boolean; cacheKey?: string } = {}): Promise<string> {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const key = (opts.cacheKey ?? url).replace(/[^A-Za-z0-9_-]/g, '_');
  const file = path.join(CACHE_DIR, `${key}.html`);
  if (!opts.force && fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
  // Offline guard (tests): never hit the network on a cache miss — throw instead.
  if (process.env.UFCSTATS_OFFLINE) throw new Error(`[ufcstats offline] not cached: ${url}`);

  let { res, html } = await rawGet(url);
  if (isChallenge(html)) {
    await clearChallenge(html);
    ({ res, html } = await rawGet(url)); // retry now that we hold the cookie
    if (isChallenge(html)) throw new Error(`ufcstats: still gated after solving PoW for ${url}`);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  fs.writeFileSync(file, html, 'utf-8');
  return html;
}

export const UFCSTATS_BASE = BASE;

// ── CLI: fetch a URL through the gate and save it (for building fixtures) ──────
if (process.argv[1] && /fetchUfcStats\.ts$/.test(process.argv[1])) {
  const [, , url, out] = process.argv;
  if (!url || !out) {
    console.error('usage: jiti scripts/ufcstats/fetchUfcStats.ts <url> <outfile>');
    process.exit(1);
  }
  getPage(url, { force: true })
    .then((html) => { fs.writeFileSync(out, html); console.log(`saved ${html.length} bytes → ${out}`); })
    .catch((e) => { console.error(e); process.exit(1); });
}
