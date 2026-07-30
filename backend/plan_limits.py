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
    # Text to Speech: priced per minute of generated audio, matching
    # script_timestamp's rate — both are light local CPU work on audio of a
    # comparable length. Callers estimate duration from character count
    # before generation (see TTS_CHARS_PER_SECOND).
    "text_to_speech": {"per_minute": 1, "minimum": 1},
    "video_export": {
        "720p": {"per_minute": 5, "minimum": 5},
        "1080p": {"per_minute": 10, "minimum": 10},
        "2K": {"per_minute": 15, "minimum": 15},
        "4K": {"per_minute": 25, "minimum": 25},
    },
    "addons": {
        "premium_template": 5,
    }
}

# Average speaking rate used to turn a character count into an estimated
# audio duration for Text to Speech credit estimates (~180 wpm at ~5 chars
# per word). Shared by the backend estimator and the frontend so the
# pre-generation estimate and the charged amount agree.
# Empirically validated: a 5,960-char script synthesized to 403s of audio
# (14.8 chars/sec), vs 398s predicted by this constant.
TTS_CHARS_PER_SECOND = 15.0

# Text to Speech mode thresholds (characters).
# Short Form is a single synthesis pass; Long Form chunks the text, synthesizes
# each chunk, and concatenates. Mirrors the source app's proven values.
TTS_SHORT_FORM_MAX_CHARS = 5000
TTS_LONG_FORM_MAX_CHARS = 30000
TTS_LONG_FORM_CHUNK_SIZE = 1500

# Auto-Translate surcharge: 1 credit per 1,000 characters translated
# (minimum 1), on top of the normal generation cost. Rationale: a 5,000-char
# script costs ~6 credits to voice, so translation adds ~5 — proportional to
# the extra processing without being punitive. Translation currently runs
# through a free public endpoint, so the marginal cost to the operator is $0.
# NOTE: if this is ever switched to a paid API (Google Cloud Translation /
# DeepL at ~$20-25 per million characters), this rate under-recovers by
# roughly 4x and should be raised.
TTS_TRANSLATION_CHARS_PER_CREDIT = 1000

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
    "starter": {
        "id": "starter",
        "display_name": "Starter",
        "monthly_credits": 1500,
        "limits": {
            "max_video_length": 180,
            "max_audio_length": 300,
            "max_timestamp_length": 300,
            "max_resolution": "1080p",
            "watermark": False,
            "batch_enabled": True,
            "premium_templates": False
        },
        "features": [
            "1,500 credits / month",
            "Up to 3-min videos",
            "1080p export",
            "Basic timeline tools",
            "Save templates"
        ]
    },
    "pro": {
        "id": "pro",
        "display_name": "Pro",
        "monthly_credits": 6000,
        "limits": {
            "max_video_length": 900,
            "max_audio_length": 1800,
            "max_timestamp_length": 1800,
            "max_resolution": "4K",
            "watermark": False,
            "batch_enabled": True,
            "premium_templates": True
        },
        "features": [
            "6,000 credits / month",
            "Up to 15-min videos",
            "No watermark",
            "Batch Video Generator",
            "Premium templates",
            "Advanced workflow controls"
        ]
    },
    "agency": {
        "id": "agency",
        "display_name": "Agency",
        "monthly_credits": 10000,
        "limits": {
            "max_video_length": 3600,
            "max_audio_length": 7200,
            "max_timestamp_length": 7200,
            "max_resolution": "4K",
            "watermark": False,
            "batch_enabled": True,
            "premium_templates": True
        },
        "features": [
            "10,000 credits / month",
            "High-volume fair use",
            "4K export",
            "Large batch generation",
            "Commercial usage",
            "Advanced workflow controls"
        ]
    }
}
