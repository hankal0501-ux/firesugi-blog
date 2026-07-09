// =============================================================
// Telegram 알림 발송 — 신규 이벤트/뉴스가 있을 때만 호출
// 환경변수:
//   - mode별 기본값: TELEGRAM_BOT_TOKEN_EVENTS, TELEGRAM_CHAT_ID_EVENTS
//   - mode별 기본값: TELEGRAM_BOT_TOKEN_NEWS, TELEGRAM_CHAT_ID_NEWS
//   - 공통 폴백: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
// 인자: events | news
// 동작:
//  1. /getUpdates 폴링 → /start 보낸 새 사용자 자동 등록
//  2. subscribers/telegram.json 의 모든 chat_id 에 발송
//  3. subscribers/telegram.json 업데이트
// =============================================================
import fs from 'node:fs/promises';

const MODE = process.argv[2] || 'events';
const TOKEN = process.env[`TELEGRAM_BOT_TOKEN_${MODE.toUpperCase()}`] || process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env[`TELEGRAM_CHAT_ID_${MODE.toUpperCase()}`] || process.env.TELEGRAM_CHAT_ID;
const SUBSCRIBERS_FILE = 'subscribers/telegram.json';
// DRY_RUN=1 이면 실제 발송 없이 만들어질 메시지를 그대로 출력한다 (로컬 검증용)
const DRY_RUN = process.env.DRY_RUN === '1';

