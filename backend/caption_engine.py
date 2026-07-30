import os
import sys
import uuid
import tempfile
import logging
import subprocess
import re
from pathlib import Path
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)


# ─── Preset definitions ───────────────────────────────────────────────────────
# Generated from shared/caption_presets.json by
# scripts/generate_caption_presets.py, which emits this table and the matching
# TypeScript one used by the Studio preview. Previously these were two
# hand-maintained literals that had to be kept identical by hand; any drift
# meant the preview disagreed with the actual render.
from caption_presets_generated import (  # noqa: E402
    BUILT_IN_DEFINITIONS,
    FALLBACK_DEFAULTS,
    PRESET_META,
    KARAOKE_PRESET_IDS,
)

def resolve_caption_style(preset_id: str, overrides: Dict[str, Any]) -> Dict[str, Any]:
    custom_preset = overrides.get("snapshot_full_overrides")
    
    if custom_preset:
        base_preset_id = custom_preset.get("basePreset", "viral_bold")
        base_def = BUILT_IN_DEFINITIONS.get(base_preset_id, FALLBACK_DEFAULTS)
    else:
        base_def = BUILT_IN_DEFINITIONS.get(preset_id, FALLBACK_DEFAULTS)
        
    result = {**FALLBACK_DEFAULTS, **base_def}
    
    # Apply custom preset nested overrides if present
    if custom_preset and "overrides" in custom_preset:
        c_o = custom_preset["overrides"]
        for section in ["text", "layout", "appearance", "effects", "timing"]:
            if section in c_o:
                for k, v in c_o[section].items():
                    if v is not None:
                        result[k] = v

    # Apply job-specific nested overrides if present
    for section in ["text", "layout", "appearance", "effects", "timing"]:
        o_section = overrides.get(section, {})
        for k, v in o_section.items():
            if v is not None:
                result[k] = v

    # --- Normalize types to prevent rendering crashes ---
    
    # 1. Font Weight
    fw = str(result.get("fontWeight", "700")).lower().strip()
    if fw in ["bold", "bolder"]:
        result["fontWeight"] = 700
    elif fw in ["semibold"]:
        result["fontWeight"] = 600
    elif fw in ["normal", "regular", "medium", "thin", "light"]:
        result["fontWeight"] = 400
    else:
        try:
            result["fontWeight"] = int(fw)
        except ValueError:
            result["fontWeight"] = 700
            
    # 2. Numeric Properties
    def _safe_float(k: str, default: float):
        try:
            result[k] = float(result.get(k, default))
        except (ValueError, TypeError):
            result[k] = default

    def _safe_int(k: str, default: int):
        try:
            result[k] = int(float(result.get(k, default)))
        except (ValueError, TypeError):
            result[k] = default

    _safe_float("fontScale", 1.0)
    _safe_int("maxWords", 5)
    _safe_int("maxLines", 2)
    _safe_int("maxWidth", 80)
    _safe_int("verticalOffset", 0)

    return result

def _escape_ass_text(text: str) -> str:
    """
    Neutralise characters that libass would read as markup. A literal '{' in a
    caption would otherwise open an override block and swallow the rest of the
    line, and a raw backslash can form an unintended tag.
    """
    return (
        str(text)
        .replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
    )


def _hex_to_ass_color(hex_color: str, alpha: int = 0) -> str:
    h = hex_color.lstrip('#')
    if len(h) == 3:
        h = ''.join(c*2 for c in h)
    if len(h) != 6:
        h = 'FFFFFF'
    r = int(h[0:2], 16)
    g = int(h[2:4], 16)
    b = int(h[4:6], 16)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"

# Fallback if imageio_ffmpeg is not available
def get_ffmpeg_cmd():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        logger.warning(f"Could not get imageio_ffmpeg path: {e}")
        return "ffmpeg"

