# Changelog

All notable changes to SyncFrame Studio are recorded here.
This file starts at 2.0.0; earlier releases were not tracked.

## [2.0.0] — 2026-07-31

A big release. SyncFrame Studio can now generate speech as well as video, and
the caption system has been rebuilt from the ground up.

### New: Text to Speech

Turn a script into natural-sounding narration without leaving the app.

- **Two kinds of voice.** *Local* voices run entirely on your computer — no
  internet needed once a voice has been downloaded, and nothing is sent
  anywhere. *Cloud* voices are higher-quality neural voices that need a
  connection, because your text is sent to the speech service to be voiced.
  The engine is labelled clearly on every voice so you always know which
  you're using.
- **Hundreds of voices across 76 languages**, filterable by language, gender
  and engine, with a searchable picker.
- **Long Form mode** for scripts far longer than a single pass allows. Long
  scripts are split at natural breaks, voiced piece by piece, and joined into
  one seamless audio file.
- **Auto-Translate.** If your script isn't in the voice's language, SyncFrame
  offers to translate it before voicing. You're told what it detected, what
  it will translate to, and exactly what the translation adds to the cost
  before anything happens.
- **WAV or MP3 output**, saved straight to your History.
- Text to Speech works from the batch queue too, so you can line up several
  jobs and let them run.

### Rebuilt: Captions

The caption system has been completely redone.

- **Word-by-word karaoke highlighting.** Each word lights up exactly as it's
  spoken. This is driven by real word-level timing from the transcription,
  not an estimate, so it stays in sync with the voice.
- **28 caption styles**, from bold social-media looks to clean documentary
  subtitles. Eleven of them use the new word highlighting, including a
  typewriter reveal and a highlighter-pen effect.
- **Write your own captions.** Alongside automatic transcription and
  uploading an SRT file, you can now type captions by hand and set your own
  timings, with mistakes like overlapping or backwards times flagged as you
  go.
- **Much deeper customisation** — fonts, colours, size, position, animation,
  and full control over the highlight colour, size and style.

### New: Excel (.xlsx) timeline uploads

Image Timeline, Video Timeline and Media Timeline now accept Excel files
wherever they accepted CSV, using the same timings and column layout. Every
time format works in both, including short decimals like `0.5` and relative
end times like `+5`.

**Good to know:** Excel likes to reinterpret what you type in a timestamp
column — turning `+5` into a formula, or showing `0.5` as a clock time.
SyncFrame now handles those cases correctly, but formatting your start and
end columns as **Text** before typing is still the most reliable approach.
The in-app Format Guide lists every supported format.

### Security

Your plan is now verified by the server whenever a job starts, rather than
being taken on trust from the app. Previously the app told the server which
plan you were on, which meant the limits tied to a plan — export resolution,
batch access and similar — could be worked around. Those limits are now
enforced where they can't be tampered with.

This required no action from you, and no existing project or output is
affected.

### Also in this release

- Fixed the Batch Video Generator's live status freezing while the app was
  minimised or in the background — job counts and progress now keep updating.
- Fixed Auto-Translate failing on longer non-English scripts.
- Fixed CSV downloads from Script Timestamp opening with garbled characters
  in Excel.
- The credit cost of a Text to Speech job is now shown clearly before you
  generate, including a breakdown when translation is involved.
- Dropdowns across the app have been polished, and the caption source
  dropdown is now readable in Dark Mode.
