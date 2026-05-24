// =============================================================
// Telegram 알림 발송 — 신규 이벤트/뉴스가 있을 때만 호출
// 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// 인자: events | news  (어느 컬렉션 알림인지)
// =============================================================
import fs from 'node:fs/promises';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MODE = process.argv[2] || 'events';

if (!TOKEN || !CHAT_ID) {
  console.log('ℹ️  TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 미설정 → 발송 스킵');
  process.exit(0);
}

function esc(s) {
  // HTML parse_mode 용 — <, >, & 만 escape (간단 안전)
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function send(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false
    })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body.slice(0, 200)}`);
  }
  console.log('  ✅ 텔레그램 발송 OK');
}

async function buildEventsMessage() {
  let data;
  try {
    data = JSON.parse(await fs.readFile('events/_new-this-run.json', 'utf8'));
  } catch {
    console.log('ℹ️  _new-this-run.json 없음 → 신규 이벤트 없음, 발송 스킵');
    process.exit(0);
  }
  const travel = data.travel || [];
  const give = data.giveaways || [];
  if (travel.length === 0 && give.length === 0) {
    console.log('ℹ️  신규 항목 0건 → 발송 스킵');
    process.exit(0);
  }

  const lines = [`🎁 <b>Fire-Sugi 신규 이벤트 ${travel.length + give.length}건</b>`, ''];
  if (travel.length) {
    lines.push(`✈️ <b>여행 특가 (${travel.length}건)</b>`);
    travel.slice(0, 10).forEach(it => {
      const t = esc(it.title).slice(0, 80);
      const src = esc(it.detail || '');
      lines.push(`• <a href="${esc(it.url)}">${t}</a>${src ? ` <i>(${src})</i>` : ''}`);
    });
    lines.push('');
  }
  if (give.length) {
    lines.push(`🏆 <b>공모·응모 (${give.length}건)</b>`);
    give.slice(0, 10).forEach(it => {
      const t = esc(it.title).slice(0, 80);
      const src = esc(it.source_site || '');
      lines.push(`• <a href="${esc(it.url)}">${t}</a>${src ? ` <i>(${src})</i>` : ''}`);
    });
  }
  return lines.join('\n').trim();
}

async function buildNewsMessage() {
  // 가장 최근 발송 이후 추가된 news 항목 - news.json 의 isNew=true 만
  let news;
  try {
    news = JSON.parse(await fs.readFile('news.json', 'utf8'));
  } catch {
    console.log('ℹ️  news.json 없음 → 스킵');
    process.exit(0);
  }
  const fresh = (news || []).filter(n => n.isNew);
  if (fresh.length === 0) {
    console.log('ℹ️  신규 뉴스 0건 → 발송 스킵');
    process.exit(0);
  }
  const lines = [`📰 <b>Fire-Sugi 신규 뉴스 ${fresh.length}건</b>`, ''];
  fresh.slice(0, 10).forEach(n => {
    const t = esc(n.title).slice(0, 80);
    const topic = esc(n.topic || '');
    lines.push(`${n.emoji || '📰'} <a href="${esc(n.url)}">${t}</a> <i>(${topic})</i>`);
  });
  return lines.join('\n').trim();
}

async function main() {
  let text;
  if (MODE === 'news') text = await buildNewsMessage();
  else text = await buildEventsMessage();

  console.log('📨 발송 내용 미리보기 (앞 200자):');
  console.log('  ' + text.slice(0, 200).replace(/\n/g, ' ⏎ '));
  console.log('');

  await send(text);
}

main().catch(e => {
  console.error('💥 텔레그램 발송 실패:', e.message);
  process.exit(0); // 발송 실패가 워크플로 전체 실패로 이어지지 않게 0 으로 종료
});
