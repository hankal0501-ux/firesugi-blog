// =============================================================
// Fire-Sugi 이벤트 자동 수집기 (GitHub Actions)
// - 매일 1회 cron 실행
// - firelaw(소방 법령 고시·입법예고) / giveaways(공모·응모) / coffee(커피 경품) 수집
// - 소스: Google News RSS 다중 쿼리(한국어+영어) + 뽐뿌 쿠폰·이벤트 게시판 RSS
// - events/events.json 에 누적 (중복 제거, 카테고리별 최대 30건, 30일 보관)
// =============================================================
import fs from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';

const KO = { hl: 'ko', gl: 'KR', ceid: 'KR:ko', region: '국내' };
const EN = { hl: 'en-US', gl: 'US', ceid: 'US:en', region: '해외' };

// 해외 이벤트는 국내에서 응모가 어려워 당분간 제외한다.
// true 로 바꾸면 아래 EN 쿼리가 다시 살아난다.
const INCLUDE_OVERSEAS = false;

// 한국어 쿼리가 배열 앞에 있어 한도를 먼저 채우면 해외 건이 전부 잘린다.
// 지역별로 따로 한도를 둬서 국내/해외가 균형 있게 들어오도록 한다.
const REGION_QUOTA = INCLUDE_OVERSEAS ? { 국내: 7, 해외: 7 } : { 국내: 14, 해외: 0 };

const TOPICS = [
  {
    key: 'firelaw',
    kindLabel: '🚒 소방 법령',
    queries: [
      { ...KO, q: '"소방시설법" OR "화재예방법" OR "소방기본법" (개정 OR 시행)' },
      { ...KO, q: '"화재안전기준" OR "NFTC" OR "NFPC" (고시 OR 개정 OR 제정)' },
      { ...KO, q: '소방 ("입법예고" OR "행정예고")' },
      { ...KO, q: '소방청 (고시 OR 훈령 OR 예규 OR 시행령 OR 시행규칙)' }
    ],
    gate: isFireLawNotice,
    // 법령 개정·고시는 뉴스보다 오래 유효하다. 30일이면 몇 건 안 남는다.
    keepDays: 120
  },
  {
    key: 'giveaways',
    kindLabel: '🏆 공모·응모',
    queries: [
      { ...KO, q: '"공모전 모집" OR "콘테스트 응모"' },
      { ...KO, q: '"무료 이벤트 응모" OR "경품 추첨 이벤트"' }
    ]
  },
  {
    key: 'coffee',
    kindLabel: '☕ 커피 이벤트',
    // 커피는 브랜드·경품 형태가 다양해서 쿼리를 잘게 쪼개야 리콜이 나온다.
    // 하나의 긴 OR 문자열은 구글 뉴스에서 상위 결과가 한쪽으로 쏠린다.
    queries: [
      { ...KO, q: '"커피 쿠폰" OR "커피 기프티콘"' },
      { ...KO, q: '스타벅스 (쿠폰 OR 증정 OR 기프티콘 OR 이벤트)' },
      { ...KO, q: '"아메리카노" (무료 OR 증정 OR 쿠폰)' },
      { ...KO, q: '메가커피 OR 컴포즈커피 OR 이디야 OR 투썸플레이스 (이벤트 OR 증정 OR 쿠폰)' },
      { ...KO, q: '"기프티콘" (경품 OR 추첨 OR 응모)' },
      { ...EN, q: '"coffee giveaway" OR "free coffee for a year"' },
      { ...EN, q: '"espresso machine giveaway" OR "coffee sweepstakes"' },
      { ...EN, q: 'starbucks (sweepstakes OR giveaway)' }
    ],
    feeds: [
      { name: '뽐뿌 쿠폰·이벤트', url: 'https://www.ppomppu.co.kr/rss.php?id=coupon', region: '국내' }
    ],
    gate: isCoffeeEvent,
    regionQuota: REGION_QUOTA
  }
];

const GNEWS_BASE = 'https://news.google.com/rss/search';
const MAX_PER_CATEGORY = 30;
const KEEP_DAYS = 30;
const PER_QUERY_LIMIT = 6;   // 쿼리 1개당 상위 N건만
const PER_TOPIC_NEW_LIMIT = 14; // 한 실행에서 카테고리당 신규 최대 N건

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ---------- 필터 ----------

