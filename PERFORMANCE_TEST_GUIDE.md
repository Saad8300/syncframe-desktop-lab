# Video Timeline Performance & Testing Guide

This guide covers performance best practices and how to test the Video Timeline workflow effectively.

## Performance Guide

For the best experience, especially with longer timelines, keep these tips in mind:

- **Use 720p Fast Preview First:** When testing timing and clip sequences, use the `720p` + `Fast Preview` render profile. This generates videos significantly faster without complex encoding.
- **Long Timelines:** Timelines longer than 10 minutes are fully supported but can take several minutes to encode.
- **Heavy Visuals:** Combining `4K` resolution, `High Quality` profile, `Blur Crossfade` transitions, or `High` visual styles can be computationally expensive and will substantially increase render time.
- **Repeated Clips:** You can reuse the exact same video file (e.g., `1.mp4`) multiple times across different CSV rows without duplicating it in the ZIP file. The system handles this efficiently.
- **Audio Rules:** The main audio file you upload dictates the final video's audio track. The original audio from individual video clips is muted by default.
- **Timeline Sequencing:** The CSV dictates exactly *when* and *for how long* each clip appears on the timeline. If the visual timeline ends before the audio finishes, black padding will be applied automatically.

---

## Testing Checklist

To confirm the Video Timeline feature is fully stable, run the following test cases.

### Test Asset Preparation
Create a `videos.zip` containing three short test clips: `1.mp4`, `2.mp4`, `3.mp4`.
Create a `timeline.csv` with the following content:
```csv
start,end,video
0,5,1.mp4
5,10,2.mp4
10,15,1.mp4
15,20,3.mp4
```

### Test Cases
- [ ] **Basic 720p Fast Preview:** Generate using the default settings.
- [ ] **1080p Balanced:** Generate using higher resolution and standard profile.
- [ ] **Repeated Clip Handling:** Verify `1.mp4` successfully plays from `0-5s` and again at `10-15s`.
- [ ] **Audio Longer Than Timeline:** Use a 30-second audio track. Verify the final 10 seconds are padded with black.
- [ ] **Timeline Longer Than Audio:** Use a 10-second audio track. Verify the visual timeline still completes accurately but is silent after 10s.
- [ ] **Transitions Enabled:** Select `Crossfade` or `Slide Left` and verify smooth overlap between the four clips.
- [ ] **Visual Style Enabled:** Apply the `Cinematic` style and ensure the color grading is visible across all clips.
- [ ] **Intro/Outro/Watermark:** Add a watermark text, upload an intro, and upload an outro video. Verify they append correctly to the generated timeline.
- [ ] **Missing Video File Error:** Add a row referencing `4.mp4` (which isn't in the ZIP) and verify a clear error message is shown instead of a crash.
- [ ] **Overlapping Rows Error:** Change row 2 to start at `3s` instead of `5s` and verify the overlap validation catches it.
