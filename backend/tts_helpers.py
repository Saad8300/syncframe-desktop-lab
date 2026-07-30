"""
tts_helpers.py
Text-to-speech engines for SyncFrame Studio.

Two engines share one interface:
  • "piper" (Local)  — offline CPU ONNX inference. Nothing leaves the machine.
  • "edge"  (Cloud)  — Microsoft Edge speech service. Sends the TEXT over the
                        network; requires an internet connection.

Voice models and outputs live under get_data_dir() — a writable per-user
location, NEVER a path relative to __file__, which would fail in a packaged
install under Program Files (see runtime_paths.get_data_dir).
"""

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
import wave
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from runtime_paths import get_data_dir

logger = logging.getLogger(__name__)

VOICE_REPO_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/"

# Where downloaded/seeded Piper voice models are cached at runtime (writable).
VOICES_DIR = get_data_dir() / "models" / "piper"

ENGINE_PIPER = "piper"
ENGINE_EDGE = "edge"

SUPPORTED_FORMATS = ("wav", "mp3")


# ---------------------------------------------------------------------------
# Bundled-resource paths
# ---------------------------------------------------------------------------

def _bundled_dir() -> Optional[Path]:
    """Voice models shipped inside the installer, if any."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "piper_voices"
    return Path(__file__).resolve().parent / "piper_voices"


def _index_path() -> Path:
    """The Piper voice catalog index, bundled as a PyInstaller data file."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "piper_voices_index.json"
    return Path(__file__).resolve().parent / "piper_voices_index.json"


# ---------------------------------------------------------------------------
# Voice catalogs
# ---------------------------------------------------------------------------

_index_cache: Optional[Dict[str, Any]] = None


def load_voice_index() -> Dict[str, Any]:
    """Full Piper voice catalog, keyed by voice id (e.g. 'en_US-amy-medium')."""
    global _index_cache
    if _index_cache is None:
        with open(_index_path(), "r", encoding="utf-8") as f:
            _index_cache = json.load(f)
    return _index_cache


def _piper_voices() -> List[Dict[str, Any]]:
    """
    Local Piper voices, normalized to the shared voice shape.

    Piper publishes NO gender metadata — not in voices.json and not in any of
    the 142 MODEL_CARDs — so gender is reported as "Unspecified" rather than
    guessed from the speaker name (names like 'mls', 'rdh', 'nst' are not
    attributable). The UI treats Unspecified as matching any gender filter so
    local voices don't silently vanish when a user filters by gender.
    """
    out: List[Dict[str, Any]] = []
    for key, v in load_voice_index().items():
        lang = v.get("language", {})
        onnx_bytes = sum(
            f.get("size_bytes", 0)
            for name, f in v.get("files", {}).items()
            if name.endswith(".onnx")
        )
        out.append({
            "id": key,
            "engine": ENGINE_PIPER,
            "engine_label": "Local",
            "name": v.get("name", key),
            "gender": "Unspecified",
            "language_code": lang.get("code", ""),
            "language": lang.get("name_english", ""),
            "language_native": lang.get("name_native", ""),
            "country": lang.get("country_english", ""),
            "quality": v.get("quality", ""),
            "num_speakers": v.get("num_speakers", 1),
            "size_bytes": onnx_bytes,
            "downloaded": (VOICES_DIR / f"{key}.onnx").exists(),
            "requires_internet": False,
        })
    return out


_edge_cache: Optional[List[Dict[str, Any]]] = None

