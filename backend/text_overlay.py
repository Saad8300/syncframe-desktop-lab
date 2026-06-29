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
