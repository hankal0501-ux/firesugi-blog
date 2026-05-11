# 🤖 GitHub Actions 뉴스 자동수집 설정 가이드

매일 아침 09:00 (KST)에 GitHub Actions가 자동으로 실행되어 **주제별 1건씩(총 3건)** 뉴스를 수집합니다.

## 수집 주제

| 토픽 | 키워드 | 색상 |
|------|--------|------|
| 🚀 최신기술 | 소방 신기술, AI 화재, 스마트 소방, 자동화재탐지 신기술 | 파랑 |
| 📚 논문·연구 | 화재 연구, 한국화재소방학회, 화재공학 논문, 방재 연구 | 보라 |
| ⚖️ 사고·처벌 | 화재 사고 처벌, 소방 위반 벌금, 안전관리자 처벌, 화재 과실 판결 | 빨강 |

---

## 1단계 — GitHub 저장소 생성

1. https://github.com/new 접속
2. **Repository name**: `fire-sugi-blog` (또는 원하는 이름)
3. **Public** 선택 (Private도 가능하지만 GitHub Pages는 Public + Pro 필요)
4. **Create repository** 클릭

## 2단계 — 로컬 폴더를 GitHub에 푸시

PowerShell에서 프로젝트 폴더로 이동 후:

```powershell
cd "e:\네이버 블로그"
git init
git branch -M main
git add .
git commit -m "feat: Fire-Sugi 초기 커밋 + 자동수집 설정"
git remote add origin https://github.com/<YOUR-USERNAME>/fire-sugi-blog.git
git push -u origin main
```

> ⚠️ `<YOUR-USERNAME>` 자리에 본인 GitHub 아이디 입력

## 3단계 — Actions 권한 확인

1. GitHub 저장소 페이지 → **Settings** → **Actions** → **General**
2. 하단 **Workflow permissions** 에서 다음 선택:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
3. **Save**

## 4단계 — 첫 실행 (수동 트리거)

1. **Actions** 탭 → 좌측 `🤖 Daily News Collection` 클릭
2. 우측 **Run workflow** 버튼 → **Run workflow** 클릭
3. 약 30~60초 후 완료. 로그에서 수집 결과 확인:
   ```
   ✅ [최신기술] AI 화재 감지 시스템 ...
   ✅ [논문연구] 한국화재소방학회 ...
   ✅ [사고처벌] 안전관리자 벌금 ...
   ✅ 신규 3건 추가 / 전체 3건
   ```
4. 저장소 루트에 `news.json` 이 자동 커밋됩니다.

## 5단계 — 사이트 호스팅 (GitHub Pages)

1. **Settings** → **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `/ (root)` 선택 → **Save**
4. 1~2분 후 `https://<YOUR-USERNAME>.github.io/fire-sugi-blog/` 접속 가능

## 6단계 — 자동 갱신 확인

이후 매일 09:00 (KST)에 자동 실행됩니다.
- **Actions** 탭에서 실행 이력 확인
- 사이트 새로고침하면 [script.js:fetchRemoteNews](script.js)가 `news.json`을 읽어 신규 항목을 localStorage에 동기화

---

## 🔧 커스터마이징

### 검색어 변경

[scripts/collect-news.js](scripts/collect-news.js) 의 `TOPICS` 배열 수정:

```js
const TOPICS = [
  {
    key: '최신기술',
    emoji: '🚀',
    color: '#0068c3',
    query: '"소방 신기술" OR "스마트 소방" OR ...'  // ← 검색어 추가/변경
  },
  ...
];
```

### 실행 시간 변경

[.github/workflows/news-collector.yml](.github/workflows/news-collector.yml) 의 cron 변경:

```yaml
- cron: '0 0 * * *'   # 매일 09:00 KST (= 00:00 UTC)
- cron: '0 21 * * *'  # 매일 06:00 KST (= 21:00 UTC 전날)
- cron: '0 */6 * * *' # 6시간마다
```

### 토픽 추가/제거

3개 → 5개로 늘리려면 `TOPICS` 배열에 항목 추가:

```js
{ key: '국제동향', emoji: '🌐', color: '#02a64a',
  query: '"NFPA" OR "ISO 화재안전" OR "international fire code"' }
```

그리고 [script.js](script.js) 의 `TOPIC_META` 객체와 [index.html](index.html) 의 필터 탭에도 동일하게 추가.

### 로컬 테스트

PowerShell:
```powershell
npm install
npm run collect
```
실행 후 `news.json` 확인.

---

## ⚠️ 주의사항

- **Google News RSS**는 공식 API가 아니라 변경/중단 가능성 있음. 작동 중지 시 [scripts/collect-news.js](scripts/collect-news.js) 의 `GNEWS_BASE` 부분을 다른 RSS 소스로 교체
- **링크는 Google News를 거쳐 원문으로 redirect** 됩니다 (직접 URL 추출은 추가 작업 필요)
- 무료 GitHub Actions 한도: Public 저장소는 **무제한**. Private은 월 2,000분 제공 (이 작업은 1회당 약 1분 사용 → 한 달 약 30분만 소비)

## 🐛 문제 해결

| 증상 | 해결 |
|------|------|
| Action 실행 시 `permission denied` | 3단계 권한 설정 다시 확인 |
| `news.json` 변경 없음 | 수집한 URL이 모두 기존 항목과 중복 — 검색어 확장 또는 다음날 대기 |
| 사이트에 신규 항목 안 보임 | 브라우저 캐시 무효화 (Ctrl+Shift+R), localStorage `fireSugiNews` 키 삭제 후 재방문 |
| `file://` 로 열어 작동 안 함 | GitHub Pages 또는 로컬 서버(`python -m http.server`)로 열기 |
