// =============================================================
// Telegram 알림 발송 — 신규 이벤트/뉴스가 있을 때만 호출
// 환경변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (관리자 본인용, 폴백)
// 인자: events | news
// 동작:
//  1. /getUpdates 폴링 → /start 보낸 새 사용자 자동 등록
//  2. subscribers/telegram.json 의 모든 chat_id 에 발송
//  3. subscribers/telegram.json 업데이트
// =============================================================
import fs from 'node:fs/promises';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MODE = process.argv[2] || 'events';
const SUBSCRIBERS_FILE = 'subscribers/telegram.json';

if (!TOKEN) {
  console.log('ℹ️  TELEGRAM_BOT_TOKEN 미설정 → 발송 스킵');
  process.exit(0);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function tgApi(method, body) {
  const url = `https://api.telegram.org/bot${TOKEN}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function loadSubscribers() {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    // 파일 없으면 관리자 한 명으로 초기화
    const init = {
      subscribers: ADMIN_CHAT_ID ? [{ chat_id: parseInt(ADMIN_CHAT_ID), name: 'admin', joined_at: new Date().toISOString() }] : [],
      last_offset: 0,
      updated_at: new Date().toISOString()
    };
    return init;
  }
}

async function saveSubscribers(data) {
  data.updated_at = new Date().toISOString();
  await fs.writeFile(SUBSCRIBERS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// /getUpdates 로 /start 보낸 신규 사용자 자동 등록
async function syncSubscribers(data) {
  const offset = data.last_offset || 0;
  let updates;
  try {
    updates = await tgApi('getUpdates', { offset: offset + 1, timeout: 0 });
  } catch (e) {
    console.warn('  ⚠️  getUpdates 실패:', e.message);
    return data;
  }
  if (!updates.ok || !Array.isArray(updates.result)) return data;

  const existingIds = new Set(data.subscribers.map(s => s.chat_id));
  let maxOffset = data.last_offset || 0;
  let added = 0;

  for (const upd of updates.result) {
    if (upd.update_id > maxOffset) maxOffset = upd.update_id;
    const msg = upd.message;
    if (!msg || !msg.chat || !msg.text) continue;
    const isStart = msg.text === '/start' || msg.text.startsWith('/start ');
    if (!isStart) continue;
    const chatId = msg.chat.id;
    if (existingIds.has(chatId)) continue;
    const name = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || (msg.chat.username ? '@' + msg.chat.username : '익명');
    data.subscribers.push({
      chat_id: chatId,
      name,
      joined_at: new Date(msg.date * 1000).toISOString()
    });
    existingIds.add(chatId);
    added++;
    console.log(`  ✅ 신규 구독자: ${name} (${chatId})`);
    // 환영 메시지
    await tgApi('sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `🎉 <b>구독 등록 완료!</b>\n\n앞으로 새 이벤트·뉴스가 발견되면 자동으로 알림 받으실 거예요.\n매일 오전 9시 ~ 9시 30분 사이 발송.\n\n해지: 이 봇 차단하면 즉시 중단됩니다.`
    });
  }

  data.last_offset = maxOffset;
  if (added > 0) console.log(`  📊 신규 구독자 ${added}명 등록`);
  else console.log(`  ⏭  신규 구독자 없음 (총 ${data.subscribers.length}명)`);
  return data;
}

async function send(chatId, text) {
  const res = await tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  if (!res.ok) throw new Error(`API ${res.error_code || '?'}: ${res.description || 'fail'}`);
}

async function buildEventsMessage() {
  let data;
  try {
    data = JSON.parse(await fs.readFile('events/_new-this-run.json', 'utf8'));
  } catch {
    return null;
  }
  const travel = data.travel || [];
  const give = data.giveaways || [];
  if (travel.length === 0 && give.length === 0) return null;

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
  let news;
  try {
    news = JSON.parse(await fs.readFile('news.json', 'utf8'));
  } catch { return null; }
  const fresh = (news || []).filter(n => n.isNew);
  if (fresh.length === 0) return null;
  const lines = [`📰 <b>Fire-Sugi 신규 뉴스 ${fresh.length}건</b>`, ''];
  fresh.slice(0, 10).forEach(n => {
    const t = esc(n.title).slice(0, 80);
    const topic = esc(n.topic || '');
    lines.push(`${n.emoji || '📰'} <a href="${esc(n.url)}">${t}</a> <i>(${topic})</i>`);
  });
  return lines.join('\n').trim();
}

async function main() {
  // 1. 구독자 목록 로드 + 신규 구독자 자동 등록
  let data = await loadSubscribers();
  console.log(`📂 기존 구독자 ${data.subscribers.length}명`);
  console.log('🔄 신규 구독자 확인 중...');
  data = await syncSubscribers(data);
  await saveSubscribers(data);

  // 2. 발송할 메시지 생성
  const text = MODE === 'news' ? await buildNewsMessage() : await buildEventsMessage();
  if (!text) {
    console.log('ℹ️  발송할 신규 항목 없음 → 발송 스킵 (구독자 목록은 갱신됨)');
    process.exit(0);
  }

  // 3. 전체 구독자에게 발송
  console.log(`📨 ${data.subscribers.length}명에게 발송 시작`);
  let ok = 0, fail = 0;
  for (const sub of data.subscribers) {
    try {
      await send(sub.chat_id, text);
      ok++;
    } catch (e) {
      fail++;
      console.warn(`  ⚠️  ${sub.name} (${sub.chat_id}) 발송 실패: ${e.message}`);
      // 403 (bot blocked by user) 인 경우 구독자에서 자동 제거
      if (e.message.includes('403') || e.message.includes('blocked')) {
        sub._remove = true;
      }
    }
  }
  console.log(`  ✅ 성공 ${ok}명 / 실패 ${fail}명`);

  // 4. 차단된 구독자 제거
  const before = data.subscribers.length;
  data.subscribers = data.subscribers.filter(s => !s._remove);
  if (data.subscribers.length < before) {
    console.log(`  🗑  차단된 구독자 ${before - data.subscribers.length}명 자동 제거`);
    await saveSubscribers(data);
  }
}

main().catch(e => {
  console.error('💥 발송 실패:', e.message);
  process.exit(0);
});