if (!TOKEN && !DRY_RUN) {
  console.log(`ℹ️  TELEGRAM_BOT_TOKEN_${MODE.toUpperCase()} 또는 TELEGRAM_BOT_TOKEN 미설정 → 발송 스킵`);
  process.exit(0);
}
console.log(`ℹ️  mode=${MODE} / using bot token ${process.env[`TELEGRAM_BOT_TOKEN_${MODE.toUpperCase()}`] ? `TELEGRAM_BOT_TOKEN_${MODE.toUpperCase()}` : 'TELEGRAM_BOT_TOKEN'} / using chat id ${process.env[`TELEGRAM_CHAT_ID_${MODE.toUpperCase()}`] ? `TELEGRAM_CHAT_ID_${MODE.toUpperCase()}` : 'TELEGRAM_CHAT_ID'}`);

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
    updates = await tgApi('getUpdates', { offset: offset + 1, timeout: 0, allowed_updates: ['message', 'my_chat_member'] });
  } catch (e) {
    console.warn('  ⚠️  getUpdates 실패:', e.message);
    return data;
  }
  if (!updates.ok || !Array.isArray(updates.result)) return data;

  const existingIds = new Set(data.subscribers.map(s => s.chat_id));
  let maxOffset = data.last_offset || 0;
  let added = 0;
  let blocked = 0;

  // 등록 개폐 스위치: telegram.json 의 registration_open === false 면 신규 등록 마감
  //  - 기존 구독자(existingIds)는 항상 유지 → 닫아도 영향 없음
  //  - 새로 접속하는 사람만 차단
  const registrationOpen = data.registration_open !== false;

  for (const upd of updates.result) {
    if (upd.update_id > maxOffset) maxOffset = upd.update_id;

    // 접속만 해도 등록: /start 뿐 아니라 (1) 아무 메시지, (2) 봇 시작·차단해제(my_chat_member) 이벤트 모두 허용
    let chat = null;
    let when = Math.floor(Date.now() / 1000);
    const msg = upd.message;
    const cm = upd.my_chat_member;
    if (msg && msg.chat) {
      chat = msg.chat;
      when = msg.date || when;
    } else if (cm && cm.chat) {
      const status = cm.new_chat_member && cm.new_chat_member.status;
      // 사용자가 봇을 시작/차단해제해서 'member' 상태가 된 경우만 (차단 'kicked' 은 제외)
      if (status === 'member') { chat = cm.chat; when = cm.date || when; }
    }
    if (!chat) continue;
    if (chat.type && chat.type !== 'private') continue; // 개인 채팅만 자동 등록 (그룹 제외)

    const chatId = chat.id;
    if (existingIds.has(chatId)) continue;
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || (chat.username ? '@' + chat.username : '익명');

    // 등록 마감 상태면 신규 차단 (기존 구독자는 위에서 이미 통과)
    if (!registrationOpen) {
      blocked++;
      existingIds.add(chatId); // 같은 실행 내 중복 안내 방지
      console.log(`  ⛔ 등록 마감 상태 → 신규 접속 차단: ${name} (${chatId})`);
      await tgApi('sendMessage', {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: `🚫 <b>현재 신규 구독 등록이 마감되었습니다.</b>\n\n추후 재개 시 다시 안내드릴게요.`
      });
      continue;
    }

    data.subscribers.push({
      chat_id: chatId,
      name,
      joined_at: new Date(when * 1000).toISOString(),
      via: 'open' // 개방 기간에 접속해 자동 등록된 구독자 표식 (기존 관리자와 구분)
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
  console.log(`  🔓 등록 ${registrationOpen ? '개방' : '마감'} 상태`);
  if (blocked > 0) console.log(`  ⛔ 마감으로 차단된 신규 접속 ${blocked}명`);
  if (added > 0) console.log(`  📊 신규 구독자 ${added}명 등록`);
  else console.log(`  ⏭  신규 구독자 없음 (총 ${data.subscribers.length}명)`);
  return data;
}

async function send(chatId, text) {
  if (DRY_RUN) {
    console.log(`\n──── DRY RUN → chat_id=${chatId} ────\n${text}\n────────────────────────────────\n`);
    return;
  }
  const res = await tgApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
  if (!res.ok) throw new Error(`API ${res.error_code || '?'}: ${res.description || 'fail'}`);
}

async function buildEventsMessage() {
  let data = { travel: [], giveaways: [] };
  try {
    data = JSON.parse(await fs.readFile('events/_new-this-run.json', 'utf8'));
  } catch {
    // 신규분 파일이 없어도 커피는 누적 목록에서 뽑아 보낸다
  }
  const travel = data.travel || [];
  const give = data.giveaways || [];

  // 커피는 "그날 신규"가 아니라 누적 목록의 최신 3건 — 신규가 없는 날에도 매일 나가야 한다
  const events = await loadEvents();
  const coffee = pickLatestCoffee(events, COFFEE_SEND_LIMIT);

  if (travel.length === 0 && give.length === 0 && coffee.length === 0) return null;

  const newCount = travel.length + give.length;
  const header = newCount > 0
    ? `🎁 <b>Fire-Sugi 신규 이벤트 ${newCount}건</b>`
    : `🎁 <b>Fire-Sugi 오늘의 이벤트</b>`;
  const lines = [header, ''];

  if (coffee.length) {
    lines.push(`☕️ <b>커피 응모 (${coffee.length}건 · 최신순)</b>`);
    coffee.forEach(it => lines.push(coffeeLine(it)));
    lines.push('');
  }
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

const COFFEE_SEND_LIMIT = 3; // 텔레그램에는 최신 커피 응모 3건만

function isCoffeeText(text) {
  const coffeeRe = /(?:커피|스타벅스|이디야|투썸|빽다방|카페베네|폴바셋|메가커피|커피빈|탐앤탐스)/i;
  const freeRe = /(?:무료|공짜|기프티콘|쿠폰|증정|할인)/i;
  return coffeeRe.test(text) && freeRe.test(text);
}

// "2026-07-09 14:03:00" → 정렬 가능한 타임스탬프
function toTime(s) {
  const t = Date.parse(String(s || '').replace(' ', 'T'));
  return isNaN(t) ? 0 : t;
}

async function loadEvents() {
  try {
    return JSON.parse(await fs.readFile('events/events.json', 'utf8'));
  } catch {
    return null;
  }
}

// collect-events.js 가 채우는 전용 coffee 카테고리에서 해외를 뺀 최신 N건.
// coffee 가 아직 비어 있으면 예전 방식(travel·giveaways 사후 필터)으로 폴백한다.
function pickLatestCoffee(events, limit) {
  if (!events) return [];

  let items = (events.coffee || []).map(it => ({
    title: it.title,
    url: it.url,
    source: it.brand || it.source_site || '',
    extra: [it.prize, it.period].filter(Boolean).join(' · '),
    region: it.region || '국내',
    created_at: it.created_at
  }));

  if (items.length === 0) {
    items = [
      ...(events.travel || []).filter(it => isCoffeeText(`${it.title} ${it.detail || ''}`)).map(it => ({
        title: it.title, url: it.url, source: it.detail || it.site || '', extra: '', region: '국내', created_at: it.created_at
      })),
      ...(events.giveaways || []).filter(it => isCoffeeText(`${it.title} ${it.source_site || ''} ${it.prize || ''}`)).map(it => ({
        title: it.title, url: it.url, source: it.source_site || '', extra: [it.prize, it.period].filter(Boolean).join(' · '), region: '국내', created_at: it.created_at
      }))
    ];
  }

  return items
    .filter(it => it.region !== '해외')
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at))
    .slice(0, limit);
}

function coffeeLine(it) {
  const title = esc(it.title).slice(0, 80);
  const src = esc(it.source || '');
  const extra = esc(it.extra || '');
  return `• <a href="${esc(it.url)}">${title}</a>${src ? ` <i>(${src})</i>` : ''}${extra ? ` <i>${extra}</i>` : ''}`;
}

async function buildCoffeeMessage() {
  const picked = pickLatestCoffee(await loadEvents(), COFFEE_SEND_LIMIT);
  if (picked.length === 0) return null;

  const lines = [`☕️ <b>Fire-Sugi 커피 응모 ${picked.length}건</b> <i>(최신순)</i>`, ''];
  picked.forEach(it => lines.push(coffeeLine(it)));
  return lines.join('\n').trim();
}

function buildTestMessage() {
  const userMessage = process.argv[3] || '🧪 <b>텔레그램 테스트 메시지입니다.</b>\n이 메시지가 도착하면 텔레그램 알림이 정상 작동합니다.';
  const lines = [
    '🧪 <b>Fire-Sugi Telegram 테스트</b>',
    '',
    esc(userMessage),
    '',
    `<i>mode=${MODE} · time=${new Date().toISOString()}</i>`
  ];
  return lines.join('\n');
}

async function main() {
  if (MODE === 'test') {
    if (!ADMIN_CHAT_ID) {
      console.log('ℹ️  TELEGRAM_CHAT_ID_TEST 또는 TELEGRAM_CHAT_ID 미설정 → 테스트 발송 불가');
      process.exit(0);
    }
    const text = buildTestMessage();
    console.log('📨 테스트 메시지 발송 중...');
    await send(ADMIN_CHAT_ID, text);
    console.log('✅ 테스트 메시지 발송 완료');
    process.exit(0);
  }

  if (MODE === 'coffee') {
    const text = await buildCoffeeMessage();
    if (!text) {
      console.log('ℹ️  커피 이벤트가 없습니다. 발송 스킵');
      process.exit(0);
    }
    console.log('📨 커피 이벤트 메시지 발송 중...');
    await send(ADMIN_CHAT_ID || (DRY_RUN ? 'dry' : (await loadSubscribers()).subscribers[0]?.chat_id), text);
    console.log('✅ 커피 이벤트 메시지 발송 완료');
    process.exit(0);
  }

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
