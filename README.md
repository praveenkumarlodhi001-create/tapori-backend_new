"# Roastify" 


## Phase 1 authentication configuration

- Set `FIREBASE_PROJECT_ID=roastifyappnew` on Render (or your Firebase project ID).
- Set `GEMINI_API_KEY` or `GEMINI_API_KEY_1` in Render environment variables. Never commit API keys.
- The backend verifies Firebase ID-token signatures against Google's published Secure Token certificates. Mobile clients send `Authorization: Bearer <Firebase ID token>` for REST and an `auth` message as the first WebSocket frame.
- Set frontend public endpoint values in `gpt-persona-app/.env` using `.env.example`. `EXPO_PUBLIC_*` values are public configuration only, not secrets.
- No `APP_TOKEN` is required after this migration. Deploy backend and frontend together; older clients that still send the shared token will no longer authenticate.
