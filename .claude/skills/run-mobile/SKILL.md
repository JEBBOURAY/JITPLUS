---
name: run-mobile
description: Run the local dev/test environment of jit-plus — Android emulator, local backend with the Docker Postgres, jitplus or jitpluspro on the emulator — then drive and screenshot the app to see a change working. Use when asked to run, launch, test or screenshot an app, to reproduce a bug on screen, or to confirm a UI change in the real app (not only in tests).
---

# Run jit-plus locally (dev / test)

All Android tools are Windows binaries, called from WSL:

```bash
SDK=/mnt/c/Users/ayoub/AppData/Local/Android/Sdk
ADB=$SDK/platform-tools/adb.exe
W='C:\Users\ayoub\OneDrive\Desktop\JIT\jit-plus'
```

## 1. Emulator

AVD `JitPlus_Pixel_API36` (Pixel 1080×2400, Android 16, Google Play, x86_64) is in `C:\Users\ayoub\.android\avd`.

```bash
$ADB devices | grep -q emulator || \
  $SDK/emulator/emulator.exe -avd JitPlus_Pixel_API36 -no-snapshot-save -no-boot-anim -gpu auto   # run_in_background
until [ "$($ADB shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 5; done
```

A cold boot takes about 4 to 5 minutes. `adb devices` shows `device` well before `sys.boot_completed` is 1.

## 2. Backend + database

- DB: Docker container `jit-db` (Postgres 16, `localhost:5432/jit_db`). It holds the user's dev data. **Never run `prisma/seed.ts` on it** (the seed wipes every table), and never `migrate reset`. Ask before applying pending migrations. Check what is pending first:
  `docker exec jit-db psql -U admin -d jit_db -tAc "select migration_name from _prisma_migrations where finished_at is not null"` compared with `ls apps/backend/prisma/migrations`.
- Start: `cmd.exe /c "cd /d $W\apps\backend && pnpm start:dev"` (run in background). Note that `start:dev` runs `prisma migrate deploy` first. Health check: `curl -s localhost:3000/health`.
- NODE_ENV defaults to `development` (Joi in `app.module.ts`). OTP codes are logged as `[DEV] … OTP pour <email>: <code>` in the backend output. Read them there instead of a real inbox.
- `adb reverse` lets the emulator reach the backend and Metro on `localhost`: `$ADB reverse tcp:3000 tcp:3000` and `$ADB reverse tcp:8083 tcp:8083` (jitplus) or `tcp:8082` (Pro). The apps' `prestart` script (`scripts/adb-reverse.js`) does this for port 3000.

## 3. App on the emulator

Both apps use native modules (Google Sign-In, Maps, Sentry, FB SDK in Pro), so **Expo Go is not enough: a development build (expo-dev-client) is required**.

- Installed? `$ADB shell pm list packages | grep -i jit`
- Install an APK: `$ADB install -r <path.apk>`
- Start Metro for a dev build: `cmd.exe /c "cd /d $W\apps\jitplus && pnpm start:dev-client"` (jitplus: port 8083 via `--port 8083` when needed; Pro: `start:dev-client`, port 8082), then open the app on the emulator.
- Producing a dev build costs EAS credits (`eas build --profile development --platform android`) or a long local Gradle build (`expo run:android`). **Ask the user before either.**

## 4. Drive and see

```bash
S=<scratchpad>
$ADB exec-out screencap -p > $S/shot.png      # then Read the PNG to see it
$ADB shell input tap X Y                     # coordinates in 1080×2400 device pixels
$ADB shell input text 'hello'                # spaces as %s
$ADB shell input keyevent KEYCODE_BACK
$ADB shell am start -a android.intent.action.VIEW -d '<deep link>'
$ADB shell uiautomator dump /sdcard/ui.xml && $ADB exec-out cat /sdcard/ui.xml   # find element bounds instead of guessing coordinates
$ADB logcat -d -t 300 | grep -iE "ReactNativeJS|FATAL|AndroidRuntime"
```

Arabic/RTL check: switch the language inside the app, or `$ADB shell "setprop persist.sys.locale ar-MA; stop; start"`.

When the screenshot is displayed scaled, multiply the coordinates by the scale factor given with the image.

## Report

Say what you actually saw on screen (attach the screenshot path). If a step could not run (no dev build, backend down), say so. Do not claim the change works.
