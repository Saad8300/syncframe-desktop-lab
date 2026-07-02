import json
import os
import time
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

# Base directories
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
HISTORY_FILE = DATA_DIR / "history.json"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def _load_history() -> List[Dict[str, Any]]:
    _ensure_data_dir()
    if not HISTORY_FILE.exists():
        return []
    
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError("History JSON root must be a list")
            return data
    except Exception as e:
        logger.error(f"Error loading history.json: {e}")
        # Backup corrupted file
        backup_path = HISTORY_FILE.with_suffix(f".corrupt.{int(time.time())}.json")
        try:
            shutil.copy2(HISTORY_FILE, backup_path)
            logger.info(f"Backed up corrupted history file to {backup_path}")
        except Exception:
            pass
        return []

def _save_history(records: List[Dict[str, Any]]):
    _ensure_data_dir()
    # Write to a temp file first, then replace for atomicity
    temp_file = HISTORY_FILE.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        os.replace(temp_file, HISTORY_FILE)
    except Exception as e:
        logger.error(f"Failed to save history: {e}")
        try:
            if temp_file.exists():
                os.remove(temp_file)
        except:
            pass

def get_all_history() -> List[Dict[str, Any]]:
    """Returns all history records sorted newest first."""
    records = _load_history()
    # Sort by created_at descending (assuming ISO-8601 strings)
    records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return records

def add_history(
    tool: str,
    tool_label: str,
    output_name: str,
    output_type: str,
    output_url: str,
    file_extension: str,
    status: str = "completed",
    duration_seconds: Optional[float] = None,
    resolution: Optional[str] = None,
    aspect_ratio: Optional[str] = None,
    render_profile: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
    metadata: Optional[Dict[str, Any]] = None,
    credit_cost: Optional[int] = None
) -> Dict[str, Any]:
    
    record = {
        "id": f"hist_{uuid.uuid4().hex[:12]}",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "tool": tool,
        "tool_label": tool_label,
        "output_name": output_name,
        "output_type": output_type,
        "output_url": output_url,
        "file_extension": file_extension,
        "duration_seconds": duration_seconds,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "render_profile": render_profile,
        "file_size_bytes": file_size_bytes,
        "status": status,
        "credit_cost": credit_cost,
        "metadata": metadata or {}
    }
    
    records = _load_history()
    records.append(record)
    _save_history(records)
    return record

def delete_history_item(history_id: str) -> bool:
    records = _load_history()
    initial_count = len(records)
    records = [r for r in records if r.get("id") != history_id]
    if len(records) < initial_count:
        _save_history(records)
        return True
    return False

def clear_history():
    _save_history([])

def get_stats() -> Dict[str, Any]:
    records = _load_history()
    
    total_videos = 0
    tool_counts = {
        "image_timeline": 0,
        "video_timeline": 0,
        "media_timeline": 0,
        "audio_merger": 0,
        "script_timestamp": 0
    }
    
    total_exports = 0
    total_duration = 0.0
    
    last_activity = "No data yet"
    most_used_tool = "None"
    
    if not records:
        return {
            "total_videos": 0,
            "tool_counts": tool_counts,
            "total_exports": 0,
            "most_used_tool": "None",
            "last_activity": "No data yet",
            "total_generated_duration": 0
        }
    
    for r in records:
        if r.get("status") == "completed":
            total_exports += 1
            
            tool = r.get("tool")
            if tool in tool_counts:
                tool_counts[tool] += 1
                
            if r.get("output_type") == "video":
                total_videos += 1
                
            dur = r.get("duration_seconds")
            if dur and isinstance(dur, (int, float)):
                total_duration += dur
                
    # Sort to find newest for last activity
    sorted_records = sorted(records, key=lambda x: x.get("created_at", ""), reverse=True)
    if sorted_records:
        newest = sorted_records[0]
        last_activity_time = newest.get("created_at", "")
        # Format time simply (e.g. 2026-06-28 12:30)
        try:
            dt = datetime.fromisoformat(last_activity_time.replace("Z", "+00:00"))
            formatted_time = dt.strftime("%Y-%m-%d %H:%M")
        except:
            formatted_time = last_activity_time
        
        tool_label = newest.get("tool_label", "Unknown")
        last_activity = f"{tool_label} ({formatted_time})"
        
    # Most used tool
    max_count = 0
    for t_id, count in tool_counts.items():
        if count > max_count:
            max_count = count
            
    if max_count > 0:
        # map tool ID to label
        tool_labels = {
            "image_timeline": "Image Timeline",
            "video_timeline": "Video Timeline",
            "media_timeline": "Media Timeline",
            "audio_merger": "Audio Merger",
            "script_timestamp": "Script Timestamp"
        }
        best_tool_id = max(tool_counts, key=tool_counts.get)
        most_used_tool = tool_labels.get(best_tool_id, best_tool_id)
        
    return {
        "total_videos": total_videos,
        "tool_counts": tool_counts,
        "total_exports": total_exports,
        "most_used_tool": most_used_tool,
        "last_activity": last_activity,
        "total_generated_duration": total_duration
    }