// 사건·사고·소송·실적 기사는 "이벤트"가 아니다. 커피 쿠폰 관련 뉴스에
// 절도·개인정보 유출·무죄판결 기사가 섞여 들어오던 걸 여기서 차단한다.
const NOISE_RE = /절도|훔치|소송|고소|기소|무죄|유죄|재판|법원|검찰|경찰|사망|숨진|부상|논란|사기|개인정보|유출|해킹|피해|불매|파업|리콜|횡령|성추행|폭행|갑질|적자|주가|과징금|공정위|압수|구속|가격 인상|값 올린|인상한다|철수|폐점|급감|점유율|시험대|실적 부진|사고|참사|화재|lawsuit|sued|arrest|recall/i;

const COFFEE_RE = /커피|카페|아메리카노|라떼|에스프레소|원두|스타벅스|이디야|투썸|빽다방|메가커피|컴포즈|폴바셋|커피빈|탐앤탐스|할리스|coffee|espresso|latte|starbucks|dunkin|lavazza|nespresso/i;
const BENEFIT_RE = /무료|공짜|기프티콘|쿠폰|증정|경품|추첨|응모|당첨|이벤트|giveaway|sweepstakes|free|win a|prize|contest/i;

function isCoffeeEvent(text) {
  return COFFEE_RE.test(text) && BENEFIT_RE.test(text) && !NOISE_RE.test(text);
}

// 소방 법령: 공통 NOISE_RE 를 쓸 수 없다. 거기엔 '화재'·'사고'가 들어 있어
// 소방 기사를 전부 죽인다. 대신 "제도 변경"이 아닌 사건·인사 기사를 걸러낸다.
const FIRELAW_SUBJECT_RE = /소방|화재안전|소방청|소방시설|화재예방|피난|소화설비|경보설비/;
const FIRELAW_ACTION_RE = /개정|제정|시행|입법예고|행정예고|고시|훈령|예규|시행령|시행규칙|발령|공포|법률안|하위법령|의무화|기준 수립/;
// '개정판 출간'·'해설서 발간' 은 책 소식이지 법령 개정이 아니다
const FIRELAW_NOISE_RE = /순직|숨진|사망|부상|참사|검거|구속|기소|성추행|폭행|음주|비리|횡령|선정|위촉|임명|간담회|워크숍|캠페인|봉사|기부|성금|채용|개정판|출간|해설서|발간/;

function isFireLawNotice(text) {
  return FIRELAW_SUBJECT_RE.test(text) && FIRELAW_ACTION_RE.test(text) && !FIRELAW_NOISE_RE.test(text);
}

// 제목에서 법령 조치 유형을 뽑아 뱃지처럼 보여준다.
// 주의 두 가지:
//  · '입법 예고' 처럼 띄어쓴 표기가 흔하다 → \s? 허용
//  · '시행령'·'시행규칙' 의 '시행' 이 먼저 걸려 [시행] 로 오태깅된다 → 부정 전방탐색
const FIRELAW_ACTIONS = [
  ['입법예고', /입법\s?예고/], ['행정예고', /행정\s?예고/],
  ['제정', /제정/], ['개정', /개정/], ['고시', /고시|발령|공포/],
  ['시행', /시행(?!령|규칙)/]
];

function extractAction(text) {
  const hit = FIRELAW_ACTIONS.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

// ---------- 추출 ----------

const PRIZE_RE = /(1년 무료 커피|무료 커피 이용권|아메리카노|카페라떼|바닐라라떼|라떼|음료 쿠폰|커피 쿠폰|기프티콘|기프트 ?카드|에스프레소 머신|커피 머신|텀블러|머그|원두|gift card|espresso machine|free coffee for a year|coffee beans)/i;

function extractPrize(text) {
  const m = text.match(PRIZE_RE);
  return m ? m[1].trim() : null;
}

// "7월 10일까지", "~7/10", "7.10 마감" → ~YYYY-MM-DD
function extractPeriod(text) {
  const year = new Date().getFullYear();
  let m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:까지|마감)/);
  if (!m) m = text.match(/~\s*(\d{1,2})\s*[./]\s*(\d{1,2})/);
  if (!m) m = text.match(/(\d{1,2})\s*[./]\s*(\d{1,2})\s*(?:까지|마감)/);
  if (!m) return null;
  return `~${year}-${pad(m[1])}-${pad(m[2])}`;
}

