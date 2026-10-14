# U-Scholar Flutter app

Supports Android, iOS and web. Install Flutter stable (Dart 3.13.5+) and start the API first.

```sh
flutter pub get
flutter run -d chrome --web-port 8080
```

The default API is `http://localhost:3000/api`. Override it at build/run time:

```sh
flutter run --dart-define=API_URL=https://api.example.com/api
flutter run -d android --dart-define=API_URL=http://10.0.2.2:3000/api
flutter build web --dart-define=API_URL=https://api.example.com/api
```

For Android use an actual device ID from `flutter devices` if `android` is unavailable. The emulator reaches the host through `10.0.2.2`; physical devices need your machine's LAN address and appropriate network access. Android debug builds allow local HTTP; release builds should use HTTPS. iOS should use HTTPS unless a narrowly scoped local development exception is configured. iOS signing and secure-storage Keychain entitlements must match your own Apple team and bundle identifier before device distribution.

API origin must be in the backend's `CORS_ORIGINS`. Secure storage persists the seven-day session; web secure storage requires localhost or HTTPS. The app sends tokens in authorization headers. Sign out revokes the server session and clears local storage.

The interface includes topic discovery, diagnostic questions, strength/gap results, an account gate, saved tracks, external resources, click counts, notes, sequential completion, XP/badges/streaks and UTC email reminder settings. Demo assessments and search-page resources are prominently labeled. Completion is self-reported; external sites do not report activity back to the app.

```sh
flutter analyze
flutter test
flutter build web
```

Generated Android and iOS platform scaffolds are included. Native builds require the usual Android SDK or Xcode setup; web output is in `build/web`.
