# 🚀 Fire-Sugi 배포 가이드

GitHub Pages에 사이트를 배포하고, 네이버 블로그(blog.naver.com/hankal0501)에 소개 글을 올리는 전체 절차입니다.

---

## ✅ 사전 준비 (완료된 항목)

- [x] git 저장소 초기화 (`.git` 폴더 생성)
- [x] git 설정 (user.email=hankal0501@gmail.com, user.name=hankal0501-ux)
- [x] main 브랜치 설정
- [x] `.gitignore` 파일 (node_modules·.claude 등 제외)
- [x] GitHub Actions 워크플로 (`.github/workflows/news-collector.yml`)
- [x] 패키지 정보 (`package.json` — fast-xml-parser 의존성)

---

## 1️⃣ GitHub 저장소 만들기 (3분)

1. https://github.com/new 접속 (로그인: hankal0501-ux)
2. **Repository name**: `firesugi-blog` (또는 원하는 이름)
3. **Public** 선택 ← Pages 무료 호스팅 위해 필수
4. ⚠️ **"Add a README" / "Add .gitignore" / "Add license" 모두 체크 해제**
5. **Create repository** 클릭

생성 후 표시되는 URL을 복사:
```
https://github.com/hankal0501-ux/firesugi-blog.git
```

---

## 2️⃣ 로컬에서 첫 커밋 + 푸시 (PowerShell에서 실행)

```powershell
cd "e:\네이버 블로그"

# 모든 파일 스테이지
git add .

# 첫 커밋
git commit -m "feat: Fire-Sugi 소방안전 블로그 초기 배포"

# 원격 저장소 연결 (위에서 만든 URL로)
git remote add origin https://github.com/hankal0501-ux/firesugi-blog.git

# 푸시
git push -u origin main
```

GitHub 인증 창이 뜨면 본인 GitHub 계정으로 로그인.

> 💡 **인증 실패 시**: GitHub은 비밀번호 대신 [Personal Access Token](https://github.com/settings/tokens) 필요. Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (repo 권한만 체크) → 생성된 토큰을 비밀번호 자리에 붙여넣기.

---

## 3️⃣ GitHub Pages 활성화 (2분)

1. GitHub 저장소 페이지 → **Settings** 탭
2. 좌측 메뉴에서 **Pages**
3. **Source**: `Deploy from a branch` 선택
4. **Branch**: `main` / `/ (root)` 선택 → **Save**
5. 1~3분 대기 후 상단에 ✅ "Your site is live at https://hankal0501-ux.github.io/firesugi-blog/" 표시

이제 그 URL이 **Fire-Sugi 사이트의 실제 주소**입니다.

---

## 4️⃣ Actions 권한 설정 (뉴스 자동수집 활성화) (1분)

1. **Settings → Actions → General**
2. 하단 **Workflow permissions**:
   - ✅ **Read and write permissions** 선택
3. **Save**
4. **Actions** 탭 → 좌측 `🤖 Daily News Collection` → **Run workflow**로 즉시 첫 실행 테스트

매일 09:00 KST 자동으로 news.json이 갱신됩니다.

---

## 5️⃣ 네이버 블로그 소개 글 작성

[NAVER-BLOG-POST.md](NAVER-BLOG-POST.md) 파일에 준비된 글 내용을 네이버 블로그 에디터에 복사·붙여넣기 → 발행.

블로그 주소: https://blog.naver.com/hankal0501

---

## 🔄 이후 업데이트 흐름

코드 수정할 때마다:
```powershell
cd "e:\네이버 블로그"
git add .
git commit -m "수정 내용 설명"
git push
```

푸시하면 GitHub Pages가 1~2분 안에 자동 재배포합니다.

---

## ⚠️ 주의사항

- **민감 파일 자동 제외**: `.gitignore`에 `node_modules/`·`.claude/`·`.env`·`*.log` 등록됨
- **localStorage 데이터**는 사이트 코드에 포함되지 않음 — 각 방문자 브라우저에만 저장
- **첫 가입자가 자동 관리자**가 되니, 본인이 먼저 회원가입하세요
- 도메인을 본인 도메인으로 바꾸려면 GitHub Pages → Custom domain 설정 (선택사항)
