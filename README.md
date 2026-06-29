# 🎬 SyncFrame Studio by Automist Labs

> Timestamp-driven video creation for creators and automation workflows. Create perfectly timed MP4 videos locally on your Mac.

---

## 🧩 What does this app do?

SyncFrame Studio is a local desktop-class application featuring a full **Studio Dashboard** for analytics, **History tracking**, local **Settings**, and five core professional workflows for automated video/audio creation:

### 1. Image Timeline (Photos to Video)
You give it:
1. 🎵 An **audio file** (or multiple audio parts)
2. 🖼️ A **ZIP file** of images named `1.jpg`, `2.jpg`, `3.jpg`…
3. 📋 A **timestamp CSV file** that says when each image should appear

### 2. Video Timeline (Clips to Video)
You give it:
1. 🎵 An **audio file** (or multiple audio parts)
2. 🎬 A **ZIP file** of video clips named `1.mp4`, `2.mov`, `3.webm`…
3. 📋 A **timeline CSV file** that specifies clip sequence and exact timings

### 3. Media Timeline (Mixed Media & Text)
You give it:
1. 🎵 An **audio file** (or multiple audio parts)
2. 📁 A **ZIP file** containing images and video clips.
3. 📋 A **timeline CSV file** that specifies timings, assets, and text overlays.

### 4. Audio Merger
Combine multiple audio files into one clean track in exact sequence. Audio filenames do not matter — add them in the order you want them merged.

### 5. Script Timestamp
Upload voice audio to generate a timestamped script or CSV automatically using local **Whisper AI**. 
- Runs entirely locally via the Python backend — no cloud APIs
- Outputs include Simple Timestamps, Detailed Timestamps, Scene Plans, SRT Captions, and SyncFrame Timeline CSVs
- Ideal for long audio processing

It generates a professional **MP4 video** precisely synced to your audio with optional transitions, watermarks, intro/outro bumpers, and stylistic filters.

---

## 💻 Requirements

Before you run this app, make sure you have these installed on your Mac:

| Tool | Why it's needed | How to check |
|------|----------------|--------------|
| **Python 3.9+** | Runs the backend server | `python3 --version` |
| **Node.js 18+ & npm** | Runs the frontend | `node --version` |
| **FFmpeg** | Encodes the video | `ffmpeg -version` |

### Install FFmpeg (required!)

