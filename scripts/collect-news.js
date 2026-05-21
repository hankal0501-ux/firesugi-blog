// =============================================================
// Fire-Sugi 뉴스 자동 수집기
// - 매일 1회 GitHub Actions에서 실행
// - 주제별 Google News RSS에서 최신 1건씩 수집 (총 3건/일)
// - news.json 에 누적 저장 (URL 중복 제거, 최대 200건 유지)
// =============================================================
import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

// ───── 주제 정의 ──────────────────────────────────────────────
// 각 topic 마다 Google News 검색어를 OR 결합해서 RSS로 가져옴
const TOPICS = [
  {
    key: '최신기술',
    emoji: '🚀',
    color: '#0068c3',
    query: '"소방 신기술" OR "화재안전 기술" OR "스마트 소방" OR "AI 화재" OR "자동화재탐지 신기술"'
  },
  {
    key: '논문연구',
    emoji: '📚',
    color: '#6020a8',
    query: '"화재 연구" OR "소방 연구보고서" OR "한국화재소방학회" OR "화재공학 논문" OR "방재 연구"'
  },
  {
    key: '사고처벌',
    emoji: '⚖️',
    color: '#c93030',
    query: '"화재 사고 처벌" OR "소방 위반 벌금" OR "안전관리자 처벌" OR "화재 과실 판결" OR "소방법 위반"'
  }
];

const GNEWS_BASE = 'https://news.google.com/rss/search';
const HL = 'ko';
const GL = 'KR';
const CEID = 'KR:ko';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function fetchTopic(topic) {
  const url = `${GNEWS_BASE}?q=${encodeURIComponent(topic.query)}&hl=${HL}&gl=${GL}&ceid=${CEID}`;
  console.log(`📡 [${topic.key}] 가져오는 중...`);
  console.log(`    ${url.slice(0, 110)}...`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FireSugiBot/1.0; +https://github.com/firesugi)',
      'Accept': 'application/rss+xml, application/xml, text/xml'
    }
  });
  if (!res.ok) {
    console.warn(`  ⚠️  HTTP ${res.status}`);
    return null;
  }
  const xml = await res.text();
  const data = parser.parse(xml);
  let items = data?.rss?.channel?.item || [];
  if (!Array.isArray(items)) items = [items];

  if (!items.length) {
    console.warn(`  ⚠️  결과 없음`);
    return null;
  }

  // 최신순(pubDate desc) 정렬 → 상위 5개 후보 반환 (중복 시 다음 후보로 폴백)
  items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return items.slice(0, 5).map(it => normalizeItem(it, topic));
}

function normalizeItem(item, topic) {
  const rawTitle = String(item.title || '').trim();
  // Google News 제목 형식: "제목 - 출처명" → 분리
  const m = rawTitle.match(/^(.+?)\s+-\s+([^-]+)$/);
  const title = m ? m[1].trim() : rawTitle;
  const sourceName = m ? m[2].trim() : (item.source?.['#text'] || item.source || '뉴스');

  let link = '';
  if (typeof item.link === 'string') link = item.link;
  else if (item.link?.['#text']) link = item.link['#text'];
  else if (item['atom:link']?.['@_href']) link = item['atom:link']['@_href'];

  const desc = String(item.description || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 카드 요약(중간 길이) + 상세 모달용 풀텍스트 분리
  const summary = desc.slice(0, 500) + (desc.length > 500 ? '…' : '');
  const fullDesc = desc;

  const pubDate = new Date(item.pubDate || Date.now());
  const date = `${pubDate.getFullYear()}.${pad(pubDate.getMonth() + 1)}.${pad(pubDate.getDate())}`;

  return {
    id: Date.now() + Math.floor(Math.random() * 10000),
    topic: topic.key,
    source: sourceName,
    emoji: topic.emoji,
    image: topic.emoji,
    color: topic.color,
    title,
    summary: summary || '(요약 없음 — 원문을 확인하세요.)',
    fullDesc: fullDesc || '',
    url: link,
    date,
    autoAdded: true,
    isNew: true,
    collectedAt: new Date().toISOString(),
    pubDate: pubDate.toISOString()
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🤖 Fire-Sugi 뉴스 자동 수집 시작');
  console.log('═══════════════════════════════════════════\n');

  // 기존 news.json 로드
  let existing = [];
  try {
    existing = JSON.parse(await fs.readFile('news.json', 'utf8'));
    console.log(`📂 기존 ${existing.length}건 로드\n`);
  } catch {
    console.log('📂 news.json 없음 - 새로 생성\n');
  }

  const seenUrls = new Set(existing.map(n => n.url).filter(Boolean));
  const seenTitles = new Set(existing.map(n => n.title));
  const collected = [];

  for (const topic of TOPICS) {
    try {
      const candidates = await fetchTopic(topic);
      if (!candidates || !candidates.length) continue;
      // 후보 5개 중 첫 비-중복 항목 채택 — 매일 3개 보장
      let picked = null;
      for (const cand of candidates) {
        if (cand.url && seenUrls.has(cand.url)) continue;
        if (seenTitles.has(cand.title)) continue;
        picked = cand;
        break;
      }
      if (!picked) {
        console.log(`  ⏭  [${topic.key}] 5개 후보 모두 중복 — 스킵\n`);
        continue;
      }
      collected.push(picked);
      seenUrls.add(picked.url);
      seenTitles.add(picked.title);
      console.log(`  ✅ [${topic.key}] ${picked.title.slice(0, 60)}`);
      console.log(`     출처: ${picked.source} · ${picked.date} · 요약 ${picked.summary.length}자\n`);
    } catch (e) {
      console.error(`  ❌ [${topic.key}] 실패:`, e.message, '\n');
    }
    // Rate limit 방지
    await new Promise(r => setTimeout(r, 1500));
  }

  // 기존 isNew 모두 해제 → 신규만 NEW
  existing.forEach(n => { n.isNew = false; });

  const merged = [...collected, ...existing].slice(0, 200); // 최대 200건 유지
  await fs.writeFile('news.json', JSON.stringify(merged, null, 2), 'utf8');

  console.log('═══════════════════════════════════════════');
  console.log(`✅ 신규 ${collected.length}건 추가 / 전체 ${merged.length}건`);
  console.log('═══════════════════════════════════════════');
}

main().catch(e => {
  console.error('💥 수집 실패:', e);
  process.exit(1);
});
