"""
audio_helpers.py — Shared audio preparation helper for all timeline routes.

Supports two input modes:
  - 'single': one audio file uploaded directly
  - 'zip':    a ZIP of numbered audio parts (1.mp3, 2.mp3, …)

All merged output is written as WAV/PCM (pcm_s16le) — universally supported
on standard Mac and Windows FFmpeg builds without libfdk_aac.
"""

from __future__ import annotations

import io
import logging
import os
import re
import zipfile
from pathlib import Path
from typing import Optional
from moviepy.editor import AudioFileClip, concatenate_audioclips

logger = logging.getLogger(__name__)

# Audio extensions supported inside a ZIP
SUPPORTED_AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac"}


def _natural_sort_key(s: str):
    """Return a key for natural (human-friendly) filename sorting.
    e.g. ['1.mp3', '2.mp3', '10.mp3'] not ['1.mp3', '10.mp3', '2.mp3']
    """
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"([0-9]+)", s)]


def prepare_single_audio(
    audio_bytes: bytes,
    original_filename: str,
    job_temp: Path,
) -> tuple[str, dict]:
    """
    Save a single uploaded audio file into job_temp.
    Returns (audio_path, metadata).
    """
    ext = Path(original_filename).suffix.lower() if original_filename else ".mp3"
    if ext not in SUPPORTED_AUDIO_EXTS:
        ext = ".mp3"
    audio_path = str(job_temp / f"audio{ext}")
    with open(audio_path, "wb") as f:
        f.write(audio_bytes)
    logger.info("Single audio saved: %s (%d bytes)", audio_path, len(audio_bytes))
    return audio_path, {
        "audio_mode": "single",
        "audio_parts_count": 1,
        "audio_parts_order": [original_filename or "audio"],
    }


def prepare_zip_audio(
    zip_bytes: bytes,
    job_temp: Path,
) -> tuple[str, dict]:
    """
    Extract a ZIP of numbered audio parts, merge them in natural filename order,
    and export as merged_audio.wav (pcm_s16le).

    Returns (merged_audio_path, metadata).
    Raises ValueError with a user-friendly message on any problem.
    """
    # ── 1. Validate / open ZIP ─────────────────────────────────────────────
    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise ValueError("Audio ZIP file is invalid or corrupted.")

    # ── 2. Collect audio entries (skip system files / folders) ─────────────
    entries: list[zipfile.ZipInfo] = []
    seen_basenames: dict[str, str] = {}  # basename → full name, for dupe detection

    for info in zf.infolist():
        name = info.filename
        # Skip directories, hidden files, macOS noise
        if info.is_dir():
            continue
        basename = Path(name).name
        if basename.startswith(".") or basename.startswith("__"):
            continue
        # Only supported audio extensions
        ext = Path(basename).suffix.lower()
        if ext not in SUPPORTED_AUDIO_EXTS:
            continue
        # Duplicate basename check
        if basename in seen_basenames:
            raise ValueError(
                f"Audio ZIP contains duplicate audio filename: {basename}. "
                "Please ensure each audio part has a unique filename."
            )
        seen_basenames[basename] = name
        entries.append(info)

    if not entries:
        raise ValueError(
            "Audio ZIP does not contain supported audio files. "
            "Include .mp3, .wav, .m4a, or .aac files named 1.mp3, 2.mp3, …"
        )

    # ── 3. Natural-sort by basename ────────────────────────────────────────
    entries.sort(key=lambda e: _natural_sort_key(Path(e.filename).name))
    order = [Path(e.filename).name for e in entries]
    logger.info("Audio ZIP parts (sorted): %s", " → ".join(order))

    # ── 4. Extract each audio part ─────────────────────────────────────────
    extracted_paths: list[str] = []
    for i, info in enumerate(entries):
        ext = Path(info.filename).suffix.lower()
        dest = str(job_temp / f"audio_part_{i:04d}{ext}")
        audio_data = zf.read(info.filename)
        with open(dest, "wb") as f:
            f.write(audio_data)
        extracted_paths.append(dest)
        logger.info("Extracted audio part %d: %s → %s", i + 1, info.filename, dest)

    zf.close()

    # ── 5. Single part — no merge needed ──────────────────────────────────
    if len(extracted_paths) == 1:
        logger.info("Only one audio part in ZIP — using directly.")
        return extracted_paths[0], {
            "audio_mode": "zip",
            "audio_parts_count": 1,
            "audio_parts_order": order,
        }

    # ── 6. Multi-part — load, concatenate, export as WAV ──────────────────
    from moviepy.editor import AudioFileClip, concatenate_audioclips

    clips: list[AudioFileClip] = []
    try:
        for i, path in enumerate(extracted_paths):
            try:
                clip = AudioFileClip(path)
                clips.append(clip)
                logger.info("Loaded audio part %d: %s (%.2f s)", i + 1, path, clip.duration)
            except Exception as e:
                for c in clips:
                    try:
                        c.close()
                    except Exception:
                        pass
                raise ValueError(
                    f'Audio part "{order[i]}" could not be processed. '
                    f"Check that the file is a valid audio file. Detail: {e}"
                )

        merged_path = str(job_temp / "merged_audio.wav")
        logger.info("Merging %d audio parts → %s", len(clips), merged_path)

        try:
            merged = concatenate_audioclips(clips)
            # WAV/PCM — works on all standard FFmpeg builds, no libfdk_aac required
            merged.write_audiofile(merged_path, fps=44100, codec="pcm_s16le", logger=None)
            logger.info("Merged audio written: %s", merged_path)
        except Exception as e:
            raise ValueError(
                f"Audio merge failed. Please check your audio files and try again. "
                f"Detail: {e}"
            )
        finally:
            try:
                merged.close()  # type: ignore[possibly-undefined]
            except Exception:
                pass

    finally:
        for c in clips:
            try:
                c.close()
            except Exception:
                pass

    return merged_path, {
        "audio_mode": "zip",
        "audio_parts_count": len(order),
        "audio_parts_order": order,
    }


