// Sherdog profile HTML → structured SherdogProfile.
//
// ISOLATION: this is the ONE file that knows Sherdog's HTML shape. If Sherdog
// changes its markup, only this file (and its fixtures) change. Built and
// verified against scripts/sherdog/fixtures/*.html.
import * as cheerio from 'cheerio';
import type { SherdogProfile, SherdogFight } from './types';

type Cheerio = ReturnType<typeof cheerio.load>;

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// "Apr / 18 / 2026" or "Sep 9, 1993" → "2026-04-18" / "1993-09-09".
function toISODate(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\//g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const m = cleaned.match(/^([A-Za-z]{3,})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
}

function idFromHref(href: string | undefined, segment: string): string | null {
  if (!href) return null;
  const m = href.match(new RegExp(`/${segment}/([^/?#]+)`));
  return m ? m[1] : null;
}

function num(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function profileUrlAndId($: Cheerio): { url: string; sherdogId: string } {
  // Prefer the JSON-LD WebPage block (has the canonical fighter URL).
  let url = '';
  $('script[type="application/ld+json"]').each((_, el) => {
    if (url) return;
    const txt = $(el).html() ?? '';
    if (!txt.includes('/fighter/')) return;
    try {
      const data = JSON.parse(txt);
      if (typeof data?.url === 'string' && data.url.includes('/fighter/')) url = data.url;
    } catch {
      /* fall through to regex below */
    }
  });
  // Fallback: scan the raw document for the first fighter URL in any ld+json.
  if (!url) {
    const m = $.html().match(/"url":"([^"]*\\?\/fighter\\?\/[^"]+)"/);
    if (m) url = m[1].replace(/\\\//g, '/');
  }
  const sherdogId = idFromHref(url, 'fighter') ?? '';
  return { url, sherdogId };
}

// Locate the PRO fight-history table. A profile can carry both PRO and AMATEUR
// modules; we take only the one whose slanted_title says "PRO".
function proTable($: Cheerio): ReturnType<Cheerio> | null {
  let table: ReturnType<Cheerio> | null = null;
  $('.module.fight_history').each((_, mod) => {
    if (table) return;
    const title = $(mod).find('.slanted_title').text().toUpperCase();
    if (title.includes('AMATEUR')) return; // skip amateur record
    if (title.includes('PRO') || title.includes('FIGHT HISTORY')) {
      const t = $(mod).find('table.new_table.fighter').first();
      if (t.length) table = t;
    }
  });
  // Fallback: first fighter table on the page.
  if (!table) {
    const t = $('table.new_table.fighter').first();
    if (t.length) table = t;
  }
  return table;
}

function parseFights($: Cheerio): SherdogFight[] {
  const table = proTable($);
  if (!table) return [];
  const fights: SherdogFight[] = [];

  table.find('tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('table_head')) return;

    const resultEl = $tr.find('.final_result').first();
    if (!resultEl.length) return; // header / upcoming / non-result row

    const rawResult = resultEl.text().trim().toLowerCase();
    const result: SherdogFight['result'] =
      rawResult === 'win' || rawResult === 'loss' || rawResult === 'draw'
        ? rawResult
        : 'nc';

    const tds = $tr.find('td');
    const oppA = $(tds.get(1)).find('a[href*="/fighter/"]').first();
    const opponentName = (oppA.text() || $(tds.get(1)).text()).trim();
    const opponentId = idFromHref(oppA.attr('href'), 'fighter');

    const eventTd = $(tds.get(2));
    const eventA = eventTd.find('a[href*="/events/"]').first();
    const eventName = (eventTd.find('[itemprop="award"]').text() || eventA.text()).trim();
    const eventId = idFromHref(eventA.attr('href'), 'events');
    const date = toISODate(eventTd.find('.sub_line').first().text());

    const winby = $(tds.get(3));
    const method = winby.find('b').first().text().trim();
    const referee = winby.find('.sub_line a').first().text().trim() || null;

    const round = num($(tds.get(4)).text());
    const time = $(tds.get(5)).text().trim() || null;

    fights.push({
      result, opponentName, opponentId, eventName, eventId, date,
      method, referee, round, time,
    });
  });

  return fights;
}

export function parseProfile(html: string): SherdogProfile {
  const $ = cheerio.load(html);
  const { url, sherdogId } = profileUrlAndId($);
  const numericId = (sherdogId.match(/-(\d+)$/)?.[1]) ?? '';

  const name = $('h1 span.fn').first().text().trim();
  const nickname = $('.fighter-line2 .nickname em').first().text().trim() || null;
  const nationality = $('[itemprop="nationality"]').first().text().trim() || null;
  const birthDate = toISODate($('[itemprop="birthDate"]').first().text());

  // Height/weight: the cm/lbs live in the same <td> after the itemprop value.
  const heightTd = $('[itemprop="height"]').first().closest('td').text();
  const heightCm = (() => {
    const m = heightTd.match(/([\d.]+)\s*cm/);
    return m ? Math.round(parseFloat(m[1])) : null;
  })();
  const weightLbs = num($('[itemprop="weight"]').first().text());

  const weightClass =
    $('a[href*="weightclass="]').first().text().trim() || null;
  const association =
    $('.association-class [itemprop="name"]').first().text().trim() ||
    $('[itemprop="memberOf"] [itemprop="name"]').first().text().trim() ||
    null;

  return {
    sherdogId, numericId, url, name, nickname, nationality, birthDate,
    heightCm, weightLbs, weightClass, association,
    fights: parseFights($),
  };
}
