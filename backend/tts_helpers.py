"""
tts_helpers.py
Piper text-to-speech engine for SyncFrame Studio.

Local, offline, CPU-only inference via piper-tts (ONNX). No cloud calls at
synthesis time and no GPU required.

Voice models live under get_data_dir()/models/piper/ — a writable per-user
location, NEVER a path relative to __file__, which would break in a
packaged install under Program Files (see runtime_paths.get_data_dir).

Voices bundled into the installer are seeded into that directory on first
use; any voice not bundled is fetched once from the official Piper voice
repository and cached, so the full catalog is selectable without shipping
every model inside the installer.
"""

import json
import logging
import os
import shutil
import sys
import wave
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from runtime_paths import get_data_dir

logger = logging.getLogger(__name__)

VOICE_REPO_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/"

# Where downloaded/seeded voice models are cached at runtime (writable).
VOICES_DIR = get_data_dir() / "models" / "piper"


def _bundled_dir() -> Optional[Path]:
    """
    Directory of voice models shipped inside the installer, if any.
    Frozen build: <bundle>/piper_voices (see syncframe-backend.spec).
    Dev: backend/piper_voices, if the developer pre-downloaded any.
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "piper_voices"
    return Path(__file__).resolve().parent / "piper_voices"


def _index_path() -> Path:
    """The voice catalog index, bundled as a PyInstaller data file."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "piper_voices_index.json"
    return Path(__file__).resolve().parent / "piper_voices_index.json"


_index_cache: Optional[Dict[str, Any]] = None


def load_voice_index() -> Dict[str, Any]:
    """Full Piper voice catalog, keyed by voice id (e.g. 'en_US-amy-medium')."""
    global _index_cache
    if _index_cache is None:
        with open(_index_path(), "r", encoding="utf-8") as f:
            _index_cache = json.load(f)
    return _index_cache


def list_voices() -> List[Dict[str, Any]]:
    """
    Flat, UI-friendly voice list: id, display name, language, quality, size,
    and whether the model is already available locally (so the frontend can
    show a one-time download hint instead of an unexplained delay).
    """
    index = load_voice_index()
    out: List[Dict[str, Any]] = []
    for key, v in index.items():
        lang = v.get("language", {})
        onnx_bytes = sum(
            f.get("size_bytes", 0)
            for name, f in v.get("files", {}).items()
            if name.endswith(".onnx")
        )
        out.append({
            "id": key,
            "name": v.get("name", key),
            "language_code": lang.get("code", ""),
            "language": lang.get("name_english", ""),
            "language_native": lang.get("name_native", ""),
            "country": lang.get("country_english", ""),
            "quality": v.get("quality", ""),
            "num_speakers": v.get("num_speakers", 1),
            "size_bytes": onnx_bytes,
            "downloaded": (VOICES_DIR / f"{key}.onnx").exists(),
        })
    out.sort(key=lambda r: (r["language"], r["name"], r["quality"]))
    return out


def _relative_paths(voice_id: str) -> tuple[str, str]:
    """Repo-relative paths of a voice's .onnx and .onnx.json, from the index."""
    entry = load_voice_index().get(voice_id)
    if not entry:
        raise ValueError(f"Unknown voice: {voice_id}")
    onnx = cfg = None
    for name in entry.get("files", {}):
        if name.endswith(".onnx"):
            onnx = name
        elif name.endswith(".onnx.json"):
            cfg = name
    if not onnx or not cfg:
        raise ValueError(f"Voice {voice_id} is missing model files in the index.")
    return onnx, cfg


def ensure_voice(
    voice_id: str,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> tuple[Path, Path]:
    """
    Returns (model_path, config_path) for a voice, making it available first:
    already-cached -> bundled-in-installer -> downloaded once and cached.
    Raises RuntimeError with a user-readable message if it can't be obtained.
    """
    if voice_id not in load_voice_index():
        raise ValueError(f"Unknown voice: {voice_id}")

    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    model_path = VOICES_DIR / f"{voice_id}.onnx"
    config_path = VOICES_DIR / f"{voice_id}.onnx.json"

    if model_path.exists() and config_path.exists():
        return model_path, config_path

    # Seed from voices bundled into the installer, if present.
    bundled = _bundled_dir()
    if bundled and bundled.exists():
        b_model = bundled / f"{voice_id}.onnx"
        b_cfg = bundled / f"{voice_id}.onnx.json"
        if b_model.exists() and b_cfg.exists():
            shutil.copy2(b_model, model_path)
            shutil.copy2(b_cfg, config_path)
            logger.info(f"Seeded bundled voice {voice_id}")
            return model_path, config_path

    # Otherwise fetch once and cache.
    import requests

    onnx_rel, cfg_rel = _relative_paths(voice_id)
    if progress_callback:
        progress_callback(f"Downloading voice {voice_id} (one-time)…", 5)

    try:
        for rel, dest in ((cfg_rel, config_path), (onnx_rel, model_path)):
            tmp = dest.with_suffix(dest.suffix + ".part")
            with requests.get(VOICE_REPO_BASE + rel, stream=True, timeout=300) as r:
                r.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        if chunk:
                            f.write(chunk)
            os.replace(tmp, dest)
    except Exception as e:
        for p in (model_path, config_path):
            for cand in (p, p.with_suffix(p.suffix + ".part")):
                try:
                    if cand.exists():
                        cand.unlink()
                except OSError:
                    pass
        raise RuntimeError(
            f"Could not download voice '{voice_id}'. "
            f"Check your internet connection and try again. ({e})"
        )

    return model_path, config_path


_voice_cache: Dict[str, Any] = {}


def _load_voice(voice_id: str, progress_callback=None):
    """Loads and caches a PiperVoice. Cached so repeated jobs don't reload."""
    if voice_id in _voice_cache:
        return _voice_cache[voice_id]

    model_path, config_path = ensure_voice(voice_id, progress_callback)

    from piper import PiperVoice

    if progress_callback:
        progress_callback("Loading voice model…", 15)
    voice = PiperVoice.load(str(model_path), str(config_path))
    _voice_cache[voice_id] = voice
    return voice


def synthesize_to_file(
    text: str,
    voice_id: str,
    output_path: str,
    speed: float = 1.0,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Dict[str, Any]:
    """
    Synthesizes `text` with `voice_id` to a WAV at `output_path`.

    speed is a natural multiplier (1.0 = normal, 2.0 = twice as fast). Piper
    expresses this as length_scale, which is inverted, so it's converted here
    rather than leaking the engine's convention into the API/UI.

    Returns metadata: duration_seconds, sample_rate, char_count, file_size.
    """
    clean = (text or "").strip()
    if not clean:
        raise ValueError("Text is empty.")

    voice = _load_voice(voice_id, progress_callback)

    safe_speed = max(0.5, min(float(speed or 1.0), 2.0))

    from piper import SynthesisConfig

    syn_config = SynthesisConfig(length_scale=1.0 / safe_speed)

    if progress_callback:
        progress_callback("Generating speech…", 40)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with wave.open(output_path, "wb") as wav_file:
        voice.synthesize_wav(clean, wav_file, syn_config=syn_config)

    with wave.open(output_path, "rb") as wav_file:
        frames = wav_file.getnframes()
        rate = wav_file.getframerate() or 1
        duration = frames / float(rate)

    if progress_callback:
        progress_callback("Complete", 100)

    return {
        "duration_seconds": round(duration, 3),
        "sample_rate": rate,
        "char_count": len(clean),
        "file_size_bytes": os.path.getsize(output_path),
        "voice_id": voice_id,
        "speed": safe_speed,
    }
