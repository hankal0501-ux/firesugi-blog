# 대영소방 현장기록 (DY-SOBANG Field Log)

소방시설 점검 현장에서 **사진 + 음성 메모**를 즉시 기록하는 안드로이드 앱.

## 구성

- **프레임워크**: Capacitor 6 (Web → Native APK 래퍼)
- **저장소**: IndexedDB (폰 로컬, 오프라인 OK)
- **음성인식**: 네이티브 한국어 STT (`@capacitor-community/speech-recognition`)
- **카메라**: HTML5 `<input capture>` → 안드로이드 기본 카메라 호출
- **공유/내보내기**: Capacitor Share API → 카톡·메일·드라이브로 즉시 전송

## 사전 요구사항 (Mac Mini 기준 1회만)

```bash
# 1) Node.js 20+
brew install node

# 2) Java 17 (Capacitor 6 요구)
brew install --cask temurin@17

# 3) Android Studio (또는 명령줄 도구만)
brew install --cask android-studio
# 첫 실행 → SDK Manager → Android SDK Platform 34, Build-Tools 34.0.0 설치
```

환경변수 (~/.zshrc):
```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
```

## 빌드 (4단계 · 첫 빌드 ~15분, 이후 ~30초)

```bash
cd dy-sobang-fieldlog

# 1) 패키지 설치
npm install

# 2) 안드로이드 플랫폼 추가 (최초 1회)
npx cap add android

# 3) 웹 자산 동기화
npx cap sync

# 4) APK 빌드
cd android && ./gradlew assembleDebug
```

→ APK 위치: `android/app/build/outputs/apk/debug/app-debug.apk`

### Android Studio GUI로 빌드 (대안)
```bash
npx cap open android
# Android Studio 열림 → Build > Build Bundle(s)/APK(s) > Build APK(s)
```

## 자동 업데이트 워크플로우 ⭐

이 앱은 시작할 때 홈페이지의 `version.json`을 조회해서 새 버전이 있으면 사용자에게 자동으로 알립니다. APK를 카톡으로 다시 보낼 필요 없습니다.

### 작동 방식

```
앱 실행 (직원 폰)
   ↓
2초 후 백그라운드에서 version.json 조회
   ↓
APP_VERSION < version.json.latest ?
   ↓ YES
업데이트 모달 표시 (변경사항 + "지금 업데이트" 버튼)
   ↓ 탭
시스템 브라우저 열림 → APK 자동 다운로드
   ↓
다운로드 알림 탭 → 위에 덮어쓰기 설치
   ↓
데이터(IndexedDB) 유지된 채로 새 버전 실행 ✅
```

### 최초 1회 설정

1. `www/index.html` 파일 상단의 `UPDATE_CHECK_URL`을 본인 홈페이지 URL로 변경:
   ```js
   const UPDATE_CHECK_URL = 'https://daeyoung-sobang.com/dy-sobang/version.json';
   ```

2. 홈페이지에 `/dy-sobang/` 폴더 만들고 다음 파일 업로드:
   - `version.json` (homepage-files/version.json 템플릿 참고)
   - `index.html` (선택, 다운로드 페이지)
   - `dy-sobang-fieldlog-1.0.0.apk` (실제 APK)

3. `version.json` 안의 URL을 본인 도메인으로 수정.

### 새 버전 출시 시 (3단계, 5분)

```bash
# 1) 버전 자동 동기화 (HTML/gradle/version.json 모두)
./scripts/bump-version.sh 1.1.0 "사업장 자동완성, 음성인식 안정성 개선"

# 2) APK 빌드
npx cap sync
cd android && ./gradlew assembleRelease
mv app/build/outputs/apk/release/app-release.apk \
   app/build/outputs/apk/release/dy-sobang-fieldlog-1.1.0.apk
cd ..

# 3) 홈페이지 업로드
#    - dy-sobang-fieldlog-1.1.0.apk → 홈페이지 /dy-sobang/ 폴더
#    - homepage-files/version.json → 같은 폴더 (덮어쓰기)
```

→ 끝. 직원 5명 모두 다음에 앱 켰을 때 자동 알림.

### 강제 업데이트 (긴급 패치)

`version.json`의 `"force": true`로 설정하면 "나중에" 버튼이 사라져서 반드시 업데이트해야 사용 가능:

```json
{
  "latest": "1.2.1",
  "url": "...",
  "notes": "⚠️ 데이터 손실 버그 긴급 패치",
  "force": true
}
```

### 홈페이지 폴더 구조 예시

```
your-homepage.com/
└── dy-sobang/
    ├── index.html                          ← 다운로드 안내 페이지 (선택)
    ├── version.json                        ← 자동 업데이트 정보 (필수)
    ├── dy-sobang-fieldlog-1.0.0.apk        ← 이전 버전들 유지 가능
    ├── dy-sobang-fieldlog-1.1.0.apk
    └── dy-sobang-fieldlog-1.1.1.apk        ← 최신 버전
```

