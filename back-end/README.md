# U-Scholar API

Use Node 24 LTS. From this directory:

```sh
cp .env.example .env
npm ci
npm run dev
```

`npm run build` compiles TypeScript; `npm start` runs the compiled API on port 3000, loading `.env`. `npm test` compiles and runs isolated SQLite tests. Data lives in `data/u-scholar.sqlite` and survives restarts. Never commit `.env` or the database.

Configuration:

| Variable | Purpose |
| --- | --- |
| `PORT` | Listening port, default 3000 |
| `CORS_ORIGINS` | Comma-separated exact browser origins; whitespace and trailing slashes are normalized |
| `NODE_ENV` | Set `production` for the strict origin allowlist; development also accepts localhost, 127.0.0.1 and IPv6 loopback on any port |
| `DATABASE_PATH` | SQLite file location |
| `DEMO_MODE` | Explicit `true` enables sample questions/catalog links |
| `OPENAI_API_KEY` | Server-side OpenAI credential, required outside demo mode |
| `OPENAI_MODEL` | Responses/web-search capable model, default `gpt-4.1-mini` |
| `RESEND_API_KEY` | Enables queued welcome/reminder delivery |
| `EMAIL_FROM` | Resend verified sender, required for delivery |
| `APP_URL` | Public frontend URL used in reminder text |

No secret is sent to Flutter. Set `DEMO_MODE=false` for live topic questions and source-backed resources. Provider errors return a retryable service error; the application does not silently substitute samples. Search results and model JSON are untrusted: validate the shape and allow only source-backed HTTPS resource URLs. Assessments last 24 hours and do not reveal answer keys to clients.

Resend queue retries once per minute up to 20 attempts and uses idempotency keys. Inspect failed records using a SQLite client (`mail` rows with `sent=0`); there is no administrative dashboard. Keep a single API instance running for reminders. A configured sender must be verified with Resend. Live mail delivery has not been tested without credentials.

## API

All paths start with `/api`. Send JSON. Authenticated routes require `Authorization: Bearer <token>`.

| Method and path | Body / behavior |
| --- | --- |
| GET `/health` | Health and demo status |
| POST `/auth/register` | `{name,email,password}`; password 10–128 characters |
| POST `/auth/login` | `{email,password}`; returns token and profile |
| POST `/auth/logout` | Revokes current session |
| GET `/me` | Profile, rewards and reminders |
| POST `/assessments` | `{topic}`; guest-friendly diagnostic |
| POST `/assessments/:id/answers` | `{answers:[0,1,2,3,...]}`; one zero-based index per question |
| POST `/tracks` | `{assessmentId}`; authenticated, generates or retrieves track |
| GET `/tracks` | Current user's tracks |
| POST `/tracks/:id/resources/:rid/open` | Increments visits, returns `{url,clicks}` |
| POST `/tracks/:id/resources/:rid/complete` | Idempotent self-reported completion |
| PUT `/tracks/:id/resources/:rid/notes` | `{notes}`; maximum 20,000 characters |
| PUT `/me/reminder` | `{enabled,timeUtc:"18:00",days:[1,2,3,4,5]}`; Sunday=0 |

Public launch considerations beyond this initial implementation: email verification/password recovery, account deletion/export, monitoring, provider spend quotas, backups and a deployment-specific proxy/TLS configuration. No production deployment is included.

### Browser CORS

Local Flutter web runs may use any loopback port during development. For hosted or LAN origins, add the exact frontend origin to `CORS_ORIGINS` (for example `https://learn.example.com` or `http://192.168.1.10:8080`). Set `NODE_ENV=production` when deploying to restrict access to that list. Restart the API with `npm run dev` after changing configuration or source; `npm start` runs the last compiled build. CORS preflight permits JSON and bearer authorization headers.
