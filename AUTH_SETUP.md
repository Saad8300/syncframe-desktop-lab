# AUTH_SETUP.md — SyncFrame Studio Google Login Setup Guide

This guide explains how to set up Google OAuth authentication for SyncFrame Studio using Supabase Auth.

---

## Prerequisites
- A Google account
- A Supabase account (free tier works fine): https://supabase.com

---

## Step 1: Create a Supabase Project

1. Go to https://supabase.com and sign in.
2. Click **New Project**.
3. Choose a name (e.g. `syncframe-studio`), set a strong database password, and select a region close to you.
4. Wait for the project to finish provisioning (~1–2 minutes).

---

## Step 2: Enable Google OAuth Provider

1. In your Supabase project, go to **Authentication → Providers**.
2. Find **Google** in the list and enable it.
3. You will need a **Google OAuth Client ID** and **Client Secret** — see Step 3.

---

## Step 3: Create a Google OAuth Client

1. Go to https://console.cloud.google.com.
2. Create a new project (or use an existing one).
3. Go to **APIs & Services → Credentials**.
4. Click **Create Credentials → OAuth 2.0 Client ID**.
5. Select **Web application** as the application type.
6. Under **Authorized redirect URIs**, add **both** of these:
   - For dev mode: `https://<your-project>.supabase.co/auth/v1/callback`
   - *(Supabase handles the initial redirect; your app redirect URLs are configured in Supabase separately)*
7. Copy your **Client ID** and **Client Secret**.

---

## Step 4: Add OAuth Credentials to Supabase

1. Back in Supabase → **Authentication → Providers → Google**:
   - Paste your **Client ID**.
   - Paste your **Client Secret**.
2. Save.

---

## Step 5: Configure Redirect URLs in Supabase

In Supabase → **Authentication → URL Configuration**:

1. Set **Site URL** to `http://localhost:5173` for local development.
2. Under **Redirect URLs**, add **both**:
   - `http://localhost:5173/auth/callback` — browser dev mode
   - `syncframe://auth/callback` — packaged desktop app

---

## Step 6: Create `frontend/.env.local`

In the project root, create the file `frontend/.env.local` (this file is gitignored — never commit it):

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_AUTH_REDIRECT_DEV=http://localhost:5173/auth/callback
VITE_AUTH_REDIRECT_DESKTOP=syncframe://auth/callback
VITE_AUTH_DISABLED_FOR_DEV=false
```

Find these values in Supabase → **Project Settings → API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

> ⚠️ **NEVER use the `service_role` key in the frontend.** Only the `anon` key is safe for client-side code.

---

## Step 7: Run in Browser Dev Mode

```bash
./start_app.command
```

Or manually:
```bash
cd frontend && npm run dev
```

Navigate to `http://localhost:5173`. You should see the login screen.  
Click **Continue with Google** → complete Google sign-in → you should be redirected back to the app.

---

## Step 8: Run in Electron Desktop Dev Mode

```bash
./start_desktop.command
```

> **Note:** In Electron dev mode, the `syncframe://` protocol is not registered with the OS. Use `VITE_AUTH_REDIRECT_DEV=http://localhost:5173/auth/callback` and the browser will handle the callback, which Supabase's `detectSessionInUrl` picks up automatically.

---

## Step 9: Test the Packaged Mac App

1. Build the packaged app:
   ```bash
   ./build_desktop_mac.command
   ```
2. Open the `.app` from `desktop/dist/mac-arm64/`.
3. Click **Continue with Google**.
4. Your system browser opens for Google sign-in.
5. After signing in, macOS routes `syncframe://auth/callback#...` back to the app.
6. The app receives the token and logs you in.

> **First launch note:** macOS Gatekeeper may take 60–90 seconds to verify the unsigned binary before the app opens.

---

## Security Notes

| Do | Don't |
|---|---|
| Use the `anon` public key in frontend | Use the `service_role` key anywhere in frontend |
| Keep `frontend/.env.local` out of git | Commit real Supabase keys |
| Use `syncframe://` for packaged app | Use embedded webview for Google login |
| Use system browser for OAuth | Call Google OAuth directly without Supabase |

---

## Future Batches

| Batch | Feature |
|---|---|
| **Batch 21F** | Free/Pro membership check after login |
| **Batch 21G** | Tool lock system based on membership |
| **Batch 21H** | Admin users & access panel |
| **Batch 21I** | Windows build support |
| **Batch 21J** | Code signing, notarization, auto-update |

Backend API protection (JWT verification on endpoints) will be implemented in **Batch 21G**.  
The placeholder file `backend/auth_helpers.py` documents the approach.

---

## Troubleshooting

**Login screen shows "Supabase auth is not configured"**
→ Check that `frontend/.env.local` exists and has valid values.

**After Google sign-in, redirected to `localhost:5173` and then app looks blank**
→ The callback route `/auth/callback` is handled — wait 1–2 seconds for auto-redirect.

**Packaged app doesn't receive the deep-link callback**
→ Make sure `syncframe://auth/callback` is listed as a Redirect URL in Supabase.  
→ The first time you open a newly built `.app`, approve any macOS Gatekeeper prompt.

**Token not refreshing**
→ Supabase client has `autoRefreshToken: true` — this is automatic. Logout and log back in if issues persist.
