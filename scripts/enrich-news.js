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

// 폴백 — 제목·메타데이터 기반 구조화 본문 (최소 4줄 보장)
function generateFallbackBody(n) {
  const topicDesc = {
    '최신기술': '소방·화재안전 분야의 신기술·스마트 솔루션·AI 적용 사례를 다루는 기사입니다.',
    '논문연구': '화재공학·소방연구·학술적 분석을 다루는 연구·논문 기반 기사입니다.',
    '사고처벌': '화재사고·소방법 위반·안전관리 책임 등 사법적·행정적 처분 관련 기사입니다.'
  }[n.topic] || '소방·화재안전 분야의 최신 동향을 다루는 기사입니다.';

  return [
    `📰 ${n.title}`,
    '',
    topicDesc,
    '',
    `📅 등록일 ${n.date} · 🏷 출처 ${n.source} · 주제 ${n.topic}`,
    '',
    '🔗 원문에서 자세한 내용·관련 사진·통계·현장 보고를 확인할 수 있습니다.',
    '우측 [원문 기사 보기 ↗] 버튼으로 출처 사이트로 이동하세요.'
  ].join('\n');
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
    if (body && body.length > (n.fullDesc?.length || 0)) {
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
