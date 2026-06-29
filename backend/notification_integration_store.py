"""
notification_integration_store.py
Stores n8n webhook integration settings in backend/data/notification_integrations.json
Keeps webhook URLs out of logs and Git.
"""

import json
import logging
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SETTINGS_FILE = DATA_DIR / "notification_integrations.json"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "n8n_enabled": False,
    "n8n_webhook_url": "",
    "n8n_events": {
        "render_started": False,
        "render_completed": True,
        "render_failed": True,
        "batch_queue_started": False,
        "batch_queue_completed": True,
        "batch_job_completed": False,
        "batch_job_failed": True,
        "backend_disconnected": True,
        "backend_reconnected": True,
    },
    "n8n_timeout_seconds": 10,
    "n8n_retry_once": True,
    "n8n_include_output_path": False,
    "n8n_include_local_paths": False,
    "last_delivery_status": None,
    "last_delivery_at": None,
    "last_delivery_error": None,
}


def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _safe_log_url(url: str) -> str:
    """Return a masked representation for logging — never logs the full URL."""
    if not url:
        return "[URL NOT SET]"
    if len(url) <= 12:
        return "[URL SET]"
    return "[URL SET - MASKED]"


def load_settings() -> Dict[str, Any]:
    """Load n8n integration settings from file, merging with defaults."""
    try:
        if not SETTINGS_FILE.exists():
            return dict(DEFAULT_SETTINGS)

        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            raw = json.load(f)

        result = dict(DEFAULT_SETTINGS)
        for k, v in raw.items():
            if k == "n8n_events" and isinstance(v, dict):
                result["n8n_events"] = {**DEFAULT_SETTINGS["n8n_events"], **v}
            else:
                result[k] = v

        return result

    except Exception as e:
        logger.error(f"Failed to load notification integration settings: {e}")
        return dict(DEFAULT_SETTINGS)


def save_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Save updated settings, merging with existing. Returns final settings."""
    try:
        _ensure_data_dir()
        current = load_settings()

        for k, v in updates.items():
            if k == "n8n_events" and isinstance(v, dict):
                current["n8n_events"] = {**current.get("n8n_events", {}), **v}
            else:
                current[k] = v

        # Validate webhook URL
        url = current.get("n8n_webhook_url", "")
        if url and not (url.startswith("http://") or url.startswith("https://")):
            logger.warning("Rejected invalid webhook URL scheme")
            current["n8n_webhook_url"] = ""
            current["n8n_enabled"] = False

        # Clamp timeout
        timeout = current.get("n8n_timeout_seconds", 10)
        current["n8n_timeout_seconds"] = max(3, min(60, int(timeout)))

        # Atomic write
        tmp_file = SETTINGS_FILE.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2)
        os.replace(tmp_file, SETTINGS_FILE)

        logger.info(f"Notification integration settings saved (webhook: {_safe_log_url(url)})")
        return current

    except Exception as e:
        logger.error(f"Failed to save notification integration settings: {e}")
        return load_settings()


def update_delivery_status(success: bool, error_msg: Optional[str] = None):
    """Update the last delivery status after a webhook send attempt."""
    try:
        updates = {
            "last_delivery_status": "success" if success else "failed",
            "last_delivery_at": datetime.now(timezone.utc).isoformat(),
            "last_delivery_error": None if success else (error_msg or "Unknown error"),
        }
        save_settings(updates)
    except Exception as e:
        logger.error(f"Failed to update delivery status: {e}")


def get_safe_settings() -> Dict[str, Any]:
    """Return settings safe for API response."""
    s = load_settings()
    url = s.get("n8n_webhook_url", "")
    if url:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            masked = f"{parsed.scheme}://{parsed.netloc}/***"
        except Exception:
            masked = f"{url[:20]}***"
        s["n8n_webhook_url_masked"] = masked
    else:
        s["n8n_webhook_url_masked"] = ""
    return s
