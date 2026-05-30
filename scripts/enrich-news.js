// =============================================================
// Fire-Sugi 뉴스 본문 백필
// - news.json 의 짧은 항목을 다음 순서로 보강:
//   1) Google News URL → batchexecute API 로 실제 기사 URL 해결
//   2) 실제 URL fetch → meta description + og:description + 첫 문단들 추출
//   3) 실패 시 → 제목·출처·주제 기반 4줄 이상 구조화 텍스트 생성 (폴백)
//
// 실행: node scripts/enrich-news.js
// 또는: node scripts/enrich-news.js --force (이미 긴 것도 다시 시도)
// =============================================================
import fs from 'node:fs/promises';

const NEWS_PATH = 'news.json';
const MIN_BODY_LEN = 200;
const THROTTLE_MS = 1800;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Google News 리다이렉트 URL → 실제 기사 URL 해결
// (batchexecute 엔드포인트 사용 — 비공식, 변경 가능)
async function resolveGoogleNewsURL(gnUrl) {
  const m = gnUrl.match(/\/articles\/([\w_-]+)/);
  if (!m) return null;
  const articleId = m[1];
  try {
    const innerPayload = '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"' + articleId + '",' + Math.floor(Date.now()/1000) + ',"0"]';
    const outer = JSON.stringify([[["Fbv4je", innerPayload, null, "generic"]]]);
    const body = 'f.req=' + encodeURIComponent(outer);
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'
      },
      body,
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return null;
    const text = await res.text();
    // 응답에서 외부 URL 추출
    const urlMatch = text.match(/"(https?:\/\/(?!news\.google\.com|google\.com|gstatic)[^"\\]+)"/);
    return urlMatch?.[1] || null;
  } catch { return null; }
}

async function fetchAndExtract(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.7'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return '';
    const html = await res.text();
    const ogDesc = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:description["']/i)?.[1] || '';
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
                  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] || '';
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
      if (t.length >= 40 && !/^(저작권|Copyright|관련 ?기사|구독|좋아요|기사 ?공유|이메일|All rights|광고|구글)/i.test(t)) {
        paragraphs.push(t);
      }
    }
    const combined = [ogDesc, metaDesc, ...paragraphs]
      .filter(Boolean)
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .join('\n\n');
    return combined.slice(0, 1500);
  } catch { return ''; }
}

// 한글 조사 자동 선택 — 종성(받침) 유무로 이/가, 은/는, 을/를 결정
function picksParticle(word, pair) {
  const last = (word || '').slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return pair[1]; // 한글 아니면 vowel form
  const hasJongseong = (code - 0xAC00) % 28 !== 0;
  return hasJongseong ? pair[0] : pair[1];
}

// 폴백 — 제목·메타데이터 기반 풍부한 본문 (각 토픽별 도메인 지식 + 시사점 포함)
function generateFallbackBody(n) {
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
  const t = topicMap[n.topic] || {
    desc: '소방·화재안전 분야의 최신 동향을 다루는 기사입니다.',
    impact: '본 기사는 소방 실무자, 건축 관계자, 시설 관리자에게 직접적인 참고 자료가 될 수 있습니다.',
    next: '자세한 내용은 원문에서 확인할 수 있습니다.'
  };
  const srcParticle = picksParticle(n.source, ['이', '가']);

  return [
    `${n.title} — ${n.source}${srcParticle} ${n.date}에 보도한 ${n.topic} 분야 기사입니다.`,
    t.desc,
    t.impact,
    `이번 기사는 ${n.source}의 보도를 기반으로 하며, 관련 사진·통계·현장 인터뷰·전문가 코멘트 등 상세 정보가 원문 페이지에 포함되어 있습니다. 소방안전 실무에 직접 활용하려는 경우 출처 사이트에서 원문을 확인하는 것이 권장됩니다.`,
    t.next,
    '우측 [원문 기사 보기 ↗] 버튼을 눌러 출처 사이트로 이동하면 전체 내용·관련 자료·후속 보도 링크를 함께 확인할 수 있습니다. Fire-Sugi는 매일 09:00 KST에 Google News RSS를 통해 소방·화재안전 분야 주요 기사를 자동 수집·요약하여 제공합니다.'
  ].join('\n\n');
}

async function enrichOne(n) {
  let url = n.url;
  // Google News 리다이렉트면 실제 URL 해결 시도
  if (url && url.includes('news.google.com')) {
    const resolved = await resolveGoogleNewsURL(url);
    if (resolved) {
      console.log(`     ↪ 해결: ${resolved.slice(0, 80)}`);
      url = resolved;
    }
  }
  // 실제 URL fetch + 추출
  const body = await fetchAndExtract(url);
  if (body && body.length >= MIN_BODY_LEN) return body;
  // 폴백: 구조화 텍스트
  return generateFallbackBody(n);
}

async function main() {
  const force = process.argv.includes('--force');
  console.log('═══════════════════════════════════════════');
  console.log('📰 뉴스 본문 백필 시작' + (force ? ' (--force)' : ''));
  console.log('═══════════════════════════════════════════\n');

  const raw = await fs.readFile(NEWS_PATH, 'utf-8');
  const news = JSON.parse(raw);
  const candidates = news.filter(n => force || (n.fullDesc || '').length < MIN_BODY_LEN);
  console.log(`전체 ${news.length}건 · 보강 대상 ${candidates.length}건\n`);

  let updated = 0, skipped = 0;
  for (let i = 0; i < candidates.length; i++) {
    const n = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] ${n.title.slice(0, 45)}\n`);
    const body = await enrichOne(n);
    // --force 시에는 길이 무관하게 덮어쓰기, 아니면 더 긴 경우만
    const shouldUpdate = body && (force || body.length > (n.fullDesc?.length || 0));
    if (shouldUpdate) {
      n.fullDesc = body;
      n.summary = body.slice(0, 500) + (body.length > 500 ? '…' : '');
      console.log(`     ✅ ${body.length}자 (라인 ${body.split('\n').length})`);
      updated++;
    } else {
      console.log(`     ⏭ 스킵`);
      skipped++;
    }
    if (i < candidates.length - 1) await sleep(THROTTLE_MS);
  }

  await fs.writeFile(NEWS_PATH, JSON.stringify(news, null, 2), 'utf-8');
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`✅ 보강 ${updated}건 · 스킵 ${skipped}건 / 전체 ${news.length}건`);
  console.log(`═══════════════════════════════════════════`);
}

main().catch(e => { console.error('💥 에러:', e); process.exit(1); });
