# U-Scholar

Flutter for Android, iOS and web, with a NestJS API and SQLite persistence. Discover a topic, answer a diagnostic assessment, create an account to reveal a personalized learning track, and complete resources sequentially. Notes, click counts, XP, levels, badges, UTC daily streaks and configurable email reminders are saved per account.

## Run locally

Requirements: Node.js **24 LTS** (22.13+ supports the SQLite API), npm, and Flutter stable with Dart 3.13.5+. Use two terminals:

```sh
cd back-end
cp .env.example .env
npm ci
npm run dev
```

```sh
cd mobile-app
flutter pub get
flutter run -d chrome --web-port 8080
```

The example environment enables **demo mode**: confidence questions and clearly labeled provider search links. No paid service is called. To use real assessments and specific resources, set `DEMO_MODE=false`, `OPENAI_API_KEY`, and an available `OPENAI_MODEL` in `back-end/.env`. No credentials belong in the Flutter build. See [backend instructions](back-end/README.md) and [Flutter instructions](mobile-app/README.md).

## Behavior and boundaries

- Guests can take an assessment. Its random bearer identifier expires after 24 hours; account creation or login is required before resource discovery and access. Submission is final, and each assessment can belong to only one account.
- Live mode uses objective multiple-choice questions and server-side grading. Scores are diagnostic estimates, not certifications. Weaknesses are prioritized alongside prerequisites. A short assessment and track cannot guarantee expert competence.
- OpenAI Responses web search finds actual resource pages; a separate formatting call is validated against the source URLs returned by search. Resource availability, pricing and quality remain subject to provider changes. Sources and selection reasons are saved on each track.
- Udemy's public Affiliate API was discontinued on January 1, 2025: https://www.udemy.com/developers/affiliate/. This app uses web discovery rather than promising unrestricted catalog APIs. No scraping or partner credentials are required.
- Resource visits increment click counts. Completion is **self-reported**, requires a prior open, awards 100 XP once, and unlocks the next step. There is no external course-completion integration.
- Resend sends welcome and reminder emails when configured with a verified sender. Without credentials, welcome emails remain queued and reminder activation reports a configuration error. Delivery requires the backend to keep running.
- Reminders support selected weekdays and a time explicitly displayed in UTC; streaks also use UTC. Delivery checks run every minute and catch up after the scheduled time on the same day. An outage spanning the whole day skips that day's reminder.
- Sessions expire after seven days, are hashed in storage, and are revocable through logout. Passwords use salted scrypt. SQLite is suitable for this single-instance implementation; do not run multiple workers sharing the same database. Use TLS for any hosted deployment. Database backups must include notes, accounts, email queue and tracks.

## Verify

```sh
cd back-end
npm test
```

```sh
cd mobile-app
flutter analyze
flutter test
flutter build web
```

API tests cover account isolation, password checks, submission rules, server-side unlocking, idempotent rewards, notes, click counts, persistence and missing-provider handling. Flutter widget tests cover the narrow-screen discovery and account gate. Actual OpenAI/Resend calls and mobile device builds need credentials/platform tooling and are separate from local tests.

## Architecture

`mobile-app/lib/api.dart` handles authenticated API calls and secure session storage. `main.dart` contains the Material interface. `back-end/src/main.ts` defines validated HTTP routes and request limits; `service.ts` owns learning, authentication and email delivery rules; `ai.ts` integrates OpenAI; `store.ts` initializes SQLite. The backend has body limits, allowlisted CORS origins, security headers and rate limits. Deploy behind HTTPS and configure proxy-aware rate limiting for your actual hosting environment before public exposure.

OpenAI implementation references: https://developers.openai.com/api/docs/guides/tools-web-search and https://developers.openai.com/api/reference/resources/responses/methods/create. Email reference: https://resend.com/docs/api-reference/emails/send-email.
