#!/bin/bash
# bump-version.sh
# 사용법: ./scripts/bump-version.sh 1.1.0 "사업장 자동완성 추가, 버그 수정"
# 한 번에 모든 파일의 버전을 동기화합니다.

set -e

if [ -z "$1" ]; then
  echo "사용법: $0 <새버전> [변경사항 메모]"
  echo "예시:   $0 1.1.0 '사업장 자동완성 추가'"
  exit 1
fi

NEW_VERSION="$1"
NOTES="${2:-새 버전}"
RELEASED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Validate version format (semver: X.Y.Z)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "❌ 버전 형식 오류 (X.Y.Z 형식이어야 함): $NEW_VERSION"
  exit 1
fi

# Calculate Android versionCode (X*10000 + Y*100 + Z)
IFS='.' read -r MAJOR MINOR PATCH <<< "$NEW_VERSION"
VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))

echo "📝 버전을 v${NEW_VERSION} (code=${VERSION_CODE}) 으로 변경합니다..."

# 1) www/index.html — APP_VERSION 상수
HTML="${PROJECT_ROOT}/www/index.html"
if [ -f "$HTML" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${NEW_VERSION}'/" "$HTML"
  else
    sed -i "s/const APP_VERSION = '[^']*'/const APP_VERSION = '${NEW_VERSION}'/" "$HTML"
  fi
  echo "  ✅ www/index.html"
else
  echo "  ⚠️  www/index.html 없음"
fi

# 2) package.json — "version"
PKG="${PROJECT_ROOT}/package.json"
if [ -f "$PKG" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$PKG"
  else
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" "$PKG"
  fi
  echo "  ✅ package.json"
fi

# 3) android/app/build.gradle — versionCode + versionName
GRADLE="${PROJECT_ROOT}/android/app/build.gradle"
if [ -f "$GRADLE" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/versionCode [0-9]*/versionCode ${VERSION_CODE}/" "$GRADLE"
    sed -i '' "s/versionName \"[^\"]*\"/versionName \"${NEW_VERSION}\"/" "$GRADLE"
  else
    sed -i "s/versionCode [0-9]*/versionCode ${VERSION_CODE}/" "$GRADLE"
    sed -i "s/versionName \"[^\"]*\"/versionName \"${NEW_VERSION}\"/" "$GRADLE"
  fi
  echo "  ✅ android/app/build.gradle"
else
  echo "  ℹ️  android/ 폴더 없음 (npx cap add android 먼저 실행)"
fi

# 4) homepage-files/version.json — 홈페이지에 업로드할 파일
VJSON="${PROJECT_ROOT}/homepage-files/version.json"
mkdir -p "$(dirname "$VJSON")"

# Try to read APK URL pattern from existing version.json (preserve domain)
EXISTING_URL_BASE=""
if [ -f "$VJSON" ]; then
  EXISTING_URL_BASE=$(grep -oE '"https?://[^"]+/dy-sobang/' "$VJSON" | head -1 | tr -d '"' || true)
fi
URL_BASE="${EXISTING_URL_BASE:-https://hankal0501-ux.github.io/firesugi-blog/dy-sobang/}"
APK_URL="${URL_BASE}dy-sobang-fieldlog-${NEW_VERSION}.apk"

cat > "$VJSON" <<EOF
{
  "latest": "${NEW_VERSION}",
  "url": "${APK_URL}",
  "notes": $(printf '%s' "$NOTES" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))"),
  "force": false,
  "minSupportedVersion": "1.0.0",
  "releasedAt": "${RELEASED_AT}"
}
EOF
echo "  ✅ homepage-files/version.json (APK URL: ${APK_URL})"

echo ""
echo "🎉 버전 v${NEW_VERSION} 준비 완료"
echo ""
echo "다음 단계:"
echo "  1) npx cap sync"
echo "  2) cd android && ./gradlew assembleRelease"
echo "  3) APK 이름 변경: mv app/build/outputs/apk/release/app-release.apk \\"
echo "                       app/build/outputs/apk/release/dy-sobang-fieldlog-${NEW_VERSION}.apk"
echo "  4) 홈페이지에 업로드:"
echo "     - dy-sobang-fieldlog-${NEW_VERSION}.apk → ${URL_BASE}"
echo "     - homepage-files/version.json → 같은 폴더 (이전 version.json 덮어쓰기)"
echo ""
echo "  → 모든 사용자 폰의 앱이 다음 실행 시 자동으로 업데이트 알림을 봅니다."
