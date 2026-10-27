#!/bin/bash
set -euo pipefail
APP="$PWD/dist/LocalCodex Installer.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/payload"
git archive HEAD Install-macOS.command README-macOS.md LICENSE THIRD_PARTY.md models.json macos migration-v2 channel | tar -x -C "$APP/Contents/Resources/payload"
swiftc -O -framework Cocoa packaging/Installer.swift -o "$APP/Contents/MacOS/LocalCodexInstaller"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>LocalCodexInstaller</string><key>CFBundleIdentifier</key><string>org.localcodex.installer</string><key>CFBundleName</key><string>LocalCodex Installer</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>0.2.0</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
"$APP/Contents/MacOS/LocalCodexInstaller" --self-test
plutil -lint "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
mkdir -p dist/dmg
cp -R "$APP" dist/dmg/
printf 'Open LocalCodex Installer.app. Apple Silicon only. Models download during installation.\nThis preview has no Apple Developer ID or notarization. If macOS blocks it, use Privacy & Security > Open Anyway only if you trust this release.\n' > dist/dmg/README.txt
hdiutil create -volname LocalCodex -srcfolder dist/dmg -ov -format UDZO dist/LocalCodex-macOS-v0.2.0.dmg