def parse_srt(srt_path: str) -> List[Dict[str, Any]]:
    segments = []
    if not os.path.exists(srt_path):
        return segments
    content = ""
    for enc in ['utf-8-sig', 'utf-8', 'latin-1']:
        try:
            with open(srt_path, 'r', encoding=enc) as f:
                content = f.read()
            break
        except UnicodeDecodeError:
            pass
    if not content: return segments
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    blocks = re.split(r'\n\s*\n', content.strip())
    for block in blocks:
        lines = [line.strip() for line in block.split('\n') if line.strip()]
        if len(lines) >= 3:
            time_line = lines[1]
            text = " ".join(lines[2:])
            m = re.match(r'(\d+:\d+:\d+,\d+)\s*-->\s*(\d+:\d+:\d+,\d+)', time_line)
            if m:
                start_str, end_str = m.groups()
                start_s = _srt_time_to_seconds(start_str)
                end_s = _srt_time_to_seconds(end_str)
                if end_s > start_s and text:
                    segments.append({"start": start_s, "end": end_s, "text": text})
    return segments

def _srt_time_to_seconds(t_str: str) -> float:
    parts = t_str.replace('.', ',').split(',')
    sec_part = parts[0]
    ms = float(parts[1]) if len(parts) > 1 else 0.0
    h, m, s = sec_part.split(':')
    return int(h) * 3600 + int(m) * 60 + int(s) + ms / 1000.0

def validate_srt(srt_path: str) -> str:
    if not os.path.exists(srt_path): return "SRT file does not exist."
    segments = parse_srt(srt_path)
    if not segments: return "SRT file is empty or contains no valid subtitle blocks."
    return ""

def _seconds_to_ass_time(s: float) -> str:
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int(round((s % 1) * 100))
    if cs >= 100:
        sec += 1
        cs -= 100
        if sec >= 60:
            m += 1
            sec -= 60
            if m >= 60:
                h += 1
                m -= 60
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

def _transform_text(text: str, transform: str) -> str:
    if transform == "uppercase":
        return text.upper()
    if transform == "lowercase":
        return text.lower()
    if transform == "title_case":
        return text.title()
    return text


def _layout_lines(words: List[Dict[str, Any]], max_lines: int) -> List[List[int]]:
    """Distribute word indices across at most max_lines balanced lines."""
    n = len(words)
    if n == 0:
        return []
    num_lines = max(1, min(max_lines, n))
    per_line = (n + num_lines - 1) // num_lines
    return [list(range(i, min(i + per_line, n))) for i in range(0, n, per_line)]


