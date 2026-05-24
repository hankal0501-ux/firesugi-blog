// =============================================================
// Fire-Sugi 이벤트 자동 수집기 (GitHub Actions)
// - 매일 1회 cron 실행
// - travel(여행 특가) + giveaways(공모전·응모) 각 5건 수집
// - events/events.json 에 누적 (URL 중복 제거, 카테고리별 최대 30건, 30일 보관)
// =============================================================
import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const TOPICS = [
  {
    key: 'travel',
    query: '"여행 특가" OR "항공권 특가" OR "호텔 할인" OR "해외여행 프로모션" OR "패키지 여행 할인"',
    kindLabel: '🎁 여행 특가'
  },
  {
    key: 'giveaways',
    query: '"공모전 모집" OR "콘테스트 응모" OR "무료 이벤트 응모" OR "경품 추첨 이벤트"',
    kindLabel: '🏆 공모·응모'
  }
];

const GNEWS_BASE = 'https://news.google.com/rss/search';
const HL = 'ko';
const GL = 'KR';
const CEID = 'KR:ko';
const MAX_PER_CATEGORY = 30;
const KEEP_DAYS = 30;
const FETCH_LIMIT = 5; // 매 실행마다 카테고리별 신규 후보 5개에서 비중복 선별

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function fetchTopic(topic) {
  const url = `${GNEWS_BASE}?q=${encodeURIComponent(topic.query)}&hl=${HL}&gl=${GL}&ceid=${CEID}`;
  console.log(`📡 [${topic.key}] 수집 중...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FireSugiEventsBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml'
    }
  });
  if (!res.ok) {
    console.warn(`  ⚠️  HTTP ${res.status}`);
    return [];
  }
  const xml = await res.text();
  const data = parser.parse(xml);
  let items = data?.rss?.channel?.item || [];
  if (!Array.isArray(items)) items = [items];
  items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return items.slice(0, FETCH_LIMIT).map(it => normalize(it, topic));
}

function normalize(item, topic) {
  const rawTitle = String(item.title || '').trim();
  const m = rawTitle.match(/^(.+?)\s+-\s+([^-]+)$/);
  const title = m ? m[1].trim() : rawTitle;
  const source = m ? m[2].trim() : (item.source?.['#text'] || item.source || '뉴스');

  let link = '';
  if (typeof item.link === 'string') link = item.link;
  else if (item.link?.['#text']) link = item.link['#text'];

  const pubDate = new Date(item.pubDate || Date.now());
  const dateStr = `${pubDate.getFullYear()}-${pad(pubDate.getMonth() + 1)}-${pad(pubDate.getDate())} ${pad(pubDate.getHours())}:${pad(pubDate.getMinutes())}:${pad(pubDate.getSeconds())}`;

  if (topic.key === 'travel') {
    return {
      kind: topic.kindLabel,
      title,
      detail: source,
      url: link,
      site: 'gnews_' + source,
      created_at: dateStr
    };
  } else {
    return {
      source_site: source,
      title,
      category: '공모전',
      prize: null,
      period: null,
      url: link,
      created_at: dateStr
    };
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

function pruneOld(list) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  return list.filter(it => {
    const ts = new Date(it.created_at).getTime();
    return !isNaN(ts) && ts >= cutoff;
  });
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🎁 Fire-Sugi 이벤트 자동 수집 시작');
  console.log('═══════════════════════════════════════════\n');

  // 기존 events.json 로드
  let existing = { travel: [], giveaways: [] };
  try {
    existing = JSON.parse(await fs.readFile('events/events.json', 'utf8'));
    console.log(`📂 기존: travel ${existing.travel?.length || 0}건, giveaways ${existing.giveaways?.length || 0}건\n`);
  } catch {
    console.log('📂 events.json 없음 - 새로 생성\n');
  }
  existing.travel = existing.travel || [];
  existing.giveaways = existing.giveaways || [];

  const newItemsByCategory = { travel: [], giveaways: [] };
  let totalNew = 0;
  for (const topic of TOPICS) {
    try {
      const candidates = await fetchTopic(topic);
      const seenUrls = new Set(existing[topic.key].map(x => x.url).filter(Boolean));
      const seenTitles = new Set(existing[topic.key].map(x => x.title));

      let added = 0;
      for (const cand of candidates) {
        if (cand.url && seenUrls.has(cand.url)) continue;
        if (seenTitles.has(cand.title)) continue;
        existing[topic.key].unshift(cand);
        newItemsByCategory[topic.key].push(cand);
        seenUrls.add(cand.url);
        seenTitles.add(cand.title);
        added++;
        console.log(`  ✅ [${topic.key}] ${cand.title.slice(0, 60)}`);
      }
      totalNew += added;
      if (added === 0) console.log(`  ⏭  [${topic.key}] 신규 없음`);
    } catch (e) {
      console.error(`  ❌ [${topic.key}] 실패:`, e.message);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // 신규 항목을 별도 파일로 저장 (workflow가 텔레그램 발송용으로 읽음)
  await fs.writeFile('events/_new-this-run.json', JSON.stringify(newItemsByCategory, null, 2), 'utf8');

  // 30일 초과 + 카테고리별 30건 제한
  existing.travel = pruneOld(existing.travel).slice(0, MAX_PER_CATEGORY);
  existing.giveaways = pruneOld(existing.giveaways).slice(0, MAX_PER_CATEGORY);
  existing.last_updated = `${new Date().getFullYear()}-${pad(new Date().getMonth() + 1)}-${pad(new Date().getDate())} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}:${pad(new Date().getSeconds())}`;

  await fs.writeFile('events/events.json', JSON.stringify(existing, null, 2), 'utf8');
  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ 신규 ${totalNew}건 / 전체 travel ${existing.travel.length}건, giveaways ${existing.giveaways.length}건`);
  console.log('═══════════════════════════════════════════');
}

main().catch(e => {
  console.error('💥 수집 실패:', e);
  process.exit(1);
});
