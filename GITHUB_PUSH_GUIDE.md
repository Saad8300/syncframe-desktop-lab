# 📤 How to Push Audio Image Sync Studio to GitHub

This guide walks you through putting this project on GitHub so your friends can clone and run it.

---

## 📋 Before You Start

You need:
- A **GitHub account** → https://github.com/
- **Git** installed on your Mac → check with `git --version`
  - If missing: `brew install git` or install Xcode Command Line Tools: `xcode-select --install`

---

## 🚀 Step-by-Step: First Push to GitHub

### Step 1 — Create a new repository on GitHub

1. Go to https://github.com/new
2. Fill in:
   - **Repository name**: `audio-image-sync-studio`
   - **Description**: `Generate perfectly timed videos from audio + images + timestamps`
   - **Visibility**: Public (so friends can see it) or Private
   - ⚠️ Do **NOT** check "Add a README file" (we already have one)
3. Click **Create repository**
4. Copy the URL shown — it will look like:
   `https://github.com/YOUR_USERNAME/audio-image-sync-studio.git`

---

### Step 2 — Open Terminal and navigate to the project

```bash
cd /path/to/audio-image-sync-studio
# Example:
# cd ~/Desktop/audio-image-sync-studio
```

---

### Step 3 — Initialize Git (first time only)

```bash
git init
```

---

### Step 4 — Check what will be included

```bash
git status
```

You should see your source files. You should **NOT** see:
- `backend/.venv/`
- `frontend/node_modules/`
- `backend/outputs/`
- `backend/uploads/`
- `logs/`

These are excluded by `.gitignore`. ✅

---

### Step 5 — Stage all files

```bash
git add .
```

---

### Step 6 — Commit your code

```bash
git commit -m "Initial working local MVP"
```

---

### Step 7 — Set the branch name to `main`

```bash
git branch -M main
```

---

### Step 8 — Connect to your GitHub repository

Replace `YOUR_GITHUB_REPO_URL` with the URL you copied in Step 1:

```bash
git remote add origin YOUR_GITHUB_REPO_URL
# Example:
# git remote add origin https://github.com/johnsmith/audio-image-sync-studio.git
```

---

### Step 9 — Push your code to GitHub

```bash
git push -u origin main
```

You may be asked for your GitHub **username** and a **Personal Access Token** (not your password).

> **How to create a GitHub Personal Access Token:**
> 1. Go to https://github.com/settings/tokens
> 2. Click **Generate new token (classic)**
> 3. Give it a name, set expiration, and check **repo** scope
> 4. Click **Generate token** and copy it
> 5. Use this token as your password when git asks

---

### ✅ Done! Your code is on GitHub.

Visit `https://github.com/YOUR_USERNAME/audio-image-sync-studio` to see your project.

---

## 🔄 Future Updates — How to Push Changes

After your first push, every time you make changes:

```bash
# See what changed
git status

# Stage your changes
git add .

# Commit with a meaningful message
git commit -m "Fixed zoom effect bug"

# Push to GitHub
git push
```

---

## 👥 How Your Friends Can Run It

Send them the GitHub link. They just need to:

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/audio-image-sync-studio.git
cd audio-image-sync-studio

# 2. Install FFmpeg (Mac)
brew install ffmpeg

# 3. Double-click start_app.command in Finder — done!
```

> ⚠️ **Important:** This is a **localhost** app. The video generation runs on each person's own computer using their own CPU and FFmpeg. Your friends cannot access YOUR running app over the internet — they need to run it on their own machines.

---

## 📝 What Gets Pushed vs. What Stays Private

| What | Pushed to GitHub? |
|------|:-----------------:|
| Source code (`*.py`, `*.tsx`, `*.ts`) | ✅ Yes |
| `README.md`, `GITHUB_PUSH_GUIDE.md` | ✅ Yes |
| `start_app.command`, `stop_app.command` | ✅ Yes |
| `requirements.txt`, `package.json` | ✅ Yes |
| Empty placeholder folders (`.gitkeep`) | ✅ Yes |
| Python virtual environment (`backend/.venv/`) | ❌ No |
| npm packages (`frontend/node_modules/`) | ❌ No |
| Your generated videos (`backend/outputs/`) | ❌ No |
| Your uploaded files (`backend/uploads/`) | ❌ No |
| Runtime logs (`logs/`) | ❌ No |
| macOS `.DS_Store` files | ❌ No |

---

## 🆘 Common GitHub Issues

**`fatal: remote origin already exists`**
```bash
git remote set-url origin YOUR_GITHUB_REPO_URL
```

**`error: failed to push some refs`**
```bash
git pull --rebase origin main
git push
```

**Authentication failed**
→ Use a Personal Access Token (not your GitHub password). See Step 9 above.

**Git not installed**
```bash
xcode-select --install
# or
brew install git
```
