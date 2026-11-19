# The two files the site must serve for app links (later)

**Not part of the site build yet, on purpose.** They only work with values the owner gets from the stores, and a wrong file is
worse than none. Until they are served, links to madeinegyptgate.com keep opening in the browser (everything else in the app works).

| File here | Served by the site at | Fill in | Where the value comes from |
|---|---|---|---|
| `assetlinks.json` | `https://madeinegyptgate.com/.well-known/assetlinks.json` | `sha256_cert_fingerprints` | Google Play Console → the app → Test and release → App integrity → **App signing key certificate → SHA-256** (Google re-signs every app from the Play Store with this key). Add the upload key's SHA-256 too only if you also hand out APKs outside Play (`keytool -list -v -keystore upload.jks`). |
| `apple-app-site-association` (no extension) | `https://madeinegyptgate.com/.well-known/apple-app-site-association` | `appIDs` | Apple Developer → Membership details → **Team ID** (10 characters): `ABCDE12345.com.madeinegyptgate.app` |

## Step (a developer, once the two values exist)

1. Fill the placeholders above (keep the JSON valid; delete the second fingerprint line if not needed).
2. Put both files in the site's build output under `.well-known/` (for example copy them in `site.py` next to the other static
   files, then build + stage, CLAUDE.md 3.2 / 3.3), and check:
   - both answer **200 directly**, no redirect, on `https://madeinegyptgate.com` (not only on `www`, which redirects to the apex);
   - `apple-app-site-association` is sent as `Content-Type: application/json` (it has no extension: add a `_headers` rule, and
     make sure `functions/_middleware.js` does not redirect or rewrite `/.well-known/*`);
   - `curl -sI https://madeinegyptgate.com/.well-known/assetlinks.json` and the same for the AASA file.
3. Verify: Google's checker
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://madeinegyptgate.com&relation=delegate_permission/common.handle_all_urls`,
   and on a phone `adb shell pm get-app-links com.madeinegyptgate.app` (should say `verified`). Apple fetches the AASA file through
   its CDN when the app is installed: `https://app-site-association.cdn-apple.com/a/v1/madeinegyptgate.com`.

The app side is already in place: the App Links filter in `app/android/app/src/main/AndroidManifest.xml` (`autoVerify`, host
`madeinegyptgate.com`) and `applinks:madeinegyptgate.com` in `app/ios/App/App/App.entitlements` (the App ID needs the
**Associated Domains** capability in Apple Developer → Identifiers before the profile is made). `www` is not in either: it
redirects to the apex, and the verifiers do not follow redirects.
