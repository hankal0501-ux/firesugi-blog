#!/usr/bin/env python3
"""
android/app/build.gradle 에 영구 keystore signing config 자동 주입.
중복 주입 방지 (idempotent).
"""
import re
import sys

GRADLE_FILE = 'android/app/build.gradle'

with open(GRADLE_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

if 'signingConfigs' in content and 'signingConfig signingConfigs.release' in content:
    print('ℹ️  이미 signing config 적용됨 — 스킵')
    sys.exit(0)

inject_signing = """
    signingConfigs {
        release {
            storeFile file('../../keystore/release-key.jks')
            storePassword 'dysobang2026'
            keyAlias 'dy-sobang'
            keyPassword 'dysobang2026'
        }
    }
"""

# 1) 'android {' 다음 줄에 signingConfigs 블록 삽입
content = re.sub(
    r'(android\s*\{[^\n]*\n)',
    lambda m: m.group(1) + inject_signing,
    content,
    count=1
)

# 2) buildTypes.release 에 signingConfig signingConfigs.release 추가
content = re.sub(
    r'(buildTypes\s*\{\s*release\s*\{)',
    r'\1\n            signingConfig signingConfigs.release',
    content,
    count=1
)

with open(GRADLE_FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ build.gradle 패치 완료 (영구 keystore signing config 주입)')
