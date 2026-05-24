// ===================================================================
// Firebase 동기화 레이어 — Firestore로 회원·게시글 통합
// ===================================================================
const firebaseConfig = {
  apiKey: "AIzaSyABC5Wb0p_eQd47tGVhFVx3RwS1H5n8zNw",
  authDomain: "firesugi-blog.firebaseapp.com",
  projectId: "firesugi-blog",
  storageBucket: "firesugi-blog.firebasestorage.app",
  messagingSenderId: "570063725085",
  appId: "1:570063725085:web:3702eb49732e71a059dcf4",
  measurementId: "G-YTN0733424"
};

firebase.initializeApp(firebaseConfig);
const fbDb = firebase.firestore();
let fbSyncReady = true;

// ===== 회원 동기화 =====
async function fbPushUser(user) {
  if (!fbSyncReady || !user || !user.id) return;
  try {
    // 비밀번호는 동기화 안 함 (보안)
    const { pw, ...safe } = user;
    safe.id = user.id;
    safe.syncedAt = Date.now();
    await fbDb.collection('users').doc(user.id).set(safe, { merge: true });
  } catch (e) {
    console.warn('🔥 fbPushUser 실패:', user.id, e.message);
  }
}

async function fbPushAllUsers(users) {
  if (!fbSyncReady || !Array.isArray(users)) return;
  for (const u of users) {
    if (u && u.id && !u.id.toLowerCase().includes('bot')) {
      await fbPushUser(u);
    }
  }
}

async function fbPullUsers() {
  if (!fbSyncReady) return [];
  try {
    const snap = await fbDb.collection('users').get();
    const users = [];
    snap.forEach(doc => users.push(doc.data()));
    return users;
  } catch (e) {
    console.warn('🔥 fbPullUsers 실패:', e.message);
    return [];
  }
}

async function fbDeleteUser(userId) {
  if (!fbSyncReady || !userId) return;
  try {
    await fbDb.collection('users').doc(userId).delete();
  } catch (e) {
    console.warn('🔥 fbDeleteUser 실패:', userId, e.message);
  }
}

// ===== 게시글 동기화 =====
async function fbPushPost(post) {
  if (!fbSyncReady || !post || !post.id) return;
  try {
    const data = { ...post, id: String(post.id), syncedAt: Date.now() };
    await fbDb.collection('posts').doc(String(post.id)).set(data, { merge: true });
  } catch (e) {
    console.warn('🔥 fbPushPost 실패:', post.id, e.message);
  }
}

async function fbPushAllPosts(posts) {
  if (!fbSyncReady || !Array.isArray(posts)) return;
  for (const p of posts) {
    if (p && p.id) await fbPushPost(p);
  }
}

async function fbPullPosts() {
  if (!fbSyncReady) return [];
  try {
    const snap = await fbDb.collection('posts').get();
    const posts = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data.id) {
        data.id = Number(data.id) || data.id;  // 원래 number였으면 복원
        posts.push(data);
      }
    });
    return posts;
  } catch (e) {
    console.warn('🔥 fbPullPosts 실패:', e.message);
    return [];
  }
}

async function fbDeletePost(postId) {
  if (!fbSyncReady || !postId) return;
  try {
    await fbDb.collection('posts').doc(String(postId)).delete();
  } catch (e) {
    console.warn('🔥 fbDeletePost 실패:', postId, e.message);
  }
}

