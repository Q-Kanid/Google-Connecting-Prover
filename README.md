# Account Lens — Google Sign-In Website (GitHub + Render)

A privacy-first public website template where visitors can sign in with Google and inspect **exactly what the Google API returned for their account**. Optional People API profile access requires separate consent. It **cannot** see everything Google knows about a user from sign-in alone.

## Publish this project

**Start here: [DEPLOY_GITHUB_RENDER.md](DEPLOY_GITHUB_RENDER.md).**

- Upload project files into a GitHub repository.
- Deploy a Node.js web service from that repository using Render.
- Configure a Redis-compatible private session store (such as Render Key Value).
- Create a Google Cloud OAuth **Web application** client and enter your HTTPS redirect URI.
- Put secrets **only in Render environment variables**, never in GitHub source code.
- Customize the privacy policy and confirm Google's required testing/verification steps before a public launch.

### Live environment variables

```text
NODE_ENV=production
GOOGLE_CLIENT_ID=<Google Cloud OAuth client ID>
GOOGLE_CLIENT_SECRET=<private Google Cloud OAuth client secret>
GOOGLE_REDIRECT_URI=https://YOUR-SITE.onrender.com/auth/google/callback
SESSION_SECRET=<random string 32+ characters>
REDIS_URL=<private managed Redis URL>
```

### Local preview (optional)

Install Node.js 20+. Copy `.env.example` to `.env`, fill in values if you want real Google login locally, then run:

```bash
npm install
npm start
```

Open http://localhost:3000 . The fictional **Explore sample dashboard** works without Google OAuth credentials. Local development uses temporary memory sessions; production requires Redis and HTTPS.

## What the app displays

- From Google sign-in (`openid`, `email`, `profile`): account ID, available name/email/picture/locale, email verification, OpenID ID token claims, returned UserInfo JSON and granted scopes.
- Optional separate read-only People API fields: birthday, phone numbers, addresses, gender and organizations, when present and permitted. These may require Google verification.
- A permissions dashboard, raw JSON view, download/export button and session sign-out.
- No Gmail mailbox access, Drive file access, Calendar access, access tokens sent to the browser, password collection, or refresh token storage.

## Privacy / security notes

The server verifies the Google ID token and exchanges OAuth codes using **PKCE and state**. It temporarily uses the access token for only the permitted API fetch and then discards it. User profile data is held in an isolated, expiring server-side session. Local sign-out is not the same as revoking Google's grant. This is a starter, not a certification: audit your deployment, policies, hosting and privacy notice before onboarding public visitors.

Official resources: https://developers.google.com/identity/protocols/oauth2/web-server and https://render.com/docs/deploy-node-express-app .