FFmpeg is a free video tool. Install it with [Homebrew](https://brew.sh/):

```bash
# Step 1: Install Homebrew (if you don't have it yet)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Step 2: Install FFmpeg
brew install ffmpeg
```

---

## 🚀 Easiest Way to Run — Double Click!

1. Open the project folder in Finder
2. **Double-click `start_app.command`**
3. If macOS says "cannot be opened because it is from an unidentified developer":
   - Right-click the file → **Open** → click **Open** in the dialog
   - (You only need to do this once)
4. A terminal window opens and the app starts automatically
5. Your browser opens at **http://localhost:5173** ✨

### Windows Users

**First time only (run as Administrator):**
```
install_windows.bat
```
This automatically installs Python, Node.js, FFmpeg, and all project dependencies.

**Daily start:**
```
start_windows.bat
```

**Daily stop:**
```
stop_windows.bat
```

App opens at **http://localhost:5173**

> 📖 See [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for the full setup guide, troubleshooting, and common errors.

### To Stop the App

**Mac Users:** Double-click `stop_app.command` — it cleanly stops everything.
**Windows Users:** Run `stop_windows.bat`.

---

## 🔧 Manual Run (Advanced)

If you prefer to use the terminal yourself:

### Start the Backend

```bash
cd backend

# Create virtual environment (first time only)
python3 -m venv .venv
source .venv/bin/activate

# Install packages (first time only)
pip install -r requirements.txt

# Start server
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Start the Frontend

Open a second terminal tab:

```bash
cd frontend

# Install packages (first time only)
npm install

# Start dev server
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 📋 How to Format Your CSV

Depending on the mode you are using, the required CSV format varies slightly.

### Image Timeline / Video Timeline CSV

| Column  | Required | Description |
|---------|----------|-------------|
| `image` / `video` | ✅ Yes | Filename in the ZIP (e.g. `1.jpg` or `clip.mp4`) |
| `start` | ✅ Yes | When the asset appears |
| `end`   | ✅ Yes | When the asset disappears |
| `text`  | ❌ No  | Optional label (shown in the report) |

### Media Timeline CSV

The Media Timeline supports a mix of images, videos, and text-only screens.

| Column  | Required | Description |
|---------|----------|-------------|
| `start` | ✅ Yes | Sequence start time in seconds (e.g. `0` or `5.5`) |
| `end`   | ✅ Yes | Sequence end time in seconds |
| `asset` | ⚠️ Conditional | Filename in the ZIP. Required unless `text` is provided. You can reuse the same asset multiple times. |
| `text`  | ⚠️ Conditional | Text to overlay, or text to display on a blank background if `asset` is empty. |

#### Example Media Timeline CSV
```csv
start,end,asset,text
0,5,1.png,"Opening image"
5,10,1.mp4,"First video clip"
10,15,2.jpg,"Second image"
15,20,2.mp4,"Second video clip"
20,25,,"Text-only screen"
```
*Note: Gaps in the Media Timeline are allowed and will be automatically filled with a neutral background.*

#### Filename Guidelines
* Put images and videos inside the Media ZIP.
* Use exact filenames in the `asset` column.
* Videos can be named simply as `1.mp4`, `2.mp4`, `3.mp4`.
* Images can be named `1.png`, `2.jpg`, etc.
* The app reads the extension to decide whether it is an image or video.

### Accepted Time Formats (Image/Video Timeline)

| Format | Example |
|--------|---------|
| `MM:SS` | `00:02` |
| `MM:SS.mmm` | `00:01.500` |
| `HH:MM:SS` | `00:00:02` |
| `HH:MM:SS.mmm` | `00:00:02.500` |

---

## 🖼️ How to Name Your Images

- Images inside your ZIP must be named exactly as they appear in the CSV
- Recommended naming: `1.jpg`, `2.jpg`, `3.jpg`, etc.
- Supported formats: **JPG, JPEG, PNG, WEBP**
- Images should be at the **root level** of the ZIP, not inside sub-folders
- The CSV `image` column must match the filename exactly (including extension)

**Example ZIP contents:**
```
images.zip
├── 1.jpg
├── 2.jpg
└── 3.jpg
```

---

## ⚙️ App Settings & Templates

SyncFrame Studio includes a local **Settings** page and a **Templates** library where you can customize your workspace and save your favorite workflows. All settings and templates are stored locally in your browser.

- **Templates**: Save any tool's current configuration (Video Settings, Audio format, Transcript settings, etc.) as a reusable template. Built-in templates for TikTok, YouTube, and podcasts are also included.
- **Theme & Appearance**: Switch between dark mode (default) and light mode, and choose a custom accent color for the app.
- **Default Export Settings**: Set your preferred default export preset (e.g., `TikTok 1080p`), default video filename, and default audio/script filenames. These defaults apply every time you open a tool.
- **Startup Behavior**: Choose which page the app opens to when you start it (e.g., always open the Landing Page, always open Tools, or remember the last used page).
- **History Behavior**: Toggle whether the app asks for confirmation before clearing your local history.

You can access Settings and Templates from the sidebar in the Studio dashboard.

---

## 🎛️ Video Settings

### Aspect Ratio

| Option | Use Case |
|--------|-----------|
| **9:16** Shorts / Reels / TikTok | Vertical (portrait) content — default |
| **16:9** YouTube / Landscape | Standard widescreen |
| **1:1** Square | Instagram feed |

### Export Resolution

| Resolution | 9:16 | 16:9 | 1:1 | When to use |
|------------|------|------|-----|-------------|
| **720p** | 720×1280 | 1280×720 | 720×720 | Fast testing and preview |
| **1080p** | 1080×1920 | 1920×1080 | 1080×1080 | Standard HD — recommended |
| **2K** | 1440×2560 | 2560×1440 | 1440×1440 | High-res presentations |
| **4K** | 2160×3840 | 3840×2160 | 2160×2160 | Maximum quality, slow |

> ⚠️ **2K / 4K Warning:** Higher resolutions take significantly longer to encode, especially with Slow Zoom In, Fade transitions, background music, outro, and watermark enabled.

### Render Profile

| Profile | FPS | FFmpeg Preset | When to use |
|---------|-----|--------------|-------------|
| **Fast Preview** | 24 | ultrafast | Quick timing checks — fastest export |
| **Balanced** | 30 | medium | Recommended for most exports |
| **High Quality** | 30 | slow | Final deliverables — best output |

### Recommended Settings

| Goal | Aspect Ratio | Resolution | Render Profile |
|------|--------------|------------|----------------|
| Testing timing | Any | 720p | Fast Preview |
| Normal Shorts/Reels | 9:16 | 1080p | Balanced |
| YouTube video | 16:9 | 1080p | Balanced |
| Final high-quality | Any | 1080p or 2K | High Quality |
| Maximum quality | Any | 4K | High Quality |

> **Note:** 4K + High Quality + Slow Zoom In is an extremely demanding combination. Only use it when you genuinely need 4K output and have time to wait.

### Other Settings

| Setting | Options |
|---------|---------|
| **Image Fit Mode** | Cover/Crop (fills screen) · Contain/Fit (blurred background) |
| **Transition** | None (direct cut) · Fade |
| **Zoom Effect** | None (static) · Slow Zoom In (Ken Burns effect) |

---

## ✨ Optional Enhancements

### 🎵 Background Music

Upload any MP3, WAV, M4A, or AAC file.

- Music is **automatically looped** if shorter than the video, or **trimmed** if longer
- Adjust the **Volume** slider (recommended: 10–15% for subtle background)
- Enable **Fade In / Fade Out** for a smooth opening and ending
- If the voice track is hard to hear, lower the music volume further

### 🎬 Outro / Ending Video

Upload any MP4, MOV, or WEBM file to be **appended** at the end of your generated video.

- The outro is automatically resized and cover-cropped to match your selected aspect ratio and resolution
- The outro's original audio is preserved
- If the outro has a different frame rate, it is matched to the main video

### 🔡 Watermark / Branding

Add a subtle text label over the entire video.

| Setting | Default | Description |
|---------|---------|-------------|
| Watermark Text | *(empty)* | e.g. `@YourChannel`, `Automist Labs`, `Follow for more` |
| Position | Bottom Right | Top Left · Top Right · Bottom Left · Bottom Right · Center |
| Size | Small | Small · Medium · Large (scales with resolution) |
| Opacity | 65% | 10–100% — lower is more subtle |
| Edge Margin | 36px | Distance from the edge of the frame |

**Tips:**
- Keep **Small** size and **65% opacity** for a professional, unobtrusive look
- The watermark uses a semi-transparent dark pill background for readability on both bright and dark images
- Watermark appears on the main video **and** the outro if an outro is attached
- No ImageMagick required — rendered entirely with Pillow (Python)

---

These features are optional — your video generates normally without them.
Click **Optional Enhancements** on the app to expand this section.

### 🎵 Background Music

Upload a music file (MP3, WAV, M4A, or AAC) to add low-volume background music behind your main audio.

| Option | Details |
|--------|---------|
| **Enable toggle** | Must be ON for music to be applied |
| **Music Volume** | 0–100%. **Recommended: 10–15%** to keep the voice clear |
| **Fade In / Fade Out** | Smoothly fades the music at the start and end (default: on) |

**How it works:**
- Music is **automatically looped** if it is shorter than your video
- Music is **automatically trimmed** if it is longer than your video
- The main audio (voice) stays at full volume — the music plays behind it
- If you upload a music file but leave the toggle off, no music is applied

### 🎬 Outro / Ending Video

Upload a short ending video clip (MP4, MOV, or WEBM) to append after your main video.

**Examples of common outros:**
- "Subscribe" or "Follow for more" screens
- "Like & Share" animations
- Channel branding or logo reveals

**How it works:**
- The outro is automatically **resized and cropped** to match your selected aspect ratio (16:9, 9:16, or 1:1)
- The outro's original audio is preserved
- If the outro has no audio, that is fine — no crash occurs
- The outro can be any duration; very long outros are allowed but not recommended

---

## ❗ Troubleshooting

### "Backend offline" shows in the app
→ The FastAPI backend isn't running. Run `start_app.command` or manually start it:
```bash
cd backend && source .venv/bin/activate && uvicorn main:app --host 127.0.0.1 --port 8000
```

### FFmpeg not found
→ Install it: `brew install ffmpeg`
→ If brew itself is missing: https://brew.sh/

### Port already in use
→ Run `stop_app.command` to kill existing processes, then try `start_app.command` again.
→ Or manually: `lsof -iTCP:8000 -sTCP:LISTEN` then `kill <PID>`

### `npm: command not found`
→ Install Node.js from https://nodejs.org/ (choose LTS version)

### `python3: command not found`
→ Install Python from https://www.python.org/downloads/

### pip install fails
→ Make sure you're inside the virtual environment: `source backend/.venv/bin/activate`
→ Check your internet connection

### Zoom effect error (fixed!)
→ This was a bug in MoviePy 1.0.3 where `ImageClip` was used instead of `VideoClip` for
  the Ken Burns effect. It has been fixed. If you still see errors, make sure you have
  the latest version of this project.

### Video has no audio
→ Make sure the audio file is a valid MP3/WAV/M4A (not corrupted or empty)

### ZIP extraction fails
→ Make sure images are at the root of the ZIP, not in a subfolder
→ Re-zip the images by selecting them all in Finder → right-click → Compress

### Unsupported outro video format
→ Only **MP4, MOV, and WEBM** are supported for outro videos
→ Convert your outro with FFmpeg: `ffmpeg -i outro.avi -c:v libx264 outro.mp4`
→ Or use a free converter like HandBrake (https://handbrake.fr/)

### Unsupported background music format
→ Only **MP3, WAV, M4A, and AAC** are supported for background music
→ Convert with FFmpeg: `ffmpeg -i music.ogg -c:a libmp3lame music.mp3`

### Outro video fails or shows an error
→ Check that the outro file is not corrupt by playing it in a media player first
→ Try re-encoding it: `ffmpeg -i bad_outro.mp4 -c:v libx264 -c:a aac fixed_outro.mp4`
→ If the outro is a very unusual codec or resolution, re-encode it to standard H.264 MP4

### Background music is too loud or too quiet
→ Adjust the **Music Volume** slider (recommended: 10–15% for subtle background)
→ If the main voice is hard to hear, lower the music volume further

### Background music cuts off abruptly
→ Enable **Fade In / Fade Out** in the Optional Enhancements panel for a smoother ending

### Generation takes too long (4K / High Quality)
→ Select **720p + Fast Preview** for timing checks — only use 4K for final exports
→ Avoid combining **4K + High Quality + Slow Zoom In** — this is the most demanding combination
→ Use **Balanced** render profile instead of High Quality for most exports
→ Slow Zoom In adds per-frame Python processing — use it only when needed

### Watermark is not visible
→ Make sure you entered text AND enabled the **Enable Watermark** toggle
→ Increase the **Opacity** slider (try 80–100% if the watermark is invisible on bright images)
→ Change the **Position** to one that doesn't overlap with bright white or transparent areas
→ Try **Medium** or **Large** size if the text is too small for your resolution

### Watermark text looks blurry or pixelated
→ This can happen with the PIL default bitmap font if no system font is found
→ On macOS, the app uses `/System/Library/Fonts/Helvetica.ttc` — this is normally available
→ If the font looks wrong, try re-running the app after a system update

### Output file is too large
→ Use **Balanced** instead of **High Quality** render profile
→ Use **1080p** instead of **2K** or **4K**
→ **Fast Preview** produces the smallest files (ultrafast encoding, 0.55× bitrate)

---

## 📁 Project Structure

```
audio-image-sync-studio/
├── start_app.command        ← Double-click to start everything
├── stop_app.command         ← Double-click to stop everything
├── .gitignore
├── README.md
├── GITHUB_PUSH_GUIDE.md
│
├── frontend/                ← React + Vite + TypeScript + Tailwind UI
│   └── src/
│       ├── App.tsx
│       ├── components/
│       ├── types/
│       └── utils/
│
├── backend/                 ← Python FastAPI server
│   ├── main.py              ← API routes
│   ├── video_generator.py   ← MoviePy video engine
│   ├── utils.py             ← CSV/ZIP/image helpers
│   ├── requirements.txt
│   ├── uploads/             ← Temp upload storage (auto-cleaned)
│   ├── outputs/             ← Generated MP4 files saved here
│   └── temp/                ← Working directory (auto-cleaned)
│
└── logs/                    ← Runtime logs (not pushed to GitHub)
    ├── backend.log
    └── frontend.log
```

---

## 👥 For Friends — Clone & Run

1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/audio-image-sync-studio.git
   cd audio-image-sync-studio
   ```

2. Install FFmpeg:
   ```bash
   brew install ffmpeg
   ```

3. Double-click `start_app.command` — it handles everything else!

> This is a **localhost app**. It runs on your own computer. You cannot share a link to it — your friends need to clone it and run it themselves.

---

## 🏗️ Built With

- [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [MoviePy 1.0.3](https://zulko.github.io/moviepy/)
- [Pillow](https://python-pillow.org/)
- [FFmpeg](https://ffmpeg.org/)
