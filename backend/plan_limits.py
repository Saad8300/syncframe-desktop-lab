# backend/plan_limits.py
from typing import Dict, Any

# Credit Cost Definitions
# -----------------------
# Initial credit costs (per unit/minute):
# Script Timestamp: 1 credit per 1 minute (minimum 1)
# Audio Merge: 1 credit per 5 minutes (minimum 1)
# Video Export 720p: 5 credits per minute (minimum 5)
# Video Export 1080p: 10 credits per minute (minimum 10)
# Video Export 2K: 15 credits per minute (minimum 15)
# Video Export 4K: 25 credits per minute (minimum 25)
# Batch Video Generator: base video cost * number of videos
# Premium Template: +5 credits per export
# n8n automation trigger: +1 credit per completed job

CREDIT_COSTS = {
    "script_timestamp": {"per_minute": 1, "minimum": 1},
    "audio_merger": {"per_minute": 0.2, "minimum": 1}, # 1 credit per 5 mins
    "video_export": {
        "720p": {"per_minute": 5, "minimum": 5},
        "1080p": {"per_minute": 10, "minimum": 10},
        "2K": {"per_minute": 15, "minimum": 15},
        "4K": {"per_minute": 25, "minimum": 25},
    },
    "addons": {
        "premium_template": 5,
        "n8n_trigger": 1,
    }
}

# Plan Limits 
# -----------
# Free Trial: 3 exports, 60s max video/audio/script, 720p max, watermark true
# Standard: 3min video, 5min audio/script, 1080p max, watermark true
# Pro: 15min video, 30min audio/script, 1080p max, watermark false
# Ultra: 60+ min video, 120min audio/script, 4K max, watermark false

PLANS = {
    "free": {
        "id": "free",
        "display_name": "Free Trial",
        "monthly_credits": 30,
        "limits": {
            "max_video_exports": 3,
            "max_video_length": 60,
            "max_audio_length": 60,
            "max_timestamp_length": 60,
            "max_resolution": "720p",
            "watermark": True,
            "batch_enabled": False,
            "n8n_enabled": False,
            "premium_templates": False
        },
        "features": [
            "30 one-time credits",
            "3 video exports",
            "Max 60s duration",
            "720p export",
            "Watermark enabled"
        ]
    },
    "standard": {
        "id": "standard",
        "display_name": "Standard",
        "monthly_credits": 500,
        "limits": {
            "max_video_length": 180,
            "max_audio_length": 300,
            "max_timestamp_length": 300,
            "max_resolution": "1080p",
            "watermark": True,
            "batch_enabled": False,
            "n8n_enabled": False,
            "premium_templates": False
        },
        "features": [
            "500 credits / month",
            "Up to 3-min videos",
            "1080p export",
            "Basic timeline tools",
            "Save templates"
        ]
    },
    "pro": {
        "id": "pro",
        "display_name": "Pro",
        "monthly_credits": 2000,
        "limits": {
            "max_video_length": 900,
            "max_audio_length": 1800,
            "max_timestamp_length": 1800,
            "max_resolution": "1080p",
            "watermark": False,
            "batch_enabled": True,
            "n8n_enabled": True,
            "premium_templates": True
        },
        "features": [
            "2,000 credits / month",
            "Up to 15-min videos",
            "No watermark",
            "Batch Video Generator",
            "Premium templates",
            "n8n automations"
        ]
    },
    "ultra": {
        "id": "ultra",
        "display_name": "Ultra",
        "monthly_credits": 10000,
        "limits": {
            "max_video_length": 3600,
            "max_audio_length": 7200,
            "max_timestamp_length": 7200,
            "max_resolution": "4K",
            "watermark": False,
            "batch_enabled": True,
            "n8n_enabled": True,
            "premium_templates": True
        },
        "features": [
            "10,000 credits / month",
            "High-volume fair use",
            "4K export",
            "Large batch generation",
            "Commercial usage"
        ]
    }
}