// ===== 활동 로그 동기화 =====
async function fbPushLogs(logs) {
  if (!fbSyncReady || !Array.isArray(logs)) return;
  try {
    // 배치로 한 번에 쓰기 (각 로그 = 하나의 문서)
    const batch = fbDb.batch();
    const recent = logs.slice(-100);  // 최근 100건만 동기화 (Firestore 비용 절약)
    recent.forEach(log => {
      if (!log.ts) return;
      const docRef = fbDb.collection('accessLogs').doc(String(log.ts) + '_' + (log.id || 'anon'));
      batch.set(docRef, log, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.warn('🔥 fbPushLogs 실패:', e.message);
  }
}

async function fbPullLogs() {
  if (!fbSyncReady) return [];
  try {
    // 최근 7일 로그만 (300건 한도)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const snap = await fbDb.collection('accessLogs')
      .where('ts', '>=', weekAgo)
      .limit(300).get();
    const logs = [];
    snap.forEach(doc => logs.push(doc.data()));
    return logs.sort((a, b) => a.ts - b.ts);
  } catch (e) {
    console.warn('🔥 fbPullLogs 실패:', e.message);
    return [];
  }
}

// ===== 익명 방문 동기화 =====
async function fbPushAnonVisits(visits) {
  if (!fbSyncReady || !Array.isArray(visits)) return;
  try {
    const batch = fbDb.batch();
    const recent = visits.slice(-100);
    recent.forEach(v => {
      if (!v.ts) return;
      const docRef = fbDb.collection('anonVisits').doc(String(v.ts) + '_' + (v.anonId || 'unknown'));
      batch.set(docRef, v, { merge: true });
    });
    await batch.commit();
  } catch (e) {
    console.warn('🔥 fbPushAnonVisits 실패:', e.message);
  }
}

async function fbPullAnonVisits() {
  if (!fbSyncReady) return [];
  try {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const snap = await fbDb.collection('anonVisits')
      .where('ts', '>=', weekAgo)
      .limit(500).get();
    const visits = [];
    snap.forEach(doc => visits.push(doc.data()));
    return visits.sort((a, b) => a.ts - b.ts);
  } catch (e) {
    console.warn('🔥 fbPullAnonVisits 실패:', e.message);
    return [];
  }
}

// ===== 초기 동기화 — 페이지 로드 시 Firestore에서 받아서 localStorage에 병합 =====
async function initFirebaseSync() {
  console.log('🔥 Firebase 동기화 시작...');
  try {
    // ─ 회원 동기화 ─
    const remoteUsers = await fbPullUsers();
    const localUsers = JSON.parse(localStorage.getItem('fireSugiUsers') || '[]');
    const userMap = new Map();
    localUsers.forEach(u => userMap.set(u.id, u));
    remoteUsers.forEach(r => {
      const existing = userMap.get(r.id);
      // local에 있으면 pw 보존, Firestore의 최신 메타데이터 덮어쓰기
      if (existing) {
        userMap.set(r.id, { ...existing, ...r, pw: existing.pw || '__no_pw__' });
      } else {
        // 새로 들어온 사용자 — pw는 알 수 없으므로 임시값 (해당 기기에서는 로그인 불가)
        userMap.set(r.id, { ...r, pw: '__remote_no_pw__' });
      }
    });
    const mergedUsers = Array.from(userMap.values());
    localStorage.setItem('fireSugiUsers', JSON.stringify(mergedUsers));

    // ─ 게시글 동기화 ─
    const remotePosts = await fbPullPosts();
    const localPosts = JSON.parse(localStorage.getItem('fireSugiBoardPosts') || '[]');
    const postMap = new Map();
    localPosts.forEach(p => postMap.set(String(p.id), p));
    remotePosts.forEach(p => postMap.set(String(p.id), p));
    const mergedPosts = Array.from(postMap.values()).sort((a, b) => b.id - a.id);
    localStorage.setItem('fireSugiBoardPosts', JSON.stringify(mergedPosts));

    console.log(`🔥 동기화 완료: 회원 ${mergedUsers.length}명, 게시글 ${mergedPosts.length}건`);

    // 화면 새로고침
    if (typeof renderBoard === 'function') renderBoard();
    if (typeof renderHomeBoard === 'function') renderHomeBoard();
    if (typeof renderMembers === 'function') renderMembers();
    if (typeof updateAuthUI === 'function') updateAuthUI();

    // ─ 활동 로그 동기화 ─
    const remoteLogs = await fbPullLogs();
    const localLogs = JSON.parse(localStorage.getItem('fireSugiAccessLogs') || '[]');
    const logMap = new Map();
    localLogs.forEach(l => logMap.set(l.ts + '_' + (l.id || 'anon'), l));
    remoteLogs.forEach(l => logMap.set(l.ts + '_' + (l.id || 'anon'), l));
    const mergedLogs = Array.from(logMap.values()).sort((a, b) => a.ts - b.ts).slice(-500);
    localStorage.setItem('fireSugiAccessLogs', JSON.stringify(mergedLogs));

    // ─ 익명 방문 동기화 ─
    const remoteAnons = await fbPullAnonVisits();
    const localAnons = JSON.parse(localStorage.getItem('fireSugiAnonVisits') || '[]');
    const anonMap = new Map();
    localAnons.forEach(a => anonMap.set(a.ts + '_' + (a.anonId || 'x'), a));
    remoteAnons.forEach(a => anonMap.set(a.ts + '_' + (a.anonId || 'x'), a));
    const mergedAnons = Array.from(anonMap.values()).sort((a, b) => a.ts - b.ts).slice(-500);
    localStorage.setItem('fireSugiAnonVisits', JSON.stringify(mergedAnons));

    console.log(`🔥 추가 동기화: 로그 ${mergedLogs.length}건, 익명방문 ${mergedAnons.length}건`);

    // ─ 사용자 추가 프로그램 동기화 ─
    try {
      const upSnap = await fbDb.collection('userPrograms').get();
      const remoteUserProgs = {};
      upSnap.forEach(doc => { remoteUserProgs[doc.id] = doc.data(); });
      const localUserProgs = JSON.parse(localStorage.getItem('fireSugiUserPrograms') || '{}');
      const mergedUserProgs = { ...localUserProgs, ...remoteUserProgs };
      localStorage.setItem('fireSugiUserPrograms', JSON.stringify(mergedUserProgs));
      // programData에 머지
      if (typeof programData !== 'undefined') Object.assign(programData, mergedUserProgs);
      console.log(`🔥 사용자 추가 프로그램: ${Object.keys(mergedUserProgs).length}건`);
      if (typeof renderPrograms === 'function') renderPrograms();
    } catch (e) { console.warn('userPrograms sync 실패:', e.message); }

    // 본 기기의 데이터도 Firestore로 푸시 (양방향 sync 보장)
    await fbPushAllUsers(mergedUsers);
    await fbPushAllPosts(mergedPosts);
    await fbPushLogs(mergedLogs);
    await fbPushAnonVisits(mergedAnons);
    console.log('🔥 로컬 데이터 Firestore에 푸시 완료');

    // 접속상황판 새로고침
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch (e) {
    console.error('🔥 Firebase 동기화 실패:', e);
  }
}

// 관리자용: 사이트에서 직접 Firebase 상태 확인 (F12 없이)
async function showFirebaseStatus() {
  const host = document.getElementById('firebaseStatus');
  if (!host) return alert('상태 패널을 찾을 수 없습니다.');
  host.innerHTML = '<p style="color:var(--text-muted);">🔄 연결 중...</p>';

  const result = {
    sdkLoaded: typeof firebase !== 'undefined',
    initialized: false,
    canRead: false,
    canWrite: false,
    remoteUsers: 0,
    remotePosts: 0,
    localUsers: 0,
    localPosts: 0,
    error: null
  };

  try {
    result.initialized = !!(firebase && firebase.apps && firebase.apps.length);

    // 읽기 테스트
    const usersSnap = await fbDb.collection('users').get();
    result.remoteUsers = usersSnap.size;
    result.canRead = true;

    const postsSnap = await fbDb.collection('posts').get();
    result.remotePosts = postsSnap.size;

    // 쓰기 테스트 (테스트 문서 작성·삭제)
    const testDoc = fbDb.collection('_test').doc('ping');
    await testDoc.set({ ts: Date.now() });
    await testDoc.delete();
    result.canWrite = true;
  } catch (e) {
    result.error = e.message;
  }

  result.localUsers = (JSON.parse(localStorage.getItem('fireSugiUsers') || '[]')).length;
  result.localPosts = (JSON.parse(localStorage.getItem('fireSugiBoardPosts') || '[]')).length;

  const ok = (cond) => cond ? '<span style="color:#02a64a;font-weight:800;">✅ 정상</span>'
                            : '<span style="color:#c93030;font-weight:800;">❌ 실패</span>';

  host.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="padding:4px 0; width:140px;">📦 SDK 로드</td><td>${ok(result.sdkLoaded)}</td></tr>
      <tr><td style="padding:4px 0;">🚀 앱 초기화</td><td>${ok(result.initialized)}</td></tr>
      <tr><td style="padding:4px 0;">📥 읽기 권한</td><td>${ok(result.canRead)}</td></tr>
      <tr><td style="padding:4px 0;">📤 쓰기 권한</td><td>${ok(result.canWrite)}</td></tr>
      <tr><td colspan="2" style="padding:8px 0; border-top:1px dashed #ccc;"></td></tr>
      <tr><td style="padding:4px 0;">📊 원격 회원</td><td><b>${result.remoteUsers}명</b></td></tr>
      <tr><td style="padding:4px 0;">📊 원격 게시글</td><td><b>${result.remotePosts}건</b></td></tr>
      <tr><td style="padding:4px 0;">💾 로컬 회원</td><td><b>${result.localUsers}명</b></td></tr>
      <tr><td style="padding:4px 0;">💾 로컬 게시글</td><td><b>${result.localPosts}건</b></td></tr>
      ${result.error ? `<tr><td colspan="2" style="padding:8px; background:#fee; color:#c93030; border-radius:4px; margin-top:6px;">⚠️ 오류: ${result.error}</td></tr>` : ''}
    </table>
    <div style="margin-top:14px; display:flex; gap:6px; flex-wrap:wrap;">
      <button class="btn btn-outline btn-sm" onclick="initFirebaseSync(); setTimeout(showFirebaseStatus, 2000);">🔄 즉시 동기화</button>
      <a class="btn btn-outline btn-sm" href="https://console.firebase.google.com/project/firesugi-blog/firestore/data" target="_blank" style="text-decoration:none;">🔗 Firestore 콘솔</a>
    </div>
    ${result.canRead && result.canWrite ?
      '<p style="color:#02a64a; margin-top:10px; font-weight:700;">✅ Firebase 통합 DB 정상 작동 중! 다른 기기에서 가입한 회원도 자동으로 보입니다.</p>' :
      '<p style="color:#c93030; margin-top:10px;">⚠️ Firebase 연결 문제 — 보안 규칙 확인 필요</p>'}
  `;
}

// 🔥 자동 동기화 재활성화 (할당량 안전 모드)
// - 페이지 로드 시 1회 sync (1.5초 후)
// - 이후 5분(300초)마다 sync (이전: 30초 → 10배 감소로 quota 절감)
// - 가시 상태일 때만 실행
// - 일 예상 호출: 약 288회 × 8 ops/cycle ≈ 2,300 ops (Spark 한도 50K 안에 충분)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initFirebaseSync, 1500);
});
setInterval(() => {
  if (document.visibilityState === 'visible') {
    initFirebaseSync();
  }
}, 300000); // 5분
console.log('🔥 Firebase 자동 sync 활성화 (5분 주기, 가시 상태일 때만)');
