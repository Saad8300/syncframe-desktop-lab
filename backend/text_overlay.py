import os
import platform
import textwrap
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import logging

logger = logging.getLogger(__name__)

def hex_to_rgba(hex_color: str, opacity_pct: float) -> tuple:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join([c*2 for c in hex_color])
    try:
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
    except ValueError:
        r, g, b = 255, 255, 255
    a = int(255 * (max(0.0, min(100.0, opacity_pct)) / 100.0))
    return (r, g, b, a)

def _load_font(font_family: str, font_weight: str, font_size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    # A simplified font loader that attempts to find a matching system font
    candidates = []
    family_lower = font_family.lower()
    weight_lower = font_weight.lower()
    
    if platform.system() == "Darwin":
        if "inter" in family_lower:
            candidates.extend(["/System/Library/Fonts/Supplemental/Inter-Regular.ttf", "/Library/Fonts/Inter-Regular.ttf"])
        elif "arial" in family_lower:
            candidates.extend(["/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"])
        elif "helvetica" in family_lower:
            candidates.append("/System/Library/Fonts/Helvetica.ttc")
        elif "impact" in family_lower:
            candidates.append("/Library/Fonts/Impact.ttf")
        # Add fallbacks
        candidates.extend(["/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"])
    else:
        # Linux / Windows fallback
        candidates.extend([
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf"
        ])
    
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                pass
    return ImageFont.load_default()

def make_text_overlay(
    target_w: int, target_h: int, text: str,
    font_family: str = "Inter",
    font_size_percent: float = 5.0,
    font_weight: str = "Medium",
    color: str = "#FFFFFF", opacity: float = 100.0,
    x_percent: float = 50.0, y_percent: float = 88.0,
    align: str = "center",
    max_width_percent: float = 90.0,
    shadow_enabled: bool = True,
    stroke_enabled: bool = False,
    stroke_color: str = "#000000",
    bg_enabled: bool = False,
    bg_color: str = "#000000",
    bg_opacity: float = 50.0
) -> np.ndarray | None:
    
    text = text.strip()
    if not text:
        return None

    try:
        overlay = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        # Calculate real font size
        font_size = max(10, int(target_h * (font_size_percent / 100.0)))
        font = _load_font(font_family, font_weight, font_size)
        
        # Multiline support
        max_px_width = int(target_w * (max_width_percent / 100.0))
        
        # Very simple wrapping logic
        lines = []
        for line in text.split('\n'):
            words = line.split(' ')
            current_line = []
            for word in words:
                test_line = ' '.join(current_line + [word])
                try:
                    w = draw.textlength(test_line, font=font)
                except AttributeError:
                    w, _ = draw.textsize(test_line, font=font)
                if w <= max_px_width or not current_line:
                    current_line.append(word)
                else:
                    lines.append(' '.join(current_line))
                    current_line = [word]
            if current_line:
                lines.append(' '.join(current_line))
                
        wrapped_text = '\n'.join(lines)
        
        # Bounding box of full wrapped text
        try:
            bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=font, align=align)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
        except AttributeError:
            text_w, text_h = draw.multiline_textsize(wrapped_text, font=font)
            
        # Base anchor coordinates
        anchor_x = target_w * (x_percent / 100.0)
        anchor_y = target_h * (y_percent / 100.0)
        
        if align == "left":
            x = int(anchor_x)
        elif align == "right":
            x = int(anchor_x - text_w)
        else: # center
            x = int(anchor_x - text_w / 2)
            
        y = int(anchor_y - text_h / 2)
        
        # Colors
        text_rgba = hex_to_rgba(color, opacity)
        stroke_rgba = hex_to_rgba(stroke_color, opacity)
        
        # Background box
        if bg_enabled:
            pad_x = int(font_size * 0.4)
            pad_y = int(font_size * 0.2)
            bg_rgba = hex_to_rgba(bg_color, bg_opacity)
            try:
                draw.rounded_rectangle(
                    [x - pad_x, y - pad_y, x + text_w + pad_x, y + text_h + pad_y],
                    radius=max(4, int(font_size * 0.2)), fill=bg_rgba
                )
            except AttributeError:
                draw.rectangle([x - pad_x, y - pad_y, x + text_w + pad_x, y + text_h + pad_y], fill=bg_rgba)
        
        # Shadow
        if shadow_enabled and not stroke_enabled:
            shadow_off = max(1, int(font_size * 0.05))
            shadow_rgba = (0, 0, 0, int(255 * (opacity/100.0) * 0.7))
            draw.multiline_text((x + shadow_off, y + shadow_off), wrapped_text, font=font, fill=shadow_rgba, align=align)
            
        # Draw stroke if enabled
        stroke_width = 0
        if stroke_enabled:
            stroke_width = max(1, int(font_size * 0.04))
            
        # Main text
        try:
            draw.multiline_text(
                (x, y), wrapped_text, font=font, fill=text_rgba, align=align,
                stroke_width=stroke_width, stroke_fill=stroke_rgba
            )
        except TypeError:
            # Fallback if Pillow version doesn't support stroke (older versions)
            draw.multiline_text((x, y), wrapped_text, font=font, fill=text_rgba, align=align)

        return np.array(overlay)
    except Exception as exc:
        logger.warning(f"Text overlay render failed: {exc}")
        return None