def chunk_words(words: List[Dict[str, Any]], style: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Group real word-timed tokens into caption chunks, preserving each word's
    own start/end. This is what makes karaoke possible: unlike the old
    character-ratio interpolation, every word here carries measured timing
    straight from Whisper.

    Returns chunks of {start, end, lines: [[word, ...]], words: [word, ...]}
    where each word is {text, start, end}.
    """
    max_words = int(style.get("maxWords", 5)) or 999
    if max_words <= 0:
        max_words = 999
    max_lines = max(1, int(style.get("maxLines", 2)))
    transform = style.get("textTransform", "original")

    chunks: List[Dict[str, Any]] = []
    current: List[Dict[str, Any]] = []

    def flush():
        if not current:
            return
        line_idx = _layout_lines(current, max_lines)
        chunks.append({
            "start": current[0]["start"],
            "end": current[-1]["end"],
            "words": list(current),
            "lines": [[current[i] for i in idxs] for idxs in line_idx],
        })
        current.clear()

    for w in words:
        text = _transform_text(str(w.get("word", "")).strip(), transform)
        if not text:
            continue
        current.append({"text": text, "start": float(w["start"]), "end": float(w["end"])})
        # Break on a hard sentence boundary early, or once the chunk is full.
        ends_sentence = text.endswith(('.', '!', '?', '۔', '।'))
        if len(current) >= max_words or (ends_sentence and len(current) >= max(1, max_words // 2)):
            flush()
    flush()

    # Close sub-frame gaps so a chunk stays on screen until the next begins,
    # which avoids a visible flicker between consecutive captions.
    for i in range(len(chunks) - 1):
        gap = chunks[i + 1]["start"] - chunks[i]["end"]
        if 0 < gap <= 0.35:
            chunks[i]["end"] = chunks[i + 1]["start"]
    return chunks


def synthesize_words_from_segments(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Build approximate word timings for sources that have none (SRT uploads and
    manual entry). Distributes each cue's duration across its words weighted by
    length. Karaoke driven by these is visibly approximate — real word timing
    only comes from the Whisper path — but it keeps every preset usable with
    every caption source instead of silently degrading to no highlighting.
    """
    out: List[Dict[str, Any]] = []
    for seg in segments:
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        tokens = text.split()
        if not tokens:
            continue
        start = float(seg["start"])
        end = float(seg["end"])
        span = max(0.001, end - start)
        weights = [max(1, len(t)) for t in tokens]
        total = sum(weights)
        cursor = start
        for tok, wgt in zip(tokens, weights):
            dur = span * (wgt / total)
            w_end = min(end, cursor + dur)
            if w_end <= cursor:
                w_end = min(end, cursor + 0.001)
            out.append({"word": tok, "start": cursor, "end": w_end})
            cursor = w_end
    return out


def chunk_caption_segments(segments: List[Dict[str, Any]], style: Dict[str, Any]) -> List[Dict[str, Any]]:
    max_words = style.get("maxWords", 5)
    max_lines = style.get("maxLines", 2)
    if max_words <= 0: max_words = 999
    
    chunked = []
    for seg in segments:
        text = str(seg.get("text", "")).strip()
        if not text: continue
        
        # apply uppercase etc if needed? actually ASS formatting {\T} could do it, but we can do it here
        transform = style.get("textTransform", "original")
        if transform == "uppercase": text = text.upper()
        elif transform == "lowercase": text = text.lower()
        elif transform == "title_case": text = text.title()

        words = text.split()
        duration = seg["end"] - seg["start"]
        total_chars = sum(len(w) for w in words)
        if total_chars == 0: continue
            
        current_words = []
        current_chars = 0
        current_start = seg["start"]
        
        for idx, w in enumerate(words):
            current_words.append(w)
            current_chars += len(w)
            
            has_punct = w.endswith(('.', '!', '?', ','))
            is_last = idx == len(words) - 1
            
            if len(current_words) >= max_words or (has_punct and len(current_words) >= max_words // 2) or is_last:
                ratio = current_chars / max(1, total_chars)
                chunk_duration = duration * ratio
                current_end = current_start + chunk_duration if not is_last else seg["end"]
                
                # Split current_words into lines
                lines = []
                num_lines = min(max_lines, len(current_words))
                if num_lines < 1: num_lines = 1
                words_per_line = (len(current_words) + num_lines - 1) // num_lines
                for i in range(0, len(current_words), words_per_line):
                    lines.append(" ".join(current_words[i:i+words_per_line]))
                
                final_text = "\\N".join(lines)
                
                chunked.append({
                    "start": current_start,
                    "end": current_end,
                    "text": final_text
                })
                
                current_start = current_end
                total_chars -= current_chars
                duration -= chunk_duration
                current_words = []
                current_chars = 0
    return chunked

def build_styled_ass(segments: List[Dict[str, Any]], config: Dict[str, Any], width: int, height: int) -> str:
    # 1. Resolve style
    preset_id = config.get("presetId", "viral_bold")
    # Legacy migration: if it's the old flat config it will just have preset
    if "presetId" not in config and "caption_preset" in config:
        preset_id = config["caption_preset"]
    overrides = config.get("overrides", {})
    
    style = resolve_caption_style(preset_id, overrides)

    # 2. Extract basic params
    ref_dim = min(width, height)
    font_size = int(ref_dim * 0.09 * style["fontScale"])
    font_size = max(18, font_size)

    spacing_map = {"tight": -int(font_size * 0.15), "normal": 0, "relaxed": int(font_size * 0.2)}
    spacing = spacing_map.get(style["lineHeight"], 0)

    bold = -1 if int(style["fontWeight"]) >= 600 else 0

    border_style = 1
    outline = 0
    shadow = 0
    back_alpha = 0x80

    o_style = style["outlineStyle"]
    if o_style == "thin": outline = max(1, int(font_size * 0.02))
    elif o_style == "medium": outline = max(2, int(font_size * 0.05))
    elif o_style == "thick": outline = max(4, int(font_size * 0.10))

    s_style = style["shadowStyle"]
    if s_style == "soft": shadow = max(1, int(font_size * 0.03))
    elif s_style == "medium": shadow = max(3, int(font_size * 0.05))
    elif s_style == "strong": shadow = max(6, int(font_size * 0.12))

    b_style = style["boxStyle"]
    if b_style != "none":
        border_style = 3
        outline = max(2, int(font_size * 0.05))
        if b_style == "subtle": back_alpha = 0x80
        elif b_style == "strong": back_alpha = 0x00
        elif b_style == "medium": back_alpha = 0x40
    else:
        back_alpha = 0x00

    align = style.get("textAlign", "center")
    
    # 1=BL, 2=BC, 3=BR, 4=ML, 5=MC, 6=MR, 7=TL, 8=TC, 9=TR
    alignment = 2
    margin_v = int(height * 0.07)
    pos = style["position"]

    if "top" in pos:
        if align == "left": alignment = 7
        elif align == "right": alignment = 9
        else: alignment = 8
    elif "center" in pos and "lower" not in pos:
        if align == "left": alignment = 4
        elif align == "right": alignment = 6
        else: alignment = 5
        margin_v = 0
    else: # bottom or lower_center
        if align == "left": alignment = 1
        elif align == "right": alignment = 3
        else: alignment = 2
        if "lower" in pos:
            margin_v = int(height * 0.16)
        else:
            margin_v = int(height * 0.06)

    margin_v = margin_v - int(style["verticalOffset"])

    primary_ass   = _hex_to_ass_color(style["primaryColor"], 0)
    secondary_ass = _hex_to_ass_color(style["accentColor"], 0)
    outline_ass   = _hex_to_ass_color(style["outlineColor"], 0)
    back_ass      = _hex_to_ass_color(style["boxColor"] if b_style != "none" else style["shadowColor"], back_alpha)

    margin_lr = int((width * (100 - style["maxWidth"]) / 100) / 2)

    # 3. Build ASS
    font_name = style["fontFamily"].split(",")[0].strip("'\"")
    
    ass = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,{font_name},{font_size},{primary_ass},{secondary_ass},{outline_ass},{back_ass},"
        f"{bold},0,0,0,100,100,{spacing},0,{border_style},{outline},{shadow},{alignment},"
        f"{margin_lr},{margin_lr},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    # ── Karaoke path ─────────────────────────────────────────────────────────
    # Driven by real per-word timing. Two techniques, selectable per preset:
    #
    #   "fill"        native ASS \kf sweep. One event per chunk; libass wipes
    #                 SecondaryColour -> PrimaryColour across each word for its
    #                 own duration. Cheap and smooth, but colour-only.
    #
    #   "word_window" one event per word, each spanning that word's real
    #                 [start,end] and rendering the whole chunk with only the
    #                 active word overridden. This is what allows a scale pop,
    #                 a highlight pill, or dimming the inactive words — none of
    #                 which \k can express. Inactive words keep their metrics,
    #                 so the line never reflows between events.
    karaoke_mode = style.get("karaokeMode", "none")
    word_list = config.get("words") or []

    if karaoke_mode in ("fill", "word_window") and word_list:
        chunks = chunk_words(word_list, style)
        active_ass = _hex_to_ass_color(style.get("activeColor") or style["accentColor"], 0)
        inactive_alpha = int(style.get("inactiveAlpha", 0) or 0)
        inactive_alpha = max(0, min(255, inactive_alpha))
        active_scale = int(style.get("activeScale", 100) or 100)
        active_pop = int(style.get("activePop", 0) or 0)
        act_outline = style.get("activeOutlineColor") or ""
        act_box = style.get("activeBoxColor") or ""
        gradient = style.get("gradientCycle") or []

        for chunk in chunks:
            c_start = _seconds_to_ass_time(chunk["start"])
            c_end = _seconds_to_ass_time(chunk["end"])

            if karaoke_mode == "fill":
                # \kf durations are centiseconds and are consumed sequentially,
                # so each word's value is its own measured length.
                parts = []
                for li, line in enumerate(chunk["lines"]):
                    if li:
                        parts.append("\\N")
                    for w in line:
                        cs = max(1, int(round((w["end"] - w["start"]) * 100)))
                        parts.append(f"{{\\kf{cs}}}{_escape_ass_text(w['text'])} ")
                body = "".join(parts).rstrip()
                ass.append(f"Dialogue: 0,{c_start},{c_end},Default,,0,0,0,,{body}")
                continue

            # word_window
            for wi, active in enumerate(chunk["words"]):
                w_start = _seconds_to_ass_time(active["start"])
                w_end = _seconds_to_ass_time(active["end"])

                colour = active_ass
                if gradient:
                    colour = _hex_to_ass_color(gradient[wi % len(gradient)], 0)

                on = [f"\\1c{colour}"]
                if act_outline:
                    on.append(f"\\3c{_hex_to_ass_color(act_outline, 0)}")
                if act_box:
                    # Render the pill via a heavy border in the box colour.
                    on.append(f"\\3c{_hex_to_ass_color(act_box, 0)}")
                    on.append(f"\\bord{max(3, int(font_size * 0.10))}")
                if active_scale != 100:
                    on.append(f"\\fscx{active_scale}\\fscy{active_scale}")
                    if active_pop > 0:
                        on.append(f"\\t(0,{active_pop},\\fscx100\\fscy100)")
                active_tag = "{" + "".join(on) + "}"

                parts = []
                idx = 0
                for li, line in enumerate(chunk["lines"]):
                    if li:
                        parts.append("\\N")
                    for w in line:
                        txt = _escape_ass_text(w["text"])
                        if idx == wi:
                            parts.append(f"{active_tag}{txt}{{\\r}}")
                        elif inactive_alpha:
                            if inactive_alpha >= 255:
                                # Typewriter reveal: words already spoken stay
                                # fully visible, upcoming ones are hidden. The
                                # line still reserves their space, so nothing
                                # shifts as each word appears.
                                if idx > wi:
                                    parts.append(f"{{\\alpha&HFF&}}{txt}{{\\r}}")
                                else:
                                    parts.append(txt)
                            else:
                                parts.append(f"{{\\alpha&H{inactive_alpha:02X}&}}{txt}{{\\r}}")
                        else:
                            parts.append(txt)
                        parts.append(" ")
                        idx += 1
                body = "".join(parts).rstrip()
                ass.append(f"Dialogue: 0,{w_start},{w_end},Default,,0,0,0,,{body}")

        return "\n".join(ass)

    # ── Non-karaoke path (unchanged behaviour) ───────────────────────────────
    chunked_segments = chunk_caption_segments(segments, style)

    for seg in chunked_segments:
        start_ass = _seconds_to_ass_time(seg["start"])
        end_ass   = _seconds_to_ass_time(seg["end"])
        text = str(seg.get("text", "")).strip()
        if text:
            # ASS tags for animations and accents
            prefix = ""
            entry = config.get("overrides", {}).get("effects", {}).get("entryAnimation", "none")
            if entry == "fade": prefix = "{\\fad(150,0)}"
            if entry == "pop": prefix = "{\\fad(50,0)\\t(0,100,1,\\fscx100\\fscy100)\\fscx80\\fscy80}"

            # Accents logic: split lines by \N, then apply color override \c&H...& to specific words/lines
            lines = text.split("\\N")
            if style["accentMode"] == "second_line" and len(lines) > 1:
                lines[1] = f"{{\\c{secondary_ass}}}" + lines[1] + f"{{\\c{primary_ass}}}"
                text = "\\N".join(lines)
            elif style["accentMode"] == "alternate_phrase":
                # For simplicity, alternate color on second half of text
                text = f"{{\\c{secondary_ass}}}" + text
                
            ass.append(f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{prefix}{text}")

    return "\n".join(ass)

def _get_video_dimensions(video_path: str):
    ffmpeg_dir = None
    try:
        ffmpeg_cmd = get_ffmpeg_cmd()
        ffmpeg_dir = os.path.dirname(ffmpeg_cmd)
    except Exception:
        pass

    ffprobe_candidates = ["ffprobe"]
    if ffmpeg_dir:
        ffprobe_candidates.insert(0, os.path.join(ffmpeg_dir, "ffprobe"))

    for ffprobe_cmd in ffprobe_candidates:
        try:
            cmd = [
                ffprobe_cmd, "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x",
                video_path
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=30)
            if res.stdout.strip():
                w, h = res.stdout.strip().split('x')
                return int(w), int(h)
        except Exception:
            continue

    logger.warning("Could not get video dimensions. Defaulting to 1080x1920.")
    return 1080, 1920

def prepare_captions_ass(
    main_audio_path: str,
    config: Dict[str, Any],
    width: int,
    height: int,
    progress_callback: Optional[callable] = None
) -> Optional[str]:
    """
    Transcribes audio (or uses SRT) and builds the ASS file.
    Returns the path to the created .ass file, or None if no captions.
    """
    caption_source = config.get("caption_source", "none").lower()
    if caption_source == "none":
        return None

    if progress_callback:
        progress_callback("Validating caption settings...", 0)

    segments = []
    words: List[Dict[str, Any]] = []

    # Whether this render needs per-word timing at all. Resolving the style up
    # front avoids paying Whisper's word-alignment cost for presets that don't
    # use karaoke.
    _style_probe = resolve_caption_style(
        config.get("presetId", config.get("caption_preset", "viral_bold")),
        config.get("overrides", {}),
    )
    wants_karaoke = _style_probe.get("karaokeMode", "none") != "none"

    if caption_source == "auto":
        if not main_audio_path or not os.path.exists(main_audio_path):
            raise RuntimeError("Automatic captions failed because the main audio could not be found.")
        
        if progress_callback:
            progress_callback("Generating automatic captions...", 10)
        
        from transcription_helpers import transcribe_audio_backend
        try:
            def _tx_prog(msg, pct):
                if progress_callback:
                    progress_callback(msg, 10 + int(pct * 0.5))
            
            res = transcribe_audio_backend(
                audio_path=main_audio_path,
                model_name="base",
                output_style="detailed",
                segmentation_intensity="normal",
                progress_callback=_tx_prog,
                word_timestamps=wants_karaoke
            )
            segments = res.get("segments", [])
            words = res.get("words", []) or []
            if not segments:
                raise ValueError("Transcription returned no segments.")
        except Exception as e:
            logger.error(f"Auto caption transcription failed: {e}")
            raise RuntimeError(f"The transcription model could not process this audio file: {str(e)}")

    elif caption_source == "srt":
        srt_path = config.get("srt_file", "")
        if not srt_path or not os.path.exists(srt_path):
            raise RuntimeError("Please upload an SRT file or choose another caption source.")
        
        if progress_callback:
            progress_callback("Validating subtitles...", 10)
            
        err = validate_srt(srt_path)
        if err:
            raise RuntimeError(f"Invalid SRT: {err}")
        
        segments = parse_srt(srt_path)

    elif caption_source == "manual":
        # Cues typed/edited by the user in the Caption Studio editor. Already
        # validated client-side, but re-check here so a malformed payload can't
        # produce a broken ASS file.
        raw = config.get("manual_segments") or []
        for i, cue in enumerate(raw):
            try:
                start = float(cue.get("start"))
                end = float(cue.get("end"))
            except (TypeError, ValueError):
                raise RuntimeError(f"Manual caption {i + 1} has an invalid start or end time.")
            text = str(cue.get("text", "")).strip()
            if not text:
                continue
            if end <= start:
                raise RuntimeError(
                    f"Manual caption {i + 1} ends at or before it starts ({start}s → {end}s)."
                )
            segments.append({"start": start, "end": end, "text": text})
        segments.sort(key=lambda s: s["start"])
        if not segments:
            raise RuntimeError("No manual captions were entered. Add at least one line.")

    if not segments:
        raise RuntimeError("No caption segments were produced.")

    # SRT and manual sources carry no word timing. Approximate it so karaoke
    # presets still work with them rather than silently rendering flat.
    if wants_karaoke and not words:
        words = synthesize_words_from_segments(segments)

    if progress_callback:
        progress_callback("Applying captions...", 60)

    # Build ASS file
    ass_content = build_styled_ass(segments, {**config, "words": words}, width, height)
    
    # Save ASS to temporary file (utf-8 for libass)
    temp_dir = Path(tempfile.gettempdir())
    ass_path = temp_dir / f"captions_{uuid.uuid4().hex}.ass"
    
    with open(ass_path, 'w', encoding='utf-8') as f:
        f.write(ass_content)

    return str(ass_path)

def apply_captions_pipeline(
    base_video_path: str,
    main_audio_path: str,
    config: Dict[str, Any],
    progress_callback: Optional[callable] = None
) -> str:
    """
    Legacy wrapper for apply_captions_pipeline. This is mostly bypassed now
    by directly feeding the ASS filter into the main MoviePy render pass.
    """
    w, h = _get_video_dimensions(base_video_path)
    ass_path_str = prepare_captions_ass(main_audio_path, config, w, h, progress_callback)
    
    if not ass_path_str:
        return base_video_path
        
    ass_path = Path(ass_path_str)
    final_video_path = base_video_path.rsplit('.', 1)[0] + "_captioned.mp4"

    # --- DEBUG TRACE ---
    logger.info("CAPTION DEBUG — incoming config")
    logger.info(str(config))
    logger.info(f"CAPTION DEBUG — resolved preset: {config.get('caption_preset')}")
    logger.info("CAPTION DEBUG — resolved style values applied to ASS.")
    logger.info(f"CAPTION DEBUG — ASS output path: {ass_path}")
    logger.info(f"CAPTION DEBUG — final output path: {final_video_path}")
    # -------------------

    try:
        ffmpeg_cmd = get_ffmpeg_cmd()
        
        # Path escaping for the ASS filter
        safe_ass_path = ass_path.name
        
        # Packaged/frozen app: fonts are bundled under sys._MEIPASS/fonts (see
        # syncframe-backend.spec). Local dev: read straight from the source tree.
        if getattr(sys, "frozen", False):
            fontsdir_path = os.path.join(sys._MEIPASS, "fonts")
        else:
            fontsdir_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "fonts"))
        safe_fontsdir = fontsdir_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")

        cmd = [
            ffmpeg_cmd,
            "-y",
            "-i", base_video_path,
            "-vf", f"ass='{safe_ass_path}':fontsdir='{safe_fontsdir}'",
            "-c:a", "copy",
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-movflags", "+faststart",
            final_video_path
        ]
        
        logger.info(f"CAPTION DEBUG — final FFmpeg filter/command: {' '.join(cmd)}")
        
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                       cwd=str(ass_path.parent), timeout=600)
            
    except subprocess.CalledProcessError as e:
        err_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
        logger.error(f"FFmpeg caption application failed: {err_msg}")
        # Clean up incomplete output — original base video is preserved
        if os.path.exists(final_video_path):
            try:
                os.remove(final_video_path)
            except Exception:
                pass
        raise RuntimeError("Failed to apply captions during video rendering. Check that libass is available.")
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg caption timed out")
        raise RuntimeError("Caption rendering timed out.")
    finally:
        try:
            os.remove(ass_path)
        except Exception:
            pass

    if progress_callback:
        progress_callback("Saving final captioned output...", 95)
        
    return final_video_path