const BRANDS = ['스타벅스', '메가커피', '컴포즈커피', '이디야', '투썸플레이스', '빽다방', '폴바셋', '커피빈', '탐앤탐스', '할리스', 'Starbucks', 'Dunkin', 'Lavazza', 'Nespresso'];

function extractBrand(text) {
  const hit = BRANDS.find(b => new RegExp(b, 'i').test(text));
  return hit || null;
}

// ---------- 수집 ----------

async function fetchXml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FireSugiEventsBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });
    if (!res.ok) {
      console.warn(`  ⚠️  HTTP ${res.status} — ${url.slice(0, 70)}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.warn(`  ⚠️  요청 실패 (${e.name}) — ${url.slice(0, 70)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseItems(xml) {
  if (!xml) return [];
  let items;
  try {
    items = parser.parse(xml)?.rss?.channel?.item || [];
  } catch {
    return [];
  }
  if (!Array.isArray(items)) items = [items];
  return items;
}

async function fetchGNews(query) {
  const url = `${GNEWS_BASE}?q=${encodeURIComponent(query.q)}&hl=${query.hl}&gl=${query.gl}&ceid=${query.ceid}`;
  const items = parseItems(await fetchXml(url));
  items.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return items.slice(0, PER_QUERY_LIMIT).map(it => ({ raw: it, region: query.region }));
}

async function fetchFeed(feed) {
  const items = parseItems(await fetchXml(feed.url));
  return items.slice(0, 20).map(it => ({ raw: it, region: feed.region, forcedSource: feed.name }));
}

// ---------- 정규화 ----------

function textOf(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return v['#text'] || '';
  return '';
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function normalize({ raw, region, forcedSource }, topic) {
  const rawTitle = stripTags(textOf(raw.title));
  // 구글 뉴스 제목은 "제목 - 매체명" 형태
  const m = rawTitle.match(/^(.+?)\s+-\s+([^-]+)$/);
  const title = m ? m[1].trim() : rawTitle;
  const source = forcedSource || (m ? m[2].trim() : (textOf(raw.source) || '뉴스'));

  const link = textOf(raw.link);
  const desc = stripTags(textOf(raw.description));
  const pubDate = new Date(raw.pubDate || Date.now());
  const dateStr = `${pubDate.getFullYear()}-${pad(pubDate.getMonth() + 1)}-${pad(pubDate.getDate())} ${pad(pubDate.getHours())}:${pad(pubDate.getMinutes())}:${pad(pubDate.getSeconds())}`;
  const haystack = `${title} ${desc} ${source}`;

  if (topic.key === 'firelaw') {
    return {
      kind: topic.kindLabel,
      title,
      detail: source,
      action: extractAction(`${title} ${desc}`),
      url: link,
      site: 'gnews_' + source,
      created_at: dateStr
    };
  }
  if (topic.key === 'coffee') {
    return {
      source_site: source,
      title,
      category: '커피',
      region: region || '국내',
      brand: extractBrand(haystack),
      prize: extractPrize(haystack),
      prize_class: prizeClass(haystack),
      period: extractPeriod(haystack),
      url: link,
      created_at: dateStr
    };
  }
  return { source_site: source, title, category: '공모전', prize: null, period: null, url: link, created_at: dateStr };
}

// 경품을 거친 종류로 묶는다. "커피 쿠폰"·"커피쿠폰"·"음료 쿠폰"·"무료 아메리카노"는
// 표기만 다를 뿐 같은 혜택이라, 문자열 그대로 비교하면 같은 이벤트가 5건으로 늘어난다.
// 순서 중요 — 구체적인 종류를 먼저 확인한다.
const PRIZE_CLASSES = [
  ['freeyear', /1년\s?무료\s?커피|무료 커피 이용권|free coffee for a year/i],
  ['machine', /머신|브루어|espresso machine|brewer/i],
  ['giftcard', /기프트\s?카드|gift\s?card/i],
  ['beans', /원두|coffee beans/i],
  ['goods', /텀블러|머그|굿즈|테이블웨어|mug|tumbler|jersey|저지/i],
  ['coupon', /쿠폰|기프티콘|무료 음료|공짜 커피|무료 커피|아메리카노|라떼|음료/i]
];

function prizeClass(text) {
  const hit = PRIZE_CLASSES.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

// 같은 브랜드·같은 경품 종류 기사가 며칠에 걸쳐 나오면 한 이벤트로 본다.
// 고정 주차 격자를 쓰면 7/3 기사와 7/8 기사가 서로 다른 주로 갈려 중복이 남으므로,
// 항목 시각 기준 이동 윈도우로 비교한다.
const SAME_EVENT_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

function toTime(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T'));
  return isNaN(t) ? 0 : t;
}

// 커피 항목의 "같은 이벤트" 지문 — 브랜드와 경품 종류를 모두 알아낼 때만 유효
function coffeeSig(item) {
  const cls = item.prize_class || prizeClass(`${item.title} ${item.prize || ''}`);
  if (!item.brand || !cls) return null;
  return { key: `${item.brand}|${cls}`.toLowerCase(), t: toTime(item.created_at) };
}

function isSameEvent(sig, seenSigs) {
  return seenSigs.some(s => s.key === sig.key && Math.abs(s.t - sig.t) <= SAME_EVENT_WINDOW_MS);
}

// 같은 사건을 여러 매체가 조금씩 다르게 쓴 제목은 정확 일치 키로는 안 잡힌다.
// 두 가지 척도를 함께 쓴다 — 어느 하나만 넘어도 중복으로 본다.
//  · 단어 자카드: "…재개 '최대 300만원 혜택'" vs "…7월까지 최대 300만원 경품 추첨"
//  · 문자 2-gram 자카드: 한국어 띄어쓰기 차이에 강함
//    ("대표 발의" vs "대표발의" 는 단어 기준으론 서로 다른 토큰)
const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'at', 'in', 'on', 'with', 'and', 'is', 'are', 'up', 'new', 'today', 'this', 'its', 'you', 'your']);
const WORD_DUP_THRESHOLD = 0.5;
const GRAM_DUP_THRESHOLD = 0.6;

function wordSet(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOPWORDS.has(w))
  );
}

function gramSet(title) {
  const s = String(title).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

function tokenize(title) {
  return { words: wordSet(title), grams: gramSet(title) };
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function isNearDuplicate(tok, seenTokenSets) {
  return seenTokenSets.some(prev =>
    jaccard(tok.words, prev.words) >= WORD_DUP_THRESHOLD ||
    jaccard(tok.grams, prev.grams) >= GRAM_DUP_THRESHOLD
  );
}

// 제목이 사실상 같은 기사를 거르는 최후 방어선
function dedupeKey(item) {
  return String(item.title).replace(/[^\p{L}\p{N}]/gu, '').toLowerCase().slice(0, 24);
}

function pad(n) { return String(n).padStart(2, '0'); }

function pruneOld(list, keepDays = KEEP_DAYS) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  return list.filter(it => {
    const ts = new Date(it.created_at).getTime();
    return !isNaN(ts) && ts >= cutoff;
  });
}

async function collectTopic(topic, existing) {
  const queries = (topic.queries || []).filter(q => INCLUDE_OVERSEAS || q.region !== '해외');
  console.log(`\n📡 [${topic.key}] 수집 중... (쿼리 ${queries.length}개, 피드 ${topic.feeds?.length || 0}개)`);

  const buckets = [];
  for (const query of queries) {
    buckets.push(...await fetchGNews(query));
    await sleep(1200);
  }
  for (const feed of topic.feeds || []) {
    buckets.push(...await fetchFeed(feed));
    await sleep(1200);
  }
  console.log(`  📥 원본 후보 ${buckets.length}건`);

  const seenUrls = new Set(existing.map(x => x.url).filter(Boolean));
  const seenKeys = new Set(existing.map(dedupeKey));
  const seenTokenSets = existing.map(x => tokenize(x.title));
  const seenSigs = topic.key === 'coffee' ? existing.map(coffeeSig).filter(Boolean) : [];

  const fresh = [];
  const regionCount = {};
  let dropGate = 0, dropDup = 0, dropQuota = 0;

  for (const bucket of buckets) {
    if (fresh.length >= PER_TOPIC_NEW_LIMIT) break;
    const item = normalize(bucket, topic);
    if (!item.title || !item.url) continue;

    // 카테고리 게이트 (커피: 브랜드∧혜택∧¬잡음)
    const haystack = `${item.title} ${item.source_site || item.detail || ''} ${item.prize || ''}`;
    if (topic.gate && !topic.gate(haystack)) { dropGate++; continue; }
    if (!topic.gate && NOISE_RE.test(item.title)) { dropGate++; continue; }

    const key = dedupeKey(item);
    if (seenUrls.has(item.url) || seenKeys.has(key)) { dropDup++; continue; }

    const tokens = tokenize(item.title);
    if (isNearDuplicate(tokens, seenTokenSets)) { dropDup++; continue; }

    // 커피: 같은 브랜드+경품이 21일 안에 또 나오면 같은 이벤트로 간주
    const sig = topic.key === 'coffee' ? coffeeSig(item) : null;
    if (sig && isSameEvent(sig, seenSigs)) { dropDup++; continue; }

    // 해외 제외 스위치 (뽐뿌 등 피드 경유 항목까지 확실히 막는다)
    const region = item.region;
    if (!INCLUDE_OVERSEAS && region === '해외') { dropQuota++; continue; }

    // 지역 한도 (커피에만 적용) — 국내가 후보 앞을 독점하지 못하게 막는다
    // cap 이 0 일 수 있으므로 truthy 검사 대신 undefined 검사를 쓴다
    if (topic.regionQuota && region) {
      const cap = topic.regionQuota[region];
      if (cap !== undefined && (regionCount[region] || 0) >= cap) { dropQuota++; continue; }
      regionCount[region] = (regionCount[region] || 0) + 1;
    }

    seenUrls.add(item.url);
    seenKeys.add(key);
    seenTokenSets.push(tokens);
    if (sig) seenSigs.push(sig);
    fresh.push(item);
    const tag = region ? `[${region}] ` : '';
    console.log(`  ✅ ${tag}${item.title.slice(0, 58)}`);
  }

  const quotaNote = dropQuota ? ` · 지역한도 ${dropQuota}` : '';
  console.log(`  📊 신규 ${fresh.length}건 (게이트 탈락 ${dropGate} · 중복 ${dropDup}${quotaNote})`);
  return fresh;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🎁 Fire-Sugi 이벤트 자동 수집 시작');
  console.log('═══════════════════════════════════════════');

  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile('events/events.json', 'utf8'));
  } catch {
    console.log('📂 events.json 없음 - 새로 생성');
  }
  // 여행 특가 카테고리 폐지 (소방 법령으로 대체) — 남아 있으면 사이트가 옛 데이터를 계속 그린다
  if (existing.travel) {
    console.log(`🗑  travel 카테고리 제거 (${existing.travel.length}건)`);
    delete existing.travel;
  }

  for (const topic of TOPICS) existing[topic.key] = existing[topic.key] || [];
  console.log(`📂 기존: ${TOPICS.map(t => `${t.key} ${existing[t.key].length}건`).join(' · ')}`);

  const newItemsByCategory = {};
  let totalNew = 0;

  for (const topic of TOPICS) {
    try {
      const fresh = await collectTopic(topic, existing[topic.key]);
      newItemsByCategory[topic.key] = fresh;
      existing[topic.key].unshift(...fresh);
      totalNew += fresh.length;
    } catch (e) {
      console.error(`  ❌ [${topic.key}] 실패:`, e.message);
      newItemsByCategory[topic.key] = [];
    }
  }

  // 신규 항목을 별도 파일로 저장 (workflow가 텔레그램 발송용으로 읽음)
  await fs.writeFile('events/_new-this-run.json', JSON.stringify(newItemsByCategory, null, 2), 'utf8');

  for (const topic of TOPICS) {
    existing[topic.key] = pruneOld(existing[topic.key], topic.keepDays).slice(0, MAX_PER_CATEGORY);
  }
  const now = new Date();
  existing.last_updated = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  await fs.writeFile('events/events.json', JSON.stringify(existing, null, 2), 'utf8');
  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ 신규 ${totalNew}건 / 전체 ${TOPICS.map(t => `${t.key} ${existing[t.key].length}건`).join(' · ')}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(e => {
  console.error('💥 수집 실패:', e);
  process.exit(1);
});
