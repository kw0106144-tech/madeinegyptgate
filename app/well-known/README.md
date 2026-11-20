# The two files the site must serve for app links

**Both are made by the site build** (`seo_app.part.py`, from `seo/config.json` `"app"`; CLAUDE.md 1.12 and 5.7). The files here are
only templates that show the format; never copy them into the build.

- **Android, served since 2026-11-20**: `/.well-known/assetlinks.json` lists the package and `android_cert_sha256` (today the release
  key that signs the APK offered on `/app/`), with two relations: `handle_all_urls` (App Links) and `get_login_creds` (Android shares
  the old-account form's saved passwords between the site and the app). When the Google Play app exists, add Play's **app signing
  key** SHA-256 to `android_cert_sha256` in `seo/config.json`, not here.
- **iOS, not served yet, on purpose**: `/.well-known/apple-app-site-association` is written only once `seo/config.json` `"app"`
  `ios_team_id` holds the owner's Apple Team ID (10 characters; empty today, because a wrong file is worse than none, and a malformed
  value stops the build). Its components, in this order (the first match wins): `/api/*`, `/pay*`, `/media/*`, `/panel.html` and
  `/login.html` stay in the browser, every other path `/*` opens in the app; `webcredentials` lists the same app (saved passwords of
  the old-account form, with `webcredentials:madeinegyptgate.com` in `App.entitlements`). Until it is served, links to
  madeinegyptgate.com open in Safari on iPhone.

| File here | Served by the site at | Fill in | Where the value comes from |
|---|---|---|---|
| `assetlinks.json` | `https://madeinegyptgate.com/.well-known/assetlinks.json` | `sha256_cert_fingerprints` | Google Play Console → the app → Test and release → App integrity → **App signing key certificate → SHA-256** (Google re-signs every app from the Play Store with this key). Add the upload key's SHA-256 too only if you also hand out APKs outside Play (`keytool -list -v -keystore upload.jks`). |
| `apple-app-site-association` (no extension) | `https://madeinegyptgate.com/.well-known/apple-app-site-association` | `appIDs` | Apple Developer → Membership details → **Team ID** (10 characters): `ABCDE12345.com.madeinegyptgate.app` |

## Step (once the values exist)

1. Put the value in `seo/config.json` `"app"` in a pull request: Play's app signing key SHA-256 in `android_cert_sha256` (keep the
   release key of the APK on `/app/` too while that APK is offered), the Team ID in `ios_team_id`. The build does the rest: both
   files under `.well-known/`, `Content-Type: application/json` for both (`_headers`), and `/.well-known/*` skips the Functions, so
   `functions/_middleware.js` never redirects it. Build + stage (CLAUDE.md 3.2 / 3.3) must show both files with 0 errors.
2. After the deploy, check that both answer **200 directly**, no redirect, on `https://madeinegyptgate.com` (not only on `www`, which
   redirects to the apex): `curl -sI https://madeinegyptgate.com/.well-known/assetlinks.json` and the same for the AASA file.
3. Verify: Google's checker
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://madeinegyptgate.com&relation=delegate_permission/common.handle_all_urls`,
   and on a phone `adb shell pm get-app-links com.madeinegyptgate.app` (should say `verified`). Apple fetches the AASA file through
   its CDN when the app is installed: `https://app-site-association.cdn-apple.com/a/v1/madeinegyptgate.com`.

The app side is already in place: the App Links filter in `app/android/app/src/main/AndroidManifest.xml` (`autoVerify`, host
`madeinegyptgate.com`; an intent filter cannot leave out paths before Android 15, so `MigLinks.isAppPage` hands `/api/`, `/pay`,
`/media/`, `/downloads/`, `/app/android.apk` and the old system's paths to the phone's browser) and `applinks:madeinegyptgate.com` +
`webcredentials:madeinegyptgate.com` in `app/ios/App/App/App.entitlements` (`app/tools/ios_project.py`; the App ID needs the
**Associated Domains** capability in Apple Developer → Identifiers before the profile is made). `www` is not in either: it
redirects to the apex, and the verifiers do not follow redirects. `npm run check` keeps the templates in step with the rules above.
