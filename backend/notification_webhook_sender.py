"""
notification_webhook_sender.py
Sends structured JSON event payloads to the configured n8n webhook URL.
Uses Python stdlib urllib only — no extra dependencies needed.
CRITICAL: Webhook failure must NEVER raise an exception or fail video generation.
"""

import json
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional, Dict, Any

import notification_integration_store

logger = logging.getLogger(__name__)

# Maps event_type -> human label + severity
EVENT_META: Dict[str, Dict[str, str]] = {
    "render_started":          {"label": "Render Started",           "severity": "info"},
    "render_completed":        {"label": "Render Completed",         "severity": "success"},
    "render_failed":           {"label": "Render Failed",            "severity": "error"},
    "batch_queue_started":     {"label": "Batch Queue Started",      "severity": "info"},
    "batch_queue_completed":   {"label": "Batch Queue Completed",    "severity": "success"},
    "batch_job_completed":     {"label": "Batch Job Completed",      "severity": "success"},
    "batch_job_failed":        {"label": "Batch Job Failed",         "severity": "error"},
    "backend_disconnected":    {"label": "Backend Disconnected",     "severity": "error"},
    "backend_reconnected":     {"label": "Backend Reconnected",      "severity": "success"},
    "test_notification":       {"label": "Test Notification",        "severity": "info"},
}


def _build_payload(
    event_type: str,
    job_info: Optional[Dict[str, Any]] = None,
    batch_info: Optional[Dict[str, Any]] = None,
    error_info: Optional[Dict[str, Any]] = None,
    status_message: Optional[str] = None,
    include_output_path: bool = False,
    include_local_paths: bool = False,
) -> Dict[str, Any]:
    """Build the structured JSON payload for n8n."""
    meta = EVENT_META.get(event_type, {"label": event_type, "severity": "info"})

    payload: Dict[str, Any] = {
        "source": "syncframe_studio",
        "app_name": "SyncFrame Studio",
        "event_type": event_type,
        "event_label": meta["label"],
        "severity": meta["severity"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "job": None,
        "status": {
            "message": status_message or meta["label"],
        },
        "batch": None,
        "error": None,
        "metadata": {},
    }

    if job_info:
        job_block: Dict[str, Any] = {
            "job_id": job_info.get("job_id"),
            "tool": job_info.get("tool"),
            "title": job_info.get("title"),
            "output_filename": job_info.get("output_filename"),
            "duration_seconds": job_info.get("duration_seconds"),
            "resolution": job_info.get("resolution"),
            "preset": job_info.get("preset"),
        }
        if include_output_path:
            job_block["output_path"] = job_info.get("output_path")
        else:
            job_block["output_path"] = None

        if not include_local_paths:
            job_block.pop("output_path", None)

        payload["job"] = job_block

        # Metadata: text overlay info if available
        meta_extra = {}
        if "text_overlay_enabled" in job_info:
            meta_extra["text_overlay_enabled"] = job_info["text_overlay_enabled"]
        if "text_overlay_mode" in job_info:
            meta_extra["text_overlay_mode"] = job_info["text_overlay_mode"]
        if meta_extra:
            payload["metadata"] = meta_extra

    if batch_info:
        payload["batch"] = {
            "queue_id": batch_info.get("queue_id"),
            "total_jobs": batch_info.get("total_jobs"),
            "completed_jobs": batch_info.get("completed_jobs"),
            "failed_jobs": batch_info.get("failed_jobs"),
            "current_job_title": batch_info.get("current_job_title"),
        }

    if error_info:
        payload["error"] = {
            "message": error_info.get("message"),
            "code": error_info.get("code", "UNKNOWN"),
        }

    return payload


def _do_post(url: str, payload: Dict[str, Any], timeout: int) -> tuple:
    """Send HTTP POST. Returns (success: bool, status_code: Optional[int], error_msg: Optional[str])"""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "SyncFrameStudio/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status = resp.getcode()
            if 200 <= status < 300:
                return True, status, None
            return False, status, f"HTTP {status}"
    except urllib.error.HTTPError as e:
        return False, e.code, f"HTTP error {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        return False, None, f"Connection error: {e.reason}"
    except TimeoutError:
        return False, None, "Request timed out"
    except Exception as e:
        return False, None, f"Unexpected error: {type(e).__name__}: {str(e)}"


def send_event(
    event_type: str,
    job_info: Optional[Dict[str, Any]] = None,
    batch_info: Optional[Dict[str, Any]] = None,
    error_info: Optional[Dict[str, Any]] = None,
    status_message: Optional[str] = None,
) -> bool:
    """
    Send an event notification to n8n. 
    Returns True on success, False on any failure.
    NEVER raises — caller's render/batch pipeline must not be disrupted.
    """
    try:
        settings = notification_integration_store.load_settings()

        if not settings.get("n8n_enabled", False):
            return False

        url = settings.get("n8n_webhook_url", "")
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            return False

        events = settings.get("n8n_events", {})
        if not events.get(event_type, False):
            return False

        timeout = settings.get("n8n_timeout_seconds", 10)
        retry_once = settings.get("n8n_retry_once", True)
        include_output_path = settings.get("n8n_include_output_path", False)
        include_local_paths = settings.get("n8n_include_local_paths", False)

        payload = _build_payload(
            event_type=event_type,
            job_info=job_info,
            batch_info=batch_info,
            error_info=error_info,
            status_message=status_message,
            include_output_path=include_output_path,
            include_local_paths=include_local_paths,
        )

        logger.info(f"Sending n8n webhook event: {event_type}")
        success, status_code, error_msg = _do_post(url, payload, timeout)

        if not success and retry_once:
            logger.info(f"Retrying n8n webhook (first attempt failed: {error_msg})")
            success, status_code, error_msg = _do_post(url, payload, timeout)

        if success:
            logger.info(f"n8n webhook delivered successfully (event: {event_type}, status: {status_code})")
        else:
            logger.warning(f"n8n webhook delivery failed (event: {event_type}, error: {error_msg})")

        notification_integration_store.update_delivery_status(success, error_msg)
        return success

    except Exception as e:
        logger.error(f"n8n webhook send_event crashed unexpectedly for event '{event_type}': {e}")
        try:
            notification_integration_store.update_delivery_status(False, str(e))
        except Exception:
            pass
        return False


def send_test_event() -> Dict[str, Any]:
    """
    Send a test notification to the configured n8n webhook.
    Returns a result dict with success/error info suitable for API response.
    """
    try:
        settings = notification_integration_store.load_settings()

        url = settings.get("n8n_webhook_url", "")
        if not url:
            return {"success": False, "error": "No webhook URL configured."}

        if not (url.startswith("http://") or url.startswith("https://")):
            return {"success": False, "error": "Invalid URL scheme. Must start with http:// or https://"}

        timeout = settings.get("n8n_timeout_seconds", 10)

        payload = _build_payload(
            event_type="test_notification",
            status_message="This is a test notification from SyncFrame Studio.",
        )

        logger.info("Sending n8n test webhook")
        success, status_code, error_msg = _do_post(url, payload, timeout)

        notification_integration_store.update_delivery_status(success, error_msg)

        if success:
            return {
                "success": True,
                "status_code": status_code,
                "message": "Test notification delivered successfully.",
            }
        else:
            return {
                "success": False,
                "status_code": status_code,
                "error": error_msg or "Delivery failed.",
            }

    except Exception as e:
        logger.error(f"Test webhook failed: {e}")
        return {"success": False, "error": f"Unexpected error: {str(e)}"}