# Minimal ISO-639-1 -> English name map for edge-tts locales, so Cloud voices
# group under the same language headings as Piper voices in the picker.
_LANG_NAMES = {
    "af": "Afrikaans", "am": "Amharic", "ar": "Arabic", "az": "Azerbaijani",
    "bg": "Bulgarian", "bn": "Bengali", "bs": "Bosnian", "ca": "Catalan",
    "cs": "Czech", "cy": "Welsh", "da": "Danish", "de": "German",
    "el": "Greek", "en": "English", "es": "Spanish", "et": "Estonian",
    "eu": "Basque", "fa": "Farsi", "fi": "Finnish", "fil": "Filipino",
    "fr": "French", "ga": "Irish", "gl": "Galician", "gu": "Gujarati",
    "he": "Hebrew", "hi": "Hindi", "hr": "Croatian", "hu": "Hungarian",
    "hy": "Armenian", "id": "Indonesian", "is": "Icelandic", "it": "Italian",
    "iu": "Inuktitut", "ja": "Japanese", "jv": "Javanese", "ka": "Georgian",
    "kk": "Kazakh", "km": "Khmer", "kn": "Kannada", "ko": "Korean",
    "lo": "Lao", "lt": "Lithuanian", "lv": "Latvian", "mk": "Macedonian",
    "ml": "Malayalam", "mn": "Mongolian", "mr": "Marathi", "ms": "Malay",
    "mt": "Maltese", "my": "Burmese", "nb": "Norwegian", "ne": "Nepali",
    "nl": "Dutch", "pl": "Polish", "ps": "Pashto", "pt": "Portuguese",
    "ro": "Romanian", "ru": "Russian", "si": "Sinhala", "sk": "Slovak",
    "sl": "Slovenian", "so": "Somali", "sq": "Albanian", "sr": "Serbian",
    "su": "Sundanese", "sv": "Swedish", "sw": "Swahili", "ta": "Tamil",
    "te": "Telugu", "th": "Thai", "tr": "Turkish", "uk": "Ukrainian",
    "ur": "Urdu", "uz": "Uzbek", "vi": "Vietnamese", "zh": "Chinese",
    "zu": "Zulu",
}


def _edge_voices(force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Cloud (edge-tts) voices, fetched live and cached in-process.

    Returns [] rather than raising if the network is unavailable, so the tool
    still works with Local voices when offline. Callers surface that as an
    informational note, not an error.
    """
    global _edge_cache
    if _edge_cache is not None and not force_refresh:
        return _edge_cache

    try:
        import edge_tts
        raw = edge_tts.VoicesManager  # noqa: F841 - presence check
        import asyncio

        async def _fetch():
            return await edge_tts.list_voices()

        voices = asyncio.run(_fetch())
    except Exception as e:
        logger.warning(f"Could not fetch Cloud (edge-tts) voice list: {e}")
        return []

    out: List[Dict[str, Any]] = []
    for v in voices:
        locale = v.get("Locale", "")
        base = locale.split("-")[0] if locale else ""
        region = locale.split("-")[1] if "-" in locale else ""
        # "Microsoft Adri Online (Natural) - Afrikaans (South Africa)" -> "Adri"
        short = v.get("ShortName", "")
        name = short.split("-")[-1].replace("Neural", "") if short else v.get("Name", "")
        out.append({
            "id": short,
            "engine": ENGINE_EDGE,
            "engine_label": "Cloud",
            "name": name or short,
            "gender": v.get("Gender") or "Unspecified",
            "language_code": locale,
            "language": _LANG_NAMES.get(base, base or "Other"),
            "language_native": "",
            "country": region,
            "quality": "neural",
            "num_speakers": 1,
            "size_bytes": 0,
            "downloaded": True,   # nothing to download; streamed on demand
            "requires_internet": True,
        })
    _edge_cache = out
    return out


def list_voices() -> List[Dict[str, Any]]:
    """Merged catalog of Local + Cloud voices, sorted for the picker."""
    voices = _piper_voices() + _edge_voices()
    voices.sort(key=lambda r: (r["language"], r["engine_label"], r["name"], r["quality"]))
    return voices


def get_voice(voice_id: str) -> Optional[Dict[str, Any]]:
    """Look up a single voice across both catalogs."""
    for v in list_voices():
        if v["id"] == voice_id:
            return v
    return None


def voice_language_code(voice_id: str) -> str:
    """Base language code ('en', 'ur') for a voice id, or '' if unknown."""
    v = get_voice(voice_id)
    if not v:
        return ""
    code = v.get("language_code") or ""
    return code.replace("_", "-").split("-")[0].lower()


# ---------------------------------------------------------------------------
# Piper model acquisition
# ---------------------------------------------------------------------------

def _relative_paths(voice_id: str) -> Tuple[str, str]:
    """Repo-relative paths of a Piper voice's .onnx and .onnx.json."""
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
) -> Tuple[Path, Path]:
    """
    Returns (model_path, config_path) for a Piper voice, making it available:
    already-cached -> bundled-in-installer -> downloaded once and cached.
    """
    if voice_id not in load_voice_index():
        raise ValueError(f"Unknown voice: {voice_id}")

    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    model_path = VOICES_DIR / f"{voice_id}.onnx"
    config_path = VOICES_DIR / f"{voice_id}.onnx.json"

    if model_path.exists() and config_path.exists():
        return model_path, config_path

    bundled = _bundled_dir()
    if bundled and bundled.exists():
        b_model = bundled / f"{voice_id}.onnx"
        b_cfg = bundled / f"{voice_id}.onnx.json"
        if b_model.exists() and b_cfg.exists():
            shutil.copy2(b_model, model_path)
            shutil.copy2(b_cfg, config_path)
            logger.info(f"Seeded bundled voice {voice_id}")
            return model_path, config_path

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


