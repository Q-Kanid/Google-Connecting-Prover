# START HERE — Upload this website to GitHub

**Important:** On the GitHub website, upload the **extracted files**, not the .zip archive itself.

1. Extract `Google_SignIn_GitHub_Upload_Ready.zip` on your computer.
2. Create a new repository at https://github.com/new .
3. In your empty repository, click **uploading an existing file** (or **Add file → Upload files**).
4. Drag the **contents of the extracted folder** into GitHub (not the outer folder). Ensure `server.js`, `package.json`, `render.yaml`, `public/`, and `.github/` are at the repository root. Click **Commit changes**.
5. Follow `DEPLOY_GITHUB_RENDER.md` for hosting on Render and connecting Google OAuth.

GitHub stores the source code, but cannot host the Node.js backend using GitHub Pages alone. A Node.js web host (the guide uses Render) and a private session store are required to make Google sign-in work on a public website.

**Never upload** your `.env` file or your Google Client Secret, Session Secret, or Redis credentials. Set those only as private environment variables on your host.

Google sign-in only exposes Google-approved account details and any additional profile data explicitly authorized. This project does not read Gmail messages, Google Drive files, or Calendar data.