def build_text_overlay_ass(
    target_w: int, target_h: int, duration: float,
    config: dict, rows: list = None
) -> str | None:
    """
    Translates TextOverlayConfig directly into an ASS file content, bypassing Pillow.
    This runs at native FFmpeg speed during the main video encode.
    """
    if not config or not config.get("enabled"):
        return None
        
    mode = config.get("mode", "whole_video")
    
    font_family = config.get("font_family", "Inter")
    font_size_pct = config.get("font_size_percent", 5.0)
    font_size = max(10, int(target_h * (font_size_pct / 100.0)))
    font_weight = config.get("font_weight", "Bold")
    bold = -1 if font_weight.lower() in ("bold", "heavy", "black", "800", "900") else 0
    
    # Colors
    def to_ass_color(hex_str, op_pct):
        # ASS color format: &HAABBGGRR
        hex_str = str(hex_str).lstrip('#')
        if len(hex_str) == 3: hex_str = ''.join(c*2 for c in hex_str)
        try:
            r, g, b = hex_str[0:2], hex_str[2:4], hex_str[4:6]
        except:
            r, g, b = "FF", "FF", "FF"
        a_val = int(255 * (1.0 - (max(0, min(100, op_pct)) / 100.0)))
        a = f"{a_val:02X}"
        return f"&H{a}{b}{g}{r}"

    op = config.get("opacity", 100.0)
    primary_c = to_ass_color(config.get("color", "#FFFFFF"), op)
    secondary_c = primary_c
    
    stroke_c = to_ass_color(config.get("stroke_color", "#000000"), op)
    stroke_w = max(1, int(font_size * 0.04)) if config.get("stroke_enabled", True) else 0
    
    shadow_en = config.get("shadow_enabled", True)
    shadow_w = max(1, int(font_size * 0.05)) if shadow_en and stroke_w == 0 else 0
    
    bg_en = config.get("background_enabled", False)
    bg_c = to_ass_color(config.get("background_color", "#000000"), config.get("background_opacity", 50.0))
    
    if bg_en:
        border_style = 3
        outline = max(2, int(font_size * 0.05))
        back_color = bg_c
    else:
        border_style = 1
        outline = stroke_w
        back_color = "&H99000000" if shadow_en else "&HFF000000"
        
    align_str = config.get("align", "center")
    
    # 1=BL, 2=BC, 3=BR, 4=ML, 5=MC, 6=MR, 7=TL, 8=TC, 9=TR
    # However, since we define exact pos(x,y), alignment mainly controls text anchoring.
    if align_str == "left": alignment = 4
    elif align_str == "right": alignment = 6
    else: alignment = 5
    
    ass_lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {target_w}",
        f"PlayResY: {target_h}",
        "WrapStyle: 1",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: OverlayStyle,{font_family},{font_size},{primary_c},{secondary_c},{stroke_c},{back_color},"
        f"{bold},0,0,0,100,100,0,0,{border_style},{outline},{shadow_w},{alignment},0,0,0,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]
    
    def sec_to_ass(s):
        h = int(s // 3600)
        m = int((s % 3600) // 60)
        secs = s % 60
        return f"{h}:{m:02d}:{secs:05.2f}"
        
    def add_event(txt, start_s, end_s):
        if not txt: return
        txt = txt.strip().replace('\n', '\\N')
        x = int(target_w * (config.get("x_percent", 50.0) / 100.0))
        y = int(target_h * (config.get("y_percent", 90.0) / 100.0))
        # Use \\pos tags to absolutely position the anchored text
        ass_lines.append(
            f"Dialogue: 1,{sec_to_ass(start_s)},{sec_to_ass(end_s)},OverlayStyle,,0,0,0,,{{\\pos({x},{y})}}{txt}"
        )

    if mode == "whole_video":
        add_event(config.get("text", ""), 0, duration)
    elif mode == "timed_text":
        from utils import parse_time
        for idx, itm in enumerate(config.get("items", [])):
            try:
                s_str = str(itm.get("start", "00:00"))
                e_str = str(itm.get("end", "00:05"))
                s = float(s_str) if s_str.replace('.','',1).isdigit() else parse_time(s_str)
                e = float(e_str) if e_str.replace('.','',1).isdigit() else parse_time(e_str)
                if e > s:
                    add_event(itm.get("text", ""), s, e)
            except Exception:
                pass
    elif mode == "csv_text" and rows:
        for r in rows:
            txt = r.get("text", "").strip()
            if txt:
                add_event(txt, r["start"], r["end"])
                
    if len(ass_lines) <= 12: # No events added
        return None
        
    return "\n".join(ass_lines)
