# Publish Account Lens as a real website (GitHub + Render + Google OAuth)

**GitHub stores and versions your code. Render runs the Node.js app publicly. Redis/Render Key Value stores temporary login sessions. Google authenticates people.** You cannot deploy this project on GitHub Pages alone because Pages does not run Node.js server processes.

## 1. Upload the source to GitHub
1. Create a repository at https://github.com/new . A private repository is a good choice until you are ready to publish the source.
2. Upload the **contents of this folder** to the repository root, including the `public` directory, `package.json`, `server.js`, and `render.yaml`. Do not upload an extra surrounding folder.
3. Never upload a `.env` file, a Google client secret, a Redis URL containing credentials, or a session secret. `.gitignore` excludes `.env`, but also inspect all commits before pushing.

## 2. Set up Render session storage
1. In https://dashboard.render.com choose **New → Key Value**. Choose the same region as your website.
2. Create a private instance. Prefer authenticated connections and an appropriate plan for real visitors. Render's free plans have limitations, and data can be evicted; sessions may be lost.
3. Copy its **internal Redis URL** from **Connect**. This goes in the Render web service's `REDIS_URL` environment variable, **not** in GitHub or client-side JavaScript.

## 3. Deploy the Node.js web service from GitHub
1. Choose **New → Web Service** at https://dashboard.render.com . Connect your GitHub repository and select it (or choose **New → Blueprint**, which reads the provided `render.yaml`).
2. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`. Health check: `/healthz`.
3. Set the following **environment variables** in Render's service dashboard:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `GOOGLE_CLIENT_ID` | Client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Client Secret from Google Cloud; private |
| `GOOGLE_REDIRECT_URI` | `https://YOUR-SITE.onrender.com/auth/google/callback` |
| `SESSION_SECRET` | A securely generated random string of at least 32 characters |
| `REDIS_URL` | Your private Key Value internal connection URL |

Use **your actual Render hostname** in all URLs, not the placeholder above. If using the Blueprint, `SESSION_SECRET` is auto-generated and other secret variables are prompted. Render auto-assigns `PORT`, so you do not need to set it. Do not add your secrets to GitHub Actions or repository files.

Note: Your website will fail to start in production until OAuth settings and Redis are properly configured; this is intentional to avoid silently deploying an insecure login.

## 4. Configure Google Cloud OAuth
1. Open https://console.cloud.google.com and select a Google Cloud project.
2. Use **Google Auth Platform → Branding & Audience** to set up the consent screen, app name, audience, and any required testing users.
3. Use **Clients → Create Client → Web application**.
4. In **Authorized redirect URIs**, enter exactly `https://YOUR-SITE.onrender.com/auth/google/callback`. Local testing may also use `http://localhost:3000/auth/google/callback`.
5. If you use an **Authorized JavaScript origins** entry, enter `https://YOUR-SITE.onrender.com` without the callback path (this server-side code does not need a browser-side Google token).
6. Copy the Client ID and Secret into Render's private environment variables (step 3).
7. If using the optional birthday/phone/address/gender/organization scopes, enable the **Google People API** and check the relevant Google consent/verification requirements. Some scopes need additional review.
8. When you change your Render domain or add a custom domain, **update both** the Google Console redirect URI and the `GOOGLE_REDIRECT_URI` environment variable.

## 5. Google publishing and privacy requirements
- Google sign-in does **not** grant access to all Google data. Only returned identity details and separately authorized optional profile fields are displayed.
- Review and replace `public/privacy-policy.html` with an accurate privacy policy identifying who operates the site and how data is processed; add real support/contact details before going public.
- Check Google's production/branding/verification rules. Public use of restricted or sensitive scopes may require verification, and Google may require a verified domain and a publicly accessible homepage/privacy policy.
- Keep the repository private if appropriate. Make sure hosted sessions are isolated, Redis is protected, and hosting access uses MFA.
- If you're testing with your own Google account, you can keep the Google OAuth consent screen in **Testing** and add approved test users. Publishing to everyone may require additional steps.

## 6. Verify the live website
- Visit your actual `https://...onrender.com` URL and check `/healthz` returns `{ "ok": true }`.
- Click **Continue with Google**. Google should open the consent page and return you to your website with your account data.
- Check optional permissions only after enabling the People API and configuring consent.
- Sign out; confirm the session ends. Repeat with a different account in a separate browser profile to check isolation.
- To update the website, commit changes to GitHub. Render can automatically redeploy from the connected branch.

## Troubleshooting
- **`redirect_uri_mismatch`**: Your redirect URI in Google Cloud and the Render environment variable are not exactly identical, including `https`, casing, and callback path.
- **App won't start / HTTP 503**: Inspect Render logs. Check your OAuth variables, `NODE_ENV`, and `REDIS_URL` connectivity.
- **Google says access blocked**: Check testing users, Google Auth Platform audience, scope verification and public publishing status.
- **Missing profile fields**: The user may not have stored that field, the People API may not be enabled, or the user may not have authorized the extra scope.
- **Sessions disappear**: Check Redis plan, availability, and cookie/HTTPS configuration.

Official documentation:
- Render Express deployment: https://render.com/docs/deploy-node-express-app
- Render Key Value: https://render.com/docs/key-value
- Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- Google production readiness: https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance
