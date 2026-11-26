# Aurum Handle — TikTok Username Checker

Premium blue-and-gold desktop app for Windows and macOS (Electron).

## Run from source
    npm install
    npm start

## Build installers
    npm run dist:win   # Windows: NSIS installer + portable .exe (best built on Windows)
    npm run dist:mac   # macOS: .dmg + .zip (must be built on a Mac)

macOS builds are unsigned; on first launch, right-click the app → Open.
Windows builds are unsigned; SmartScreen may warn → "More info" → "Run anyway".

## Features
- Single check with live result, batch scanner with stop and adjustable delay
- Generator (letters, mixed, pronounceable, keyword + suffix)
- Gold Vault shortlist with export, plus 500-entry history
- Auto cool-down when TikTok rate-limits

## How checking works
`src/main.js` loads `tiktok.com/@name` and reads the response: a profile = taken,
"couldn't find this account" / 404 = available. Banned or reserved handles can
look available, so confirm in the TikTok app. If TikTok changes its page, update
the markers in `checkUsername()`.