### 자동 업데이트 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 업데이트 모달 안 뜸 | URL 미설정 (`YOUR-DOMAIN` 그대로) | `www/index.html`의 `UPDATE_CHECK_URL` 수정 |
| "업데이트 확인 실패" 토스트 | 홈페이지 HTTP·CORS 차단 | HTTPS 사용 + CORS 헤더 `Access-Control-Allow-Origin: *` |
| APK 다운로드 안 됨 | Chrome이 "위험한 파일" 차단 | Chrome 다운로드창에서 "유지" 탭 |
| 새 APK 설치 시 "패키지 충돌" | versionCode가 같음 | `bump-version.sh`로 정상 빌드 (versionCode 자동 증가) |
| 데이터가 사라짐 | 앱 ID 변경됨 | `capacitor.config.json`의 `appId` 절대 변경하지 말 것 |

### 수동 업데이트 확인

직원이 강제로 확인하고 싶으면: **앱 상단의 노란색 `DY-SOBANG · FIELD LOG · v1.0.0` 텍스트를 탭** → 즉시 업데이트 체크.

## 5명에게 첫 배포 (v1.0.0 설치)

자동 업데이트는 이미 설치된 사용자에게만 작동합니다. 첫 설치는 한 번 수동으로 해야 합니다.

### 방법 A: 카톡으로 직접 전송 (가장 빠름)
1. APK 파일을 카카오톡 그룹채팅에 업로드
2. 각 직원 폰에서: 카톡으로 받은 APK 탭
3. "출처를 알 수 없는 앱" 허용 → 설치
4. 첫 실행 시 권한 허용: 카메라 · 마이크 · 위치

### 방법 B: QR 코드 다운로드
1. APK를 본인 서버(Mac Mini)에 업로드 → https://your-mac-mini.local/app.apk
2. URL을 QR 코드로 만들어 인쇄 (qr-code-generator.com)
3. 직원이 QR 스캔 → 다운로드 → 설치

### 방법 C: Firebase App Distribution (관리형)
- Google 계정 필요, 비공개 베타 트랙
- 추후 버전 업데이트 푸시 자동화 가능

## 권한 처리

`android/app/src/main/AndroidManifest.xml`에 자동 추가됨 (cap sync 시):

```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.INTERNET"/>
```

수동 추가 필요 시 위 항목을 `<manifest>` 태그 안에 붙여넣기.

## 릴리스 빌드 (서명된 APK)

```bash
# 1) Keystore 생성 (1회만)
keytool -genkey -v -keystore dy-sobang.keystore \
  -alias dy-sobang -keyalg RSA -keysize 2048 -validity 10000

# 2) android/key.properties 생성
cat > android/key.properties <<EOF
storePassword=YOUR_PASSWORD
keyPassword=YOUR_PASSWORD
keyAlias=dy-sobang
storeFile=../../dy-sobang.keystore
EOF

# 3) android/app/build.gradle 에 signingConfigs 추가 (Capacitor 문서 참고)

# 4) 릴리스 빌드
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## 아이콘 변경

기본 Capacitor 아이콘이 들어가 있음. 변경하려면:

```bash
npm install -D @capacitor/assets
# 1024×1024 PNG → resources/icon.png 에 저장
# 1024×1024 PNG (배경) → resources/splash.png 저장
npx capacitor-assets generate --android
```

## 폴더 구조

```
dy-sobang-fieldlog/
├── package.json              # Capacitor 의존성
├── capacitor.config.json     # 앱 ID, 이름, 플러그인 설정
├── www/
│   └── index.html            # 앱 본체 (HTML + JS + CSS 단일파일)
├── android/                  # `cap add android` 시 자동 생성
│   └── app/build/outputs/apk/debug/app-debug.apk  # 빌드 결과물
└── README.md
```

## 백엔드 연동 (다음 단계)

내보낸 JSON을 Flask 백엔드로 보내 점검지적내역서 자동 생성:

```js
// www/index.html 에 추가 예정
async function uploadToBackend(records) {
  const res = await fetch('https://your-backend.com/api/field-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, inspector: '이명수' })
  });
  return res.json();  // → Claude Vision이 처리한 지적내역서 URL
}
```

기존 에코델타 호반써밋 점검지적내역서 자동화 파이프라인에 그대로 연결 가능.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `gradlew: command not found` | 권한 없음 | `chmod +x android/gradlew` |
| `SDK location not found` | ANDROID_HOME 미설정 | `android/local.properties`에 `sdk.dir=/Users/you/Library/Android/sdk` |
| 마이크 권한 무한루프 | 권한 거부 후 재요청 차단 | 폰 설정 → 앱 → 권한에서 수동 허용 |
| 카메라 화면 검정 | `captureInput: true` 누락 | `capacitor.config.json` 확인 |
| 빌드 시 Java 버전 오류 | JDK 8/11 사용 중 | `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` |

## 라이선스

내부 사용. 외부 배포 금지.
