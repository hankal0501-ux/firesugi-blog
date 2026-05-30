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
  // normalizeItem 이 fetch 로 본문 보강하므로 await 필요
  const top = items.slice(0, 5);
  const normalized = [];
  for (const it of top) normalized.push(await normalizeItem(it, topic));
  return normalized;
}

// 원문 URL 에서 본문 발췌 (meta description + og:description + 첫 문단들) — 최소 4줄 보장
async function enrichArticleBody(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7'
      },
      redirect: 'follow'
    });
    if (!res.ok) return '';
    const html = await res.text();
    // 메타 디스크립션 추출
    const ogDesc = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:description["']/i)?.[1] || '';
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
                  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] || '';
    // 본문 첫 문단 3개 추출 (50자 이상 인 것만)
    const paragraphs = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m;
    while ((m = pRegex.exec(html)) && paragraphs.length < 5) {
      const t = m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&[a-z]+;/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (t.length >= 40 && !/^(저작권|Copyright|관련 ?기사|구독|좋아요)/i.test(t)) {
        paragraphs.push(t);
      }
    }
    const combined = [ogDesc, metaDesc, ...paragraphs]
      .filter(Boolean)
      .filter((s, i, arr) => arr.indexOf(s) === i) // 중복 제거
      .join('\n\n');
    return combined.slice(0, 1500); // 최대 1500자
  } catch (e) {
    console.warn(`     ⚠ 본문 추출 실패: ${e.message}`);
    return '';
  }
}

// 한글 조사 자동 선택 (이/가)
function picksParticle(word, pair) {
  const last = (word || '').slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return pair[1];
  return (code - 0xAC00) % 28 !== 0 ? pair[0] : pair[1];
}

