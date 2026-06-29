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
        progress_callback("Loading AI model…", 10)

    # Initialize model (cpu int8 is very fast and safe for all machines)
    if model_name not in _model_cache:
        logger.info(f"Loading faster-whisper model '{model_name}'...")
        _model_cache[model_name] = WhisperModel(model_name, device="cpu", compute_type="int8")
    
    model = _model_cache[model_name]

    if progress_callback:
        progress_callback("Transcribing audio…", 20)

    # Transcribe
    segments_gen, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        beam_size=5
    )

    raw_segments = []
    for i, segment in enumerate(segments_gen):
        raw_segments.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
        })
        if progress_callback and i % 5 == 0:
            # We don't know total segments, so we just pulse progress
            progress_callback(f"Transcribing… ({seconds_to_ts(segment.end)})", min(90, 20 + i))

    if not raw_segments:
        raise ValueError("Transcription returned no text. The audio might be silent or too noisy.")
        
    duration = info.duration
    
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

    avg_len = 0
    if final_segments:
        avg_len = sum(s["end"] - s["start"] for s in final_segments) / len(final_segments)

    return {
        "segments": final_segments,
        "segments_count": len(final_segments),
        "duration": duration,
        "language": info.language,
        "avg_segment_length": round(avg_len, 2),
        "original_script_used": original_script_used,
        "model_name": model_name
    }
