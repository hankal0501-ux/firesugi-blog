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

    // 본 기기의 데이터도 Firestore로 푸시 (양방향 sync 보장)
    await fbPushAllUsers(mergedUsers);
    await fbPushAllPosts(mergedPosts);
    console.log('🔥 로컬 데이터 Firestore에 푸시 완료');
  } catch (e) {
    console.error('🔥 Firebase 동기화 실패:', e);
  }
}

// 페이지 로드 시 자동 동기화 (다른 init 끝난 후)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initFirebaseSync, 800);
});

// 30초마다 자동 재동기화 (가벼운 풀)
setInterval(() => {
  if (document.visibilityState === 'visible') {
    initFirebaseSync();
  }
}, 30000);