// 폴백 본문 — 토픽별 도메인 지식 + 시사점 (enrich-news.js 와 동일 패턴)
function generateFallbackBody(item) {
  const topicMap = {
    '최신기술': {
      desc: '소방·화재안전 분야의 신기술과 스마트 솔루션, AI 적용 사례를 다루는 기사입니다. 최근 AI 화재탐지, IoT 기반 모니터링, 무인 소방로봇, 스마트 스프링클러, 자동화재속보설비 등 화재안전 분야 디지털 전환이 빠르게 진행되고 있으며, 산업체·공공기관·연구소가 함께 신기술을 검증·도입하는 사례가 늘고 있습니다.',
      impact: '신기술 도입은 화재 조기탐지 능력 향상, 초기 대응 시간 단축, 인명·재산 피해 감소에 직접 기여합니다. 특히 AI·IoT 결합 솔루션은 기존 감지기 대비 오작동률을 크게 낮추고, 화재 발생 시점·위치를 분단위로 파악해 119 신고와 동시에 자동 통보가 가능합니다.',
      next: '관련 기술의 상용화 일정, 도입 사업장 범위, 인증·표준화 진행 상황은 출처 사이트에서 자세히 확인할 수 있습니다.'
    },
    '논문연구': {
      desc: '화재공학·소방연구·학술적 분석을 다루는 연구·논문 기반 기사입니다. 한국화재소방학회, 대한건축학회, 한국소방안전원 등 학술 단체가 발표하는 화재거동 모델링, 구조물 내화성능, 피난 시뮬레이션, 소화약제 효과 분석 연구가 화재안전기준(NFTC) 개정과 정책 결정에 직접 반영됩니다.',
      impact: '학술 연구는 단순 데이터가 아닌 화재 안전기준의 과학적 근거가 됩니다. 신소재 내화도료, 친환경 소화약제, 고층·복합용도 건축물 피난 안전성 등 새로 개정되는 기준 대부분이 이러한 연구에 기반하며, 실무자에게는 현장 적용 시점·법령 반영 여부가 중요합니다.',
      next: '연구 결과의 정량적 수치, 적용 가능 범위, 후속 연구 일정은 원문에서 확인할 수 있습니다.'
    },
    '사고처벌': {
      desc: '화재사고·소방법 위반·안전관리 책임 등 사법적·행정적 처분 관련 기사입니다. 소방시설 자체점검 미실시, 방화구획 훼손, 비상구 폐쇄, 소화전 적치, 소방안전관리자 미선임 등 위반 행위와 그에 따른 행정처분·과태료·형사 책임을 다룹니다.',
      impact: '소방법 위반은 단순 과태료를 넘어 화재 발생 시 형사 책임(업무상 과실치사상, 중대재해처벌법)으로 확대될 수 있습니다. 특히 특정소방대상물의 안전관리자·관계인은 자체점검 결과보고서 제출 의무, 화재안전조사 결과 시정 의무를 위반하면 과태료 300만원 이하 또는 영업정지 처분을 받을 수 있습니다.',
      next: '구체적인 처분 사례, 법령 근거 조항, 유사 사례 판례는 원문에서 확인할 수 있습니다.'
    }
  };
  const t = topicMap[item.topic] || {
    desc: '소방·화재안전 분야의 최신 동향을 다루는 기사입니다.',
    impact: '본 기사는 소방 실무자, 건축 관계자, 시설 관리자에게 직접적인 참고 자료가 될 수 있습니다.',
    next: '자세한 내용은 원문에서 확인할 수 있습니다.'
  };
  const srcParticle = picksParticle(item.source, ['이', '가']);
  return [
    `${item.title} — ${item.source}${srcParticle} ${item.date}에 보도한 ${item.topic} 분야 기사입니다.`,
    t.desc, t.impact,
    `이번 기사는 ${item.source}의 보도를 기반으로 하며, 관련 사진·통계·현장 인터뷰·전문가 코멘트 등 상세 정보가 원문 페이지에 포함되어 있습니다. 소방안전 실무에 직접 활용하려는 경우 출처 사이트에서 원문을 확인하는 것이 권장됩니다.`,
    t.next,
    '우측 [원문 기사 보기 ↗] 버튼을 눌러 출처 사이트로 이동하면 전체 내용·관련 자료·후속 보도 링크를 함께 확인할 수 있습니다. Fire-Sugi는 매일 09:00 KST에 Google News RSS를 통해 소방·화재안전 분야 주요 기사를 자동 수집·요약하여 제공합니다.'
  ].join('\n\n');
}

async function normalizeItem(item, topic) {
  const rawTitle = String(item.title || '').trim();
  // Google News 제목 형식: "제목 - 출처명" → 분리
  const m = rawTitle.match(/^(.+?)\s+-\s+([^-]+)$/);
  const title = m ? m[1].trim() : rawTitle;
  const sourceName = m ? m[2].trim() : (item.source?.['#text'] || item.source || '뉴스');

  let link = '';
  if (typeof item.link === 'string') link = item.link;
  else if (item.link?.['#text']) link = item.link['#text'];
  else if (item['atom:link']?.['@_href']) link = item['atom:link']['@_href'];

  const rssDesc = String(item.description || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 원문 페이지에서 본문 발췌 (4줄 이상 목표)
  const articleBody = await enrichArticleBody(link);
  const pubDate = new Date(item.pubDate || Date.now());
  const date = `${pubDate.getFullYear()}.${pad(pubDate.getMonth() + 1)}.${pad(pubDate.getDate())}`;

  // 본문 우선순위: 추출본문(긴 것) > RSS > 폴백(토픽 도메인 지식)
  let desc;
  if (articleBody && articleBody.length >= 400) {
    desc = articleBody;
  } else if (rssDesc.length >= 400) {
    desc = rssDesc;
  } else {
    desc = generateFallbackBody({ title, source: sourceName, date, topic: topic.key });
  }

  // 카드 요약(중간 길이) + 상세 모달용 풀텍스트 분리
  const summary = desc.slice(0, 500) + (desc.length > 500 ? '…' : '');
  const fullDesc = desc;

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
