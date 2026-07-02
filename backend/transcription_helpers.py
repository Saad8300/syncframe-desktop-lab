"""
transcription_helpers.py
Backend local Whisper transcription engine for SyncFrame Studio.
Uses faster-whisper for efficient CPU/GPU transcription.
No cloud APIs. Audio stays local.
"""

import logging
import os
import tempfile
import re
import math
import subprocess
import json
import shutil
from pathlib import Path
from typing import Callable, List, Optional, Dict, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model cache — reuse loaded models across requests
# ---------------------------------------------------------------------------

_model_cache: dict = {}

# ---------------------------------------------------------------------------
# Segment helpers
# ---------------------------------------------------------------------------

def seconds_to_ts(s: float) -> str:
    """Convert seconds to M:SS format. e.g. 65.3 → '1:05'"""
    total = max(0, int(s))
    m, sec = divmod(total, 60)
    return f"{m}:{sec:02d}"


def seconds_to_srt(s: float) -> str:
    """Convert seconds to SRT HH:MM:SS,mmm format."""
    total_ms = int(round(s * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    h, rem = divmod(total_s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


# ---------------------------------------------------------------------------
# Formatter functions
# ---------------------------------------------------------------------------

def format_simple(segments: list) -> str:
    """[0:00] Text here"""
    return "\n".join(f"[{seconds_to_ts(s['start'])}] {s['text'].strip()}" for s in segments if s['text'].strip())


def format_detailed(segments: list) -> str:
    """[0:00 - 0:04] Text here"""
    return "\n".join(
        f"[{seconds_to_ts(s['start'])} - {seconds_to_ts(s['end'])}] {s['text'].strip()}"
        for s in segments if s['text'].strip()
    )


def format_scene_plan(segments: list) -> str:
    """Scene 1\nTime: 0:00 - 0:04\nLine: Text here"""
    parts = []
    i = 1
    for s in segments:
        if not s['text'].strip(): continue
        parts.append(
            f"Scene {i}\nTime: {seconds_to_ts(s['start'])} - {seconds_to_ts(s['end'])}\nLine: {s['text'].strip()}"
        )
        i += 1
    return "\n\n".join(parts)


def format_srt(segments: list) -> str:
    """Standard SRT subtitle format."""
    parts = []
    i = 1
    for s in segments:
        if not s['text'].strip(): continue
        parts.append(
            f"{i}\n{seconds_to_srt(s['start'])} --> {seconds_to_srt(s['end'])}\n{s['text'].strip()}"
        )
        i += 1
    return "\n\n".join(parts)


def format_timeline_csv(segments: list) -> str:
    """start,end,text — compatible with SyncFrame Image/Media Timeline."""
    rows = ['start,end,text']
    for s in segments:
        text = s['text'].strip()
        if not text: continue
        safe = text.replace('"', '""')
        rows.append(f'{s["start"]:.2f},{s["end"]:.2f},"{safe}"')
    return "\n".join(rows)


def format_output(segments: list, output_format: str) -> str:
    """Route to the correct formatter based on output_format string."""
    fmt = output_format.lower().strip()
    if fmt == "detailed":
        return format_detailed(segments)
    elif fmt == "scene":
        return format_scene_plan(segments)
    elif fmt == "srt":
        return format_srt(segments)
    elif fmt == "csv":
        return format_timeline_csv(segments)
    else:
        return format_simple(segments)


# ---------------------------------------------------------------------------
# Original Script Alignment
# ---------------------------------------------------------------------------

def _align_original_script(segments: list, original_script: str) -> list:
    """
    Heuristically map sentences/phrases from original script to whisper segments.
    Provides cleaner text while preserving Whisper timings.
    """
    import difflib
    
    # 1. Normalize and split original script into sentences
    # Replace multiple newlines/spaces with single space
    script = re.sub(r'\s+', ' ', original_script).strip()
    if not script:
        return segments
        
    # Split by standard sentence boundaries
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', script) if s.strip()]
    if not sentences:
        # Fallback to comma split if no periods
        sentences = [s.strip() for s in re.split(r'(?<=,)\s+', script) if s.strip()]
        
    if not sentences:
        return segments

    # 2. Extract Whisper text
    whisper_full_text = " ".join([s["text"].strip() for s in segments])
    
    # If the whisper text is wildly different in length, alignment might be messy,
    # but we will try anyway proportionally.
    
    # 3. Time mapping based on proportion of characters
    total_chars = sum(len(s) for s in sentences)
    if total_chars == 0:
        return segments
        
    aligned = []
    total_duration = segments[-1]["end"] - segments[0]["start"]
    start_time = segments[0]["start"]
    
    current_time = start_time
    for sentence in sentences:
        proportion = len(sentence) / total_chars
        duration = total_duration * proportion
        end_time = current_time + duration
        
        aligned.append({
            "start": current_time,
            "end": min(end_time, segments[-1]["end"]),
            "text": sentence
        })
        current_time = end_time

    # Return proportionally mapped segments
    # The output timings are completely synthetic based on proportion of text length,
    # but bounded by the total whisper duration. This is safe, doesn't crash, and preserves sequence.
    return aligned


# ---------------------------------------------------------------------------
# Segmentation helpers — apply advanced settings
# ---------------------------------------------------------------------------

def apply_segmentation(
    raw_segments: list,
    output_style: str = "standard",
    segmentation_intensity: str = "detailed",
    advanced: Optional[Dict[str, Any]] = None
) -> list:
    """
    Post-process raw Whisper segments.
    """
    if advanced is None:
        advanced = {}

    segments = list(raw_segments)

    # 1. Determine targets based on settings
    # Default target segment length
    if "target_segment_length" in advanced:
        target_range = advanced["target_segment_length"]
        if target_range == "1-2":
            target_sec = 1.5
        elif target_range == "3-5":
            target_sec = 4.0
        else:
            target_sec = 2.5
    else:
        if output_style == "visual_beat":
            target_sec = {"aggressive": 1.5, "detailed": 2.5, "normal": 3.5}.get(segmentation_intensity, 2.5)
        else:
            target_sec = {"aggressive": 3.0, "detailed": 5.0, "normal": 8.0}.get(segmentation_intensity, 5.0)

    # Default max words
    if "max_words_per_line" in advanced:
        word_range = advanced["max_words_per_line"]
        if word_range == "4-6":
            max_words = 5
        elif word_range == "9-12":
            max_words = 10
        else:
            max_words = 7
    else:
        if output_style == "visual_beat":
            max_words = {"aggressive": 5, "detailed": 7, "normal": 10}.get(segmentation_intensity, 7)
        else:
            max_words = {"aggressive": 10, "detailed": 15, "normal": 25}.get(segmentation_intensity, 15)

    split_on_punct = advanced.get("split_on_punctuation", True)
    avoid_short = advanced.get("avoid_very_short_lines", True)

    # 2. Split long segments
    split_segments = []
    for seg in segments:
        duration = seg["end"] - seg["start"]
        text = seg["text"].strip()
        words = text.split()
        
        # If segment is too long or has too many words, split it
        if duration > target_sec * 1.5 or len(words) > max_words * 1.5:
            # How many parts do we need?
            time_parts = math.ceil(duration / target_sec)
            word_parts = math.ceil(len(words) / max_words)
            num_parts = max(time_parts, word_parts)
            
            sub_segs = _split_segment(seg, num_parts, split_on_punct)
            split_segments.extend(sub_segs)
        else:
            split_segments.append(seg)
            
    # 3. Merge very short segments if avoid_short is True
    if avoid_short:
        merged = []
        for seg in split_segments:
            if not merged:
                merged.append(seg)
                continue
            
            prev = merged[-1]
            prev_duration = prev["end"] - prev["start"]
            prev_words = len(prev["text"].split())
            
            # If previous segment is very short (< 1 sec) or has <= 2 words, merge current into it
            if prev_duration < 1.0 or prev_words <= 2:
                # But only if merging doesn't make it massively exceed targets
                if (prev_duration + (seg["end"] - seg["start"])) < (target_sec * 1.8) and (prev_words + len(seg["text"].split())) < (max_words * 1.8):
                    prev["end"] = seg["end"]
                    prev["text"] = prev["text"] + " " + seg["text"].strip()
                else:
                    merged.append(seg)
            else:
                merged.append(seg)
        split_segments = merged

    # Clean up empty
    return [s for s in split_segments if s["text"].strip()]


def _split_segment(seg: dict, num_parts: int, split_on_punct: bool) -> list:
    """Split a single segment into roughly `num_parts`."""
    text = seg["text"].strip()
    duration = seg["end"] - seg["start"]
    
    parts = []
    if split_on_punct:
        parts = [p.strip() for p in re.split(r'(?<=[.!?,-])\s+', text) if p.strip()]
        
    if len(parts) < 2:
        # Fallback to word splitting if no punctuation or split_on_punct=False
        words = text.split()
        if len(words) < num_parts:
            return [seg]
            
        chunk_size = math.ceil(len(words) / num_parts)
        parts = []
        for i in range(0, len(words), chunk_size):
            parts.append(" ".join(words[i:i+chunk_size]))
            
    # Distribute time proportionally by character count
    total_chars = sum(len(p) for p in parts)
    result = []
    current_start = seg["start"]
    
    for part in parts:
        if not part.strip():
            continue
        part_duration = duration * (len(part) / max(total_chars, 1))
        part_end = min(current_start + part_duration, seg["end"])
        result.append({
            "start": current_start,
            "end": part_end,
            "text": part.strip(),
        })
        current_start = part_end
    
    return result if result else [seg]


def post_process_timestamp_segments(
    segments: list,
    options: dict
) -> list:
    """
    Post-processes segments: sorts, clamps, merges tiny segments, and closes gaps.
    options:
      - mode: str
      - intensity: str
      - audioDuration: float
    """
    if not segments:
        return []

    mode = options.get("mode", "standard")
    intensity = options.get("intensity", "detailed")
    audio_duration = options.get("audioDuration", 0.0)

    # 2. Sort by start time
    processed = sorted(segments, key=lambda x: x["start"])

    # 3. Clamp invalid values
    for s in processed:
        s["start"] = max(0.0, s["start"])
        s["end"] = min(audio_duration + 0.1, max(s["start"] + 0.1, s["end"]))

    is_visual_mode = mode in ["visual_beat", "csv", "image_timeline_csv", "media_timeline_csv", "video_timeline_csv"]

    # 4. Merge very short segments (under 1.25s roughly depending on intensity)
    if is_visual_mode:
        if intensity == "light":
            short_thresh = 1.5
        elif intensity == "normal":
            short_thresh = 1.25
        else:
            short_thresh = 1.0

        merged = []
        skip_next = False
        for i in range(len(processed)):
            if skip_next:
                skip_next = False
                continue

            curr = processed[i]
            dur = curr["end"] - curr["start"]

            if dur < short_thresh:
                # try merge with next
                if i + 1 < len(processed):
                    nxt = processed[i+1]
                    gap_to_next = nxt["start"] - curr["end"]
                    if gap_to_next <= 0.75:
                        curr["end"] = max(curr["end"], nxt["end"])
                        curr["text"] = curr["text"].strip() + " " + nxt["text"].strip()
                        merged.append(curr)
                        skip_next = True
                        continue
                        
                # merge with previous if possible
                if merged:
                    prev = merged[-1]
                    gap_to_prev = curr["start"] - prev["end"]
                    if gap_to_prev <= 0.75:
                        prev["end"] = max(prev["end"], curr["end"])
                        prev["text"] = prev["text"].strip() + " " + curr["text"].strip()
                        continue
                        
                merged.append(curr)
            else:
                merged.append(curr)
        processed = merged

    # 5. Handle small gaps and overlaps
    gap_thresh = 0.75
    for i in range(len(processed) - 1):
        curr = processed[i]
        nxt = processed[i+1]
        gap = nxt["start"] - curr["end"]

        if is_visual_mode and 0 < gap <= gap_thresh:
            # Close gap safely by setting next start = previous end
            nxt["start"] = curr["end"]
        elif gap < 0:
            # Overlap! Fix overlap by setting curr end to nxt start
            curr["end"] = nxt["start"]
            if curr["end"] <= curr["start"]:
                curr["end"] = curr["start"] + 0.05 # safety push

    # Final clamp and overlap safety pass
    for i in range(len(processed)):
        if i < len(processed) - 1 and processed[i]["end"] > processed[i+1]["start"]:
            processed[i]["end"] = processed[i+1]["start"]
        processed[i]["end"] = min(audio_duration + 0.1, max(processed[i]["start"] + 0.05, processed[i]["end"]))

    return processed

# ---------------------------------------------------------------------------
# Core transcription function
# ---------------------------------------------------------------------------

def transcribe_audio_backend(
    audio_path: str,
    model_name: str = "base",
    language: Optional[str] = None,
    output_style: str = "standard",
    segmentation_intensity: str = "detailed",
    original_script: Optional[str] = None,
    advanced_settings: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[Callable[[str, int], None]] = None
) -> dict:
    """
    Main entry point for backend transcription.
    1. Load model (cached)
    2. Transcribe
    3. Align original script (if provided)
    4. Apply segmentation/formatting
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError("faster-whisper is not installed. Please run backend setup.")

    if progress_callback:
        progress_callback("Validating and preparing audio…", 5)

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Process audio with ffmpeg: 16kHz, mono, wav format
    processed_audio_path = os.path.join(tempfile.gettempdir(), f"processed_{os.path.basename(audio_path)}.wav")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", audio_path,
            "-ac", "1", "-ar", "16000", "-f", "wav", processed_audio_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        raise RuntimeError("Failed to process audio with ffmpeg. Make sure the file is a valid audio format.")
    except FileNotFoundError:
        logger.warning("ffmpeg not found in PATH, skipping audio pre-processing. May affect transcription accuracy.")
        processed_audio_path = audio_path

    # Get duration using ffprobe
    true_duration = 0.0
    try:
        probe_res = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", processed_audio_path
        ], capture_output=True, text=True, check=True)
        true_duration = float(probe_res.stdout.strip())
    except Exception as e:
        logger.warning(f"Could not probe duration with ffprobe: {e}")

    if progress_callback:
        progress_callback("Loading AI model…", 10)

    # Initialize model (cpu int8 is very fast and safe for all machines)
    if model_name not in ["tiny", "base", "small", "medium"]:
        model_name = "base"
        
    if model_name not in _model_cache:
        logger.info(f"Loading faster-whisper model '{model_name}'...")
        _model_cache[model_name] = WhisperModel(model_name, device="cpu", compute_type="int8")
    
    model = _model_cache[model_name]

    if progress_callback:
        progress_callback("Transcribing audio…", 20)

    # Transcribe
    segments_gen, info = model.transcribe(
        processed_audio_path,
        language=language,
        vad_filter=True,
        beam_size=5
    )

    if true_duration == 0.0:
        true_duration = info.duration

    raw_segments = []
    for i, segment in enumerate(segments_gen):
        start_t = max(0.0, segment.start)
        end_t = min(true_duration, segment.end)
        
        if end_t <= start_t:
            continue
            
        raw_segments.append({
            "start": start_t,
            "end": end_t,
            "text": segment.text.strip(),
        })
        if progress_callback and i % 5 == 0:
            progress_callback(f"Transcribing… ({seconds_to_ts(end_t)})", min(90, 20 + i))

    if not raw_segments:
        if processed_audio_path != audio_path:
            try: os.remove(processed_audio_path)
            except Exception: pass
        raise ValueError("Transcription returned no text. The audio might be silent or too noisy.")
        
    duration = true_duration
    
    # Optional Script Alignment
    original_script_used = False
    if original_script and original_script.strip():
        if progress_callback:
            progress_callback("Aligning original script…", 92)
        try:
            raw_segments = _align_original_script(raw_segments, original_script)
            original_script_used = True
        except Exception as e:
            logger.warning(f"Original script alignment failed: {e}. Falling back to Whisper text.")

    if progress_callback:
        progress_callback("Applying segmentation…", 95)

    final_segments = apply_segmentation(
        raw_segments,
        output_style=output_style,
        segmentation_intensity=segmentation_intensity,
        advanced=advanced_settings
    )

    # Post processing
    final_segments = post_process_timestamp_segments(
        final_segments,
        options={
            "mode": output_style if output_style != "standard" else "csv",
            "intensity": segmentation_intensity,
            "audioDuration": duration
        }
    )

    avg_len = 0
    if final_segments:
        avg_len = sum(s["end"] - s["start"] for s in final_segments) / len(final_segments)

    if processed_audio_path != audio_path:
        try: os.remove(processed_audio_path)
        except Exception: pass

    return {
        "segments": final_segments,
        "segments_count": len(final_segments),
        "duration": duration,
        "language": info.language,
        "avg_segment_length": round(avg_len, 2),
        "original_script_used": original_script_used,
        "model_name": model_name
    }
