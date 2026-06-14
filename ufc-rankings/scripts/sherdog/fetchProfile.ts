// Sherdog network layer — the ONLY file that hits the network.
//
// ⚠️  Run by YOU at build time, never by the app and never by Claude.
//     Sherdog's robots.txt disallows ClaudeBot specifically; a generic,
//     identifiable user-agent falls under "User-agent: *  Allow: /". Set a real
//     contact in SHERDOG_CONTACT so you're reachable. This crawler is polite:
//     it throttles, backs off, and caches every page to disk so re-parsing
//     never re-hits the network. Keep the cache private (gitignored).
import fs from 'fs';
import path from 'path';
import type { FetchResult } from './types';

const CACHE_DIR = path.join(process.cwd(), 'data', '.sherdog_cache');
const BASE = 'https://www.sherdog.com';

const CONFIG = {
  // Identify yourself. Override via env if you like.
  userAgent:
    process.env.SHERDOG_UA ??
    'UFergCRankings-research/1.0 (personal MMA ranking project; ' +
      (process.env.SHERDOG_CONTACT ?? 'set SHERDOG_CONTACT env') + ')',
  minDelayMs: 2500,      // polite gap between requests
  jitterMs: 800,         // randomized extra delay
  maxRetries: 4,
  backoffBaseMs: 4000,   // 4s, 8s, 16s, 32s on 429/5xx
  cacheMaxAgeDays: 30,   // re-fetch profiles older than this
  timeoutMs: 20000,
};

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(): Promise<void> {
  const wait = lastRequestAt + CONFIG.minDelayMs - Date.now();
  const jitter = Math.floor(Math.random() * CONFIG.jitterMs);
  if (wait > 0) await sleep(wait + jitter);
  else if (jitter) await sleep(jitter);
  lastRequestAt = Date.now();
}

function cachePath(key: string): string {
  return path.join(CACHE_DIR, `${key.replace(/[^A-Za-z0-9_-]/g, '_')}.html`);
}

function freshInCache(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const ageMs = Date.now() - fs.statSync(file).mtimeMs;
  return ageMs < CONFIG.cacheMaxAgeDays * 86400_000;
}

// Low-level GET with retry/backoff. Returns HTML or throws after maxRetries.
async function getHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    await throttle();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': CONFIG.userAgent, Accept: 'text/html' },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        const backoff = CONFIG.backoffBaseMs * 2 ** attempt;
        console.warn(`[fetch] ${res.status} on ${url} — backing off ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(t);
      if (attempt === CONFIG.maxRetries) throw err;
      const backoff = CONFIG.backoffBaseMs * 2 ** attempt;
      console.warn(`[fetch] error on ${url} (${String(err)}) — retry in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw new Error(`exhausted retries for ${url}`);
}

export function ensureCacheDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Cache-aware profile fetch. `sherdogId` is the slug-id, e.g. "Islam-Makhachev-76836".
export async function fetchProfile(
  sherdogId: string,
  opts: { force?: boolean } = {}
): Promise<FetchResult> {
  ensureCacheDir();
  const url = `${BASE}/fighter/${sherdogId}`;
  const file = cachePath(sherdogId);

  if (!opts.force && freshInCache(file)) {
    return { sherdogId, url, html: fs.readFileSync(file, 'utf-8'), fromCache: true };
  }
  const html = await getHtml(url);
  fs.writeFileSync(file, html, 'utf-8');
  return { sherdogId, url, html, fromCache: false };
}

// Fetch the fight-finder search results page for a name. Cached per query.
// NOTE: the SEARCH-RESULTS parser (parseSearchResults in resolveCrosswalk.ts)
// needs a saved search-page fixture to finalize — the 4 profile fixtures we
// have don't cover it. This fetch helper itself is structure-agnostic.
export async function fetchSearch(query: string): Promise<string> {
  ensureCacheDir();
  const url = `${BASE}/stats/fightfinder?SearchTxt=${encodeURIComponent(query)}`;
  const file = cachePath(`search__${query}`);
  if (freshInCache(file)) return fs.readFileSync(file, 'utf-8');
  const html = await getHtml(url);
  fs.writeFileSync(file, html, 'utf-8');
  return html;
}

// The UFC organization page — lists recent + upcoming events with dates and
// links to each event card. Slug overridable via env in case Sherdog renumbers.
const UFC_ORG_SLUG =
  process.env.SHERDOG_UFC_ORG_SLUG ?? 'Ultimate-Fighting-Championship-2';

// Fetch the UFC org page (the recent-events index). Weekly job wants this FRESH,
// so callers pass { force: true } to bypass the (profile-oriented) cache window.
export async function fetchOrgEvents(opts: { force?: boolean } = {}): Promise<string> {
  ensureCacheDir();
  const url = `${BASE}/organizations/${UFC_ORG_SLUG}`;
  const file = cachePath('org__ufc');
  if (!opts.force && freshInCache(file)) return fs.readFileSync(file, 'utf-8');
  const html = await getHtml(url);
  fs.writeFileSync(file, html, 'utf-8');
  return html;
}

// Fetch a single event card page by its slug-id, e.g. "UFC-328-..-111957".
// Cached per event (an event's card is immutable once it has happened).
export async function fetchEventPage(
  eventId: string,
  opts: { force?: boolean } = {}
): Promise<FetchResult> {
  ensureCacheDir();
  const url = `${BASE}/events/${eventId}`;
  const file = cachePath(`event__${eventId}`);
  if (!opts.force && freshInCache(file)) {
    return { sherdogId: eventId, url, html: fs.readFileSync(file, 'utf-8'), fromCache: true };
  }
  const html = await getHtml(url);
  fs.writeFileSync(file, html, 'utf-8');
  return { sherdogId: eventId, url, html, fromCache: false };
}