def _load_piper_voice(voice_id: str, progress_callback=None):
    """Loads and caches a PiperVoice so repeated jobs don't reload the model."""
    if voice_id in _voice_cache:
        return _voice_cache[voice_id]
    model_path, config_path = ensure_voice(voice_id, progress_callback)
    from piper import PiperVoice
    if progress_callback:
        progress_callback("Loading voice model…", 15)
    voice = PiperVoice.load(str(model_path), str(config_path))
    _voice_cache[voice_id] = voice
    return voice


# ---------------------------------------------------------------------------
# Audio format conversion (reuses the ffmpeg already bundled for video)
# ---------------------------------------------------------------------------

def _ffmpeg() -> str:
    from caption_engine import get_ffmpeg_cmd
    return get_ffmpeg_cmd()


def convert_audio(src_path: str, dest_path: str) -> None:
    """Transcode audio via the bundled ffmpeg (libmp3lame is available)."""
    cmd = [_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error", "-i", src_path]
    if dest_path.lower().endswith(".mp3"):
        cmd += ["-codec:a", "libmp3lame", "-q:a", "2"]
    cmd.append(dest_path)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 or not os.path.exists(dest_path):
        raise RuntimeError(f"Audio conversion failed: {res.stderr[:400]}")


def concat_audio(parts: List[str], dest_path: str) -> None:
    """
    Losslessly concatenate same-codec audio parts with ffmpeg's concat demuxer.
    Used to stitch Long Form chunks into one file.
    """
    if not parts:
        raise ValueError("No audio parts to concatenate.")
    list_path = Path(dest_path).with_suffix(".concat.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for p in parts:
            escaped = str(p).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")
    try:
        cmd = [_ffmpeg(), "-y", "-hide_banner", "-loglevel", "error",
               "-f", "concat", "-safe", "0", "-i", str(list_path)]
        if dest_path.lower().endswith(".mp3"):
            cmd += ["-codec:a", "libmp3lame", "-q:a", "2"]
        else:
            cmd += ["-c", "copy"]
        cmd.append(dest_path)
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0 or not os.path.exists(dest_path):
            raise RuntimeError(f"Audio concatenation failed: {res.stderr[:400]}")
    finally:
        try:
            os.remove(list_path)
        except OSError:
            pass


def _audio_duration(path: str) -> float:
    """Duration in seconds; uses the wave module for WAV, ffmpeg otherwise."""
    if path.lower().endswith(".wav"):
        try:
            with wave.open(path, "rb") as w:
                return w.getnframes() / float(w.getframerate() or 1)
        except Exception:
            pass
    try:
        res = subprocess.run(
            [_ffmpeg(), "-hide_banner", "-i", path],
            capture_output=True, text=True,
        )
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", res.stderr)
        if m:
            h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
            return h * 3600 + mi * 60 + s
    except Exception:
        pass
    return 0.0


# ---------------------------------------------------------------------------
# Text chunking for Long Form
# ---------------------------------------------------------------------------

def chunk_text(text: str, max_size: int, measure=len) -> List[str]:
    """
    Split long text into chunks under max_size, preferring natural boundaries
    in descending order: paragraph -> sentence -> clause -> word.
    Sentence/clause patterns include CJK and Arabic punctuation so non-Latin
    scripts don't fall through to word-level splitting.

    `measure` decides what max_size counts. It defaults to len() (characters),
    which is what TTS synthesis wants since chunk length maps to audio length.
    Translation passes a byte-measuring function instead: the endpoint's real
    limit is on encoded payload size, and a character budget silently doubles
    the payload for two-byte scripts like Arabic.
    """
    text = (text or "").replace("\r\n", "\n").strip()
    if not text:
        return []
    if measure(text) <= max_size:
        return [text]

    def split_keep(units: List[str]) -> List[str]:
        """Greedily pack units into chunks without exceeding max_size."""
        out: List[str] = []
        cur = ""
        for u in units:
            candidate = (cur + " " + u).strip() if cur else u
            if measure(candidate) <= max_size:
                cur = candidate
            else:
                if cur:
                    out.append(cur)
                cur = u
        if cur:
            out.append(cur)
        return out

    def refine(segment: str, level: int) -> List[str]:
        if measure(segment) <= max_size:
            return [segment]
        if level == 0:
            units = [p for p in re.split(r"\n{2,}", segment) if p.strip()]
        elif level == 1:
            units = [p for p in re.split(r"\n+", segment) if p.strip()]
        elif level == 2:
            units = [p for p in re.split(r"(?<=[.!?。！？؟])\s+", segment) if p.strip()]
        elif level == 3:
            units = [p for p in re.split(r"(?<=[,;:—、，；：،؛])\s+", segment) if p.strip()]
        elif level == 4:
            units = segment.split(" ")
        else:
            # Hard cut — a single "word" over budget (e.g. a URL). Step by
            # characters but re-check with `measure`, so a multi-byte script
            # still lands under a byte budget.
            out: List[str] = []
            cur = ""
            for ch in segment:
                if cur and measure(cur + ch) > max_size:
                    out.append(cur)
                    cur = ch
                else:
                    cur += ch
            if cur:
                out.append(cur)
            return out

        if len(units) <= 1:
            return refine(segment, level + 1)

        result: List[str] = []
        for packed in split_keep(units):
            if measure(packed) > max_size:
                result.extend(refine(packed, level + 1))
            else:
                result.append(packed)
        return result

    return [c for c in refine(text, 0) if c.strip()]


# ---------------------------------------------------------------------------
# Translation (deep-translator -> Google's free endpoint)
# ---------------------------------------------------------------------------

# Budgeting translation chunks by CHARACTER count was the cause of a hard
# failure on Arabic: the endpoint's real limit is on encoded payload size, and
# Arabic is two UTF-8 bytes per character, so a 4,500-character chunk was
# ~8,200 bytes and rejected every time. Measured working ceilings were ~3,100
# characters for Arabic vs ~4,980 for English — the same byte range. Budgeting
# by bytes makes the limit script-independent.
TRANSLATE_MAX_CHUNK_BYTES = 3000
TRANSLATE_MAX_RETRIES = 3
TRANSLATE_BACKOFF_BASE = 0.6      # seconds; doubles each retry
TRANSLATE_MAX_SPLIT_DEPTH = 4     # adaptive halving before giving up


def _byte_len(s: str) -> int:
    return len(s.encode("utf-8"))

def detect_language(text: str) -> str:
    """
    Detect the text's language as an ISO-639-1 code, or "" if undetermined.

    Uses py3langid: fully offline, BSD-licensed, and needs only numpy (already
    a dependency). Chosen over a script-range heuristic because script alone
    cannot separate Urdu from Arabic (both Arabic script) or English from
    Spanish/French (all Latin) — exactly the cases this feature must catch to
    decide whether to offer Auto-Translate.

    Never raises: detection only decides whether to OFFER translation.
    """
    sample = (text or "").strip()[:1000]
    if len(sample) < 8:
        # Too short to classify reliably; don't guess.
        return ""
    try:
        import py3langid as langid
        code, _confidence = langid.classify(sample)
        return (code or "").lower()
    except Exception as e:
        logger.info(f"Language detection unavailable: {e}")
        return ""


def translate_text(text: str, target_lang: str) -> str:
    """
    Translate text into target_lang (ISO-639-1) using deep-translator.

    Uses Google's free public endpoint — no API key, no per-call cost — which
    means it can rate-limit or change without notice. Raises RuntimeError with
    a user-readable message on failure so callers can surface it instead of
    silently voicing untranslated text.
    """
    clean = (text or "").strip()
    if not clean:
        return clean
    if not target_lang:
        raise RuntimeError("No target language for translation.")

    try:
        from deep_translator import GoogleTranslator
    except Exception as e:
        raise RuntimeError(f"Translation library unavailable: {e}")

    translator = GoogleTranslator(source="auto", target=target_lang)

    def _translate_once(piece: str) -> str:
        """One call with retry-and-backoff for genuine transient failures."""
        last: Optional[Exception] = None
        for attempt in range(TRANSLATE_MAX_RETRIES):
            try:
                return translator.translate(piece) or ""
            except Exception as e:  # noqa: BLE001 - library raises bare types
                last = e
                if attempt < TRANSLATE_MAX_RETRIES - 1:
                    time.sleep(TRANSLATE_BACKOFF_BASE * (2 ** attempt))
        raise last if last else RuntimeError("Translation failed.")

    def _translate_adaptive(piece: str, depth: int = 0) -> str:
        """
        Translate one chunk, halving and retrying if it still fails.

        The byte budget below is deliberately conservative rather than tuned to
        the endpoint's exact (undocumented, unversioned) limit. If a chunk is
        still rejected — because the limit moved, or a script encodes even
        heavier than expected — splitting and retrying self-corrects without
        anyone having to guess a new magic number.
        """
        try:
            return _translate_once(piece)
        except Exception:
            if depth >= TRANSLATE_MAX_SPLIT_DEPTH or len(piece) < 40:
                raise
            halves = chunk_text(piece, max(1, _byte_len(piece) // 2), measure=_byte_len)
            if len(halves) < 2:
                raise
            return " ".join(_translate_adaptive(h, depth + 1) for h in halves if h.strip())

    pieces = chunk_text(clean, TRANSLATE_MAX_CHUNK_BYTES, measure=_byte_len) or [clean]
    out: List[str] = []
    try:
        for p in pieces:
            out.append(_translate_adaptive(p))
    except Exception as e:
        raise RuntimeError(
            "Translation failed. This uses a free public translation service "
            f"that may be temporarily unavailable or rate-limited. ({e})"
        )
    return "\n\n".join(x for x in out if x).strip()


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------

def _synthesize_piper(text: str, voice_id: str, wav_path: str, speed: float,
                      progress_callback=None) -> int:
    voice = _load_piper_voice(voice_id, progress_callback)
    from piper import SynthesisConfig
    # Piper expresses speed as length_scale, which is inverted.
    syn = SynthesisConfig(length_scale=1.0 / speed)
    with wave.open(wav_path, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, syn_config=syn)
    with wave.open(wav_path, "rb") as wav_file:
        return wav_file.getframerate() or 0


def _synthesize_edge(text: str, voice_id: str, mp3_path: str, speed: float) -> int:
    """
    Cloud synthesis. edge-tts returns MP3 and expresses speed as a percentage
    delta, so a natural multiplier is converted here.
    """
    try:
        import edge_tts
    except Exception as e:
        raise RuntimeError(f"Cloud voice engine unavailable: {e}")

    pct = int(round((speed - 1.0) * 100))
    rate = f"{pct:+d}%"
    try:
        communicate = edge_tts.Communicate(text, voice_id, rate=rate)
        communicate.save_sync(mp3_path)
    except Exception as e:
        raise RuntimeError(
            "Cloud voice generation failed. Cloud voices need an internet "
            f"connection — check your connection or pick a Local voice. ({e})"
        )
    if not os.path.exists(mp3_path) or os.path.getsize(mp3_path) == 0:
        raise RuntimeError(
            "Cloud voice returned no audio. Check your internet connection "
            "or pick a Local voice."
        )
    return 24000  # edge-tts default: audio-24khz-48kbitrate-mono-mp3


def synthesize_to_file(
    text: str,
    voice_id: str,
    output_path: str,
    speed: float = 1.0,
    engine: Optional[str] = None,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Dict[str, Any]:
    """
    Synthesize `text` with `voice_id` to `output_path`, whose extension
    (.wav/.mp3) determines the output format. Transcodes via ffmpeg when the
    engine's native format differs from the requested one.

    speed is a natural multiplier (1.0 = normal, 2.0 = twice as fast).
    """
    clean = (text or "").strip()
    if not clean:
        raise ValueError("Text is empty.")

    if engine is None:
        v = get_voice(voice_id)
        engine = (v or {}).get("engine") or ENGINE_PIPER

    fmt = "mp3" if output_path.lower().endswith(".mp3") else "wav"
    safe_speed = max(0.5, min(float(speed or 1.0), 2.0))

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if progress_callback:
        progress_callback("Generating speech…", 40)

    native_ext = "wav" if engine == ENGINE_PIPER else "mp3"
    if native_ext == fmt:
        native_path = str(out)
    else:
        native_path = str(out.with_suffix(f".native.{native_ext}"))

    try:
        if engine == ENGINE_PIPER:
            sample_rate = _synthesize_piper(clean, voice_id, native_path,
                                            safe_speed, progress_callback)
        elif engine == ENGINE_EDGE:
            sample_rate = _synthesize_edge(clean, voice_id, native_path, safe_speed)
        else:
            raise ValueError(f"Unknown engine: {engine}")

        if native_path != str(out):
            if progress_callback:
                progress_callback(f"Converting to {fmt.upper()}…", 85)
            convert_audio(native_path, str(out))
    finally:
        if native_path != str(out) and os.path.exists(native_path):
            try:
                os.remove(native_path)
            except OSError:
                pass

    duration = _audio_duration(str(out))
    if progress_callback:
        progress_callback("Complete", 100)

    return {
        "duration_seconds": round(duration, 3),
        "sample_rate": sample_rate,
        "char_count": len(clean),
        "file_size_bytes": os.path.getsize(str(out)),
        "voice_id": voice_id,
        "engine": engine,
        "speed": safe_speed,
        "output_format": fmt,
    }


def synthesize_long_form(
    text: str,
    voice_id: str,
    output_path: str,
    speed: float = 1.0,
    engine: Optional[str] = None,
    chunk_size: int = 1500,
    progress_callback: Optional[Callable[[str, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Dict[str, Any]:
    """
    Long Form: split text into chunks, synthesize each, then concatenate into
    one file. Progress is reported per chunk (5-90%), matching the async-job
    polling pattern used by the other tools.
    """
    clean = (text or "").strip()
    if not clean:
        raise ValueError("Text is empty.")

    if engine is None:
        v = get_voice(voice_id)
        engine = (v or {}).get("engine") or ENGINE_PIPER

    chunks = chunk_text(clean, chunk_size)
    if not chunks:
        raise ValueError("Could not split the text into chunks.")

    fmt = "mp3" if output_path.lower().endswith(".mp3") else "wav"
    native_ext = "wav" if engine == ENGINE_PIPER else "mp3"
    safe_speed = max(0.5, min(float(speed or 1.0), 2.0))

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    work_dir = out.parent / f".{out.stem}_chunks"
    work_dir.mkdir(parents=True, exist_ok=True)

    part_paths: List[str] = []
    try:
        for i, chunk in enumerate(chunks):
            if cancel_check and cancel_check():
                raise RuntimeError("Cancelled by user.")
            part = str(work_dir / f"part_{i:04d}.{native_ext}")
            if progress_callback:
                pct = 5 + int((i / len(chunks)) * 85)
                progress_callback(f"Generating chunk {i + 1} of {len(chunks)}…", pct)
            try:
                if engine == ENGINE_PIPER:
                    sample_rate = _synthesize_piper(chunk, voice_id, part,
                                                    safe_speed, None)
                else:
                    sample_rate = _synthesize_edge(chunk, voice_id, part, safe_speed)
            except Exception as e:
                # Report which chunk failed — a 30,000-char script is hard to
                # debug from a generic error.
                preview = chunk[:120] + ("…" if len(chunk) > 120 else "")
                raise RuntimeError(
                    f"Chunk {i + 1} of {len(chunks)} failed: {e}\nText was: {preview}"
                )
            part_paths.append(part)

        if progress_callback:
            progress_callback("Joining audio…", 92)

        if len(part_paths) == 1 and native_ext == fmt:
            shutil.move(part_paths[0], str(out))
        elif native_ext == fmt:
            concat_audio(part_paths, str(out))
        else:
            joined = str(work_dir / f"joined.{native_ext}")
            concat_audio(part_paths, joined)
            if progress_callback:
                progress_callback(f"Converting to {fmt.upper()}…", 96)
            convert_audio(joined, str(out))
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)

    duration = _audio_duration(str(out))
    if progress_callback:
        progress_callback("Complete", 100)

    return {
        "duration_seconds": round(duration, 3),
        "sample_rate": sample_rate,
        "char_count": len(clean),
        "file_size_bytes": os.path.getsize(str(out)),
        "voice_id": voice_id,
        "engine": engine,
        "speed": safe_speed,
        "output_format": fmt,
        "total_chunks": len(chunks),
        "mode": "long_form",
    }