async def prepare_multiple_audio(
    upload_files: list,
    job_temp: Path,
) -> tuple[str, dict]:
    """
    Fallback for legacy audio_files.
    """
    entries = []
    for file_obj in upload_files:
        if not file_obj.filename:
            continue
        ext = Path(file_obj.filename).suffix.lower()
        if ext not in SUPPORTED_AUDIO_EXTS:
            continue
        entries.append(file_obj)

    if not entries:
        raise ValueError("No supported audio files found in fallback.")

    entries.sort(key=lambda e: _natural_sort_key(e.filename))
    order = [e.filename for e in entries]
    logger.info("Fallback audio parts (sorted): %s", " → ".join(order))

    extracted_paths = []
    for i, file_obj in enumerate(entries):
        ext = Path(file_obj.filename).suffix.lower()
        dest = str(job_temp / f"audio_part_{i:04d}{ext}")
        content = await file_obj.read()
        with open(dest, "wb") as f:
            f.write(content)
        extracted_paths.append(dest)

    if len(extracted_paths) == 1:
        return extracted_paths[0], {
            "audio_mode": "fallback_single",
            "audio_parts_count": 1,
            "audio_parts_order": order,
        }

    from moviepy.editor import AudioFileClip, concatenate_audioclips

    clips = []
    try:
        for i, path in enumerate(extracted_paths):
            try:
                clip = AudioFileClip(path)
                clips.append(clip)
            except Exception as e:
                for c in clips:
                    try: c.close()
                    except: pass
                raise ValueError(f'Audio part "{order[i]}" could not be processed. Detail: {e}')

        merged_path = str(job_temp / "merged_audio.wav")
        try:
            merged = concatenate_audioclips(clips)
            merged.write_audiofile(merged_path, fps=44100, codec="pcm_s16le", logger=None)
        except Exception as e:
            raise ValueError(f"Audio merge failed. Detail: {e}")
        finally:
            try: merged.close()
            except: pass
    finally:
        for c in clips:
            try: c.close()
            except: pass

    return merged_path, {
        "audio_mode": "fallback_multi",
        "audio_parts_count": len(order),
        "audio_parts_order": order,
    }

def merge_audio_parts_in_order(
    audio_paths: list[str],
    output_path: str,
    output_format: str = "wav",
) -> tuple[float, dict]:
    """
    Load a list of audio files sequentially, concatenate them in the exact order,
    and export as WAV (pcm_s16le) or MP3 (libmp3lame).
    
    Returns (duration, metadata).
    Raises ValueError with user-friendly message on any problem.
    """
    from moviepy.editor import AudioFileClip, concatenate_audioclips
    
    clips = []
    try:
        # Load clips
        for path in audio_paths:
            clips.append(AudioFileClip(path))
            
        if not clips:
            raise ValueError("No audio clips to merge.")
            
        # Merge
        merged_clip = concatenate_audioclips(clips)
        
        # Export
        codec = "pcm_s16le" if output_format == "wav" else "libmp3lame"
        logger.info(f"Exporting merged audio to {output_path} with codec {codec}")
        
        merged_clip.write_audiofile(
            output_path,
            fps=44100,
            codec=codec,
            logger=None
        )
        
        duration = float(merged_clip.duration)
        
        return duration, {
            "parts_merged": len(audio_paths),
            "output_format": output_format,
            "duration": duration,
        }
        
    except Exception as e:
        logger.error(f"Error merging audio parts: {e}")
        raise ValueError(f"Failed to merge audio parts: {str(e)}")
    finally:
        for c in clips:
            try:
                c.close()
            except:
                pass
