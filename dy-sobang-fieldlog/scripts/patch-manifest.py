#!/usr/bin/env python3
"""
android/app/src/main/AndroidManifest.xml 에 위치 권한 강제 주입.
@capacitor/geolocation 자동 병합이 실패하는 경우 대비.
"""
import re
import sys

MANIFEST = 'android/app/src/main/AndroidManifest.xml'

PERMISSIONS = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.RECORD_AUDIO',
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_EXTERNAL_STORAGE',
]

with open(MANIFEST, 'r', encoding='utf-8') as f:
    content = f.read()

added = []
for perm in PERMISSIONS:
    if perm in content:
        continue
    line = f'    <uses-permission android:name="{perm}" />\n'
    # <manifest ...> 닫는 > 직후에 주입
    if re.search(r'<manifest[^>]*>', content):
        content = re.sub(r'(<manifest[^>]*>\s*\n?)', r'\1' + line, content, count=1)
        added.append(perm.split('.')[-1])

if added:
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'✅ AndroidManifest.xml 권한 {len(added)}개 주입: {", ".join(added)}')
else:
    print('ℹ️  모든 권한 이미 등록됨 — 스킵')
