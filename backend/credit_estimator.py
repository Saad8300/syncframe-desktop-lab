import math
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
try:
    from plan_limits import CREDIT_COSTS, PLANS, TTS_TRANSLATION_CHARS_PER_CREDIT
except ImportError:
    from .plan_limits import CREDIT_COSTS, PLANS, TTS_TRANSLATION_CHARS_PER_CREDIT

plans_router = APIRouter()
credits_router = APIRouter()

class EstimateRequest(BaseModel):
    tool: str # 'script_timestamp', 'audio_merger', 'video_export', 'batch_video'
    duration_seconds: float
    resolution: str = "1080p" # "720p", "1080p", "2K", "4K"
    count: int = 1
    premium_template: bool = False
    # Characters to be auto-translated before synthesis (Text to Speech).
    # 0 = no translation. Priced separately from the generation itself.
    translate_chars: int = 0

@plans_router.get("/catalog")
def get_plans_catalog():
    """Returns the static plans catalog. Used as a fallback if DB fails."""
    return {"status": "ok", "plans": list(PLANS.values())}

@credits_router.post("/estimate")
def estimate_credits(req: EstimateRequest):
    """Estimates the required credits for a specific generation task."""
    breakdown = []
    total_credits = 0
    duration_mins = req.duration_seconds / 60.0

    # 1. Base Tool Cost
    if req.tool == "script_timestamp":
        cost_per_min = CREDIT_COSTS["script_timestamp"]["per_minute"]
        minimum = CREDIT_COSTS["script_timestamp"]["minimum"]
        base_cost = math.ceil(duration_mins) * cost_per_min
        base_cost = max(base_cost, minimum)
        label = "Script Timestamp Generation"
    
    elif req.tool == "audio_merger":
        cost_per_min = CREDIT_COSTS["audio_merger"]["per_minute"]
        minimum = CREDIT_COSTS["audio_merger"]["minimum"]
        base_cost = math.ceil(req.duration_seconds / 300.0) * 1
        base_cost = max(base_cost, minimum)
        label = "Audio Merge"

    elif req.tool == "text_to_speech":
        cost_per_min = CREDIT_COSTS["text_to_speech"]["per_minute"]
        minimum = CREDIT_COSTS["text_to_speech"]["minimum"]
        base_cost = math.ceil(duration_mins) * cost_per_min
        base_cost = max(base_cost, minimum)
        label = "Text to Speech"
        
    elif req.tool in ["video_export", "batch_video", "video_timeline", "media_timeline"]:
        res = req.resolution if req.resolution in CREDIT_COSTS["video_export"] else "1080p"
        cost_per_min = CREDIT_COSTS["video_export"][res]["per_minute"]
        minimum = CREDIT_COSTS["video_export"][res]["minimum"]
        base_cost = math.ceil(duration_mins) * cost_per_min
        base_cost = max(base_cost, minimum)
        label = f"{res} Video Export"
    else:
        # Default fallback
        base_cost = math.ceil(duration_mins) * 5
        base_cost = max(base_cost, 5)
        label = "Unknown Tool Generation"

    # Multiply by count (e.g. Batch Video Generator)
    if req.count > 1:
        base_cost = base_cost * req.count
        label = f"{label} (x{req.count})"

    total_credits += base_cost
    breakdown.append({"label": label, "credits": base_cost})

    # 2. Addons
    if req.translate_chars and req.translate_chars > 0:
        translate_cost = max(1, math.ceil(req.translate_chars / TTS_TRANSLATION_CHARS_PER_CREDIT))
        total_credits += translate_cost
        breakdown.append({"label": f"Auto-Translate ({req.translate_chars:,} chars)", "credits": translate_cost})

    if req.premium_template:
        addon_cost = CREDIT_COSTS["addons"]["premium_template"] * req.count
        total_credits += addon_cost
        breakdown.append({"label": "Premium Template Addon", "credits": addon_cost})


    return {
        "required_credits": total_credits,
        "breakdown": breakdown,
        "plan_notes": "Credit estimates are subject to fair use limits."
    }
