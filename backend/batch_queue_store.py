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
DATA_DIR = BASE_DIR / "data" / "batch_jobs"
QUEUE_FILE = DATA_DIR / "queue.json"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

def _load_queue() -> List[Dict[str, Any]]:
    _ensure_data_dir()
    if not QUEUE_FILE.exists():
        return []
    
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError("Queue JSON root must be a list")
            return data
    except Exception as e:
        logger.error(f"Error loading queue.json: {e}")
        # Backup corrupted file
        backup_path = QUEUE_FILE.with_suffix(f".corrupt.{int(time.time())}.json")
        try:
            shutil.copy2(QUEUE_FILE, backup_path)
            logger.info(f"Backed up corrupted queue file to {backup_path}")
        except Exception:
            pass
        return []

def _save_queue(records: List[Dict[str, Any]]):
    _ensure_data_dir()
    # Write to a temp file first, then replace for atomicity
    temp_file = QUEUE_FILE.with_suffix(".tmp")
    try:
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2)
        os.replace(temp_file, QUEUE_FILE)
    except Exception as e:
        logger.error(f"Failed to save queue: {e}")
        try:
            if temp_file.exists():
                os.remove(temp_file)
        except:
            pass

def get_all_jobs() -> List[Dict[str, Any]]:
    """Returns all jobs. For queue logic, might return in creation order."""
    return _load_queue()

def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    records = _load_queue()
    for r in records:
        if r.get("id") == job_id:
            return r
    return None

def add_job(
    source_tool: str,
    source_tool_label: str,
    title: str,
    output_name: str,
    output_type: str = "video",
    export_preset: str = "",
    aspect_ratio: str = "",
    resolution: str = "",
    render_profile: str = "",
    config: Optional[Dict[str, Any]] = None,
    assets: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    
    now = datetime.utcnow().isoformat() + "Z"
    
    record = {
        "id": f"batch_{uuid.uuid4().hex[:12]}",
        "created_at": now,
        "updated_at": now,
        "source_tool": source_tool,
        "source_tool_label": source_tool_label,
        "title": title,
        "output_name": output_name,
        "output_type": output_type,
        "status": "queued",
        "progress": 0,
        "message": "Waiting in queue",
        "export_preset": export_preset,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "render_profile": render_profile,
        "output_url": None,
        "file_extension": "mp4",
        "duration_seconds": None,
        "file_size_bytes": None,
        "error": None,
        "config": config or {},
        "assets": assets or {},
        "metadata": metadata or {}
    }
    
    records = _load_queue()
    records.append(record)
    _save_queue(records)
    return record

def update_job(job_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    records = _load_queue()
    for r in records:
        if r.get("id") == job_id:
            r.update(updates)
            r["updated_at"] = datetime.utcnow().isoformat() + "Z"
            _save_queue(records)
            return r
    return None

def delete_job(job_id: str) -> bool:
    records = _load_queue()
    initial_count = len(records)
    records = [r for r in records if r.get("id") != job_id]
    if len(records) < initial_count:
        _save_queue(records)
        # Also try to delete its folder
        job_dir = DATA_DIR / job_id
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)
        return True
    return False

def move_job_up(job_id: str) -> bool:
    records = _load_queue()
    job_idx = -1
    for i, r in enumerate(records):
        if r.get("id") == job_id:
            job_idx = i
            break
            
    if job_idx <= 0 or records[job_idx].get("status") != "queued":
        return False
        
    prev_queued_idx = -1
    for i in range(job_idx - 1, -1, -1):
        if records[i].get("status") == "queued":
            prev_queued_idx = i
            break
            
    if prev_queued_idx == -1:
        return False
        
    records[job_idx], records[prev_queued_idx] = records[prev_queued_idx], records[job_idx]
    _save_queue(records)
    return True

def move_job_down(job_id: str) -> bool:
    records = _load_queue()
    job_idx = -1
    for i, r in enumerate(records):
        if r.get("id") == job_id:
            job_idx = i
            break
            
    if job_idx == -1 or job_idx == len(records) - 1 or records[job_idx].get("status") != "queued":
        return False
        
    next_queued_idx = -1
    for i in range(job_idx + 1, len(records)):
        if records[i].get("status") == "queued":
            next_queued_idx = i
            break
            
    if next_queued_idx == -1:
        return False
        
    records[job_idx], records[next_queued_idx] = records[next_queued_idx], records[job_idx]
    _save_queue(records)
    return True

def duplicate_job(job_id: str) -> Optional[Dict[str, Any]]:
    records = _load_queue()
    original = None
    for r in records:
        if r.get("id") == job_id:
            original = r
            break
            
    if not original:
        return None
        
    import copy
    import re
    new_job = copy.deepcopy(original)
    new_id = f"batch_{uuid.uuid4().hex[:12]}"
    new_job["id"] = new_id
    now = datetime.utcnow().isoformat() + "Z"
    new_job["created_at"] = now
    new_job["updated_at"] = now
    new_job["status"] = "queued"
    new_job["progress"] = 0
    new_job["message"] = "Waiting in queue"
    new_job["output_url"] = None
    new_job["duration_seconds"] = None
    new_job["file_size_bytes"] = None
    new_job["error"] = None
    
    out_name = new_job.get("output_name", "output")
    if out_name:
        match = re.search(r'_copy(?:_(\d+))?$', out_name)
        if match:
            num = match.group(1)
            next_num = int(num) + 1 if num else 2
            out_name = out_name[:match.start()] + f"_copy_{next_num}"
        else:
            out_name = f"{out_name}_copy"
    new_job["output_name"] = out_name
    
    # Copy job folder if it exists
    orig_dir = DATA_DIR / job_id
    new_dir = DATA_DIR / new_id
    if orig_dir.exists():
        try:
            shutil.copytree(orig_dir, new_dir)
            # Update paths in assets/config if they point to the old job_id
            def replace_paths(d):
                if isinstance(d, dict):
                    for k, v in d.items():
                        if isinstance(v, str) and job_id in v:
                            d[k] = v.replace(job_id, new_id)
                        elif isinstance(v, (dict, list)):
                            replace_paths(v)
                elif isinstance(d, list):
                    for i in range(len(d)):
                        if isinstance(d[i], str) and job_id in d[i]:
                            d[i] = d[i].replace(job_id, new_id)
                        elif isinstance(d[i], (dict, list)):
                            replace_paths(d[i])
            
            replace_paths(new_job.get("assets", {}))
            replace_paths(new_job.get("config", {}))
            
        except Exception as e:
            logger.error(f"Failed to copy job directory for duplication: {e}")
            return None
            
    records.append(new_job)
    _save_queue(records)
    return new_job

def clear_completed_jobs() -> int:
    records = _load_queue()
    initial_count = len(records)
    records = [r for r in records if r.get("status") != "completed"]
    cleared = initial_count - len(records)
    if cleared > 0:
        _save_queue(records)
    return cleared

def clear_failed_jobs() -> int:
    records = _load_queue()
    initial_count = len(records)
    records = [r for r in records if r.get("status") != "failed"]
    cleared = initial_count - len(records)
    if cleared > 0:
        _save_queue(records)
    return cleared

def clear_cancelled_jobs() -> int:
    records = _load_queue()
    initial_count = len(records)
    records = [r for r in records if r.get("status") != "cancelled"]
    cleared = initial_count - len(records)
    if cleared > 0:
        _save_queue(records)
    return cleared

def retry_job(job_id: str) -> bool:
    records = _load_queue()
    for r in records:
        if r.get("id") == job_id:
            if r.get("status") in ["failed", "cancelled"]:
                r["status"] = "queued"
                r["progress"] = 0
                r["message"] = "Waiting in queue"
                r["error"] = None
                r["updated_at"] = datetime.utcnow().isoformat() + "Z"
                _save_queue(records)
                return True
            return False
    return False

def retry_failed_jobs() -> int:
    records = _load_queue()
    count = 0
    for r in records:
        if r.get("status") == "failed":
            r["status"] = "queued"
            r["progress"] = 0
            r["message"] = "Waiting in queue"
            r["error"] = None
            r["updated_at"] = datetime.utcnow().isoformat() + "Z"
            count += 1
    if count > 0:
        _save_queue(records)
    return count

def clear_all_jobs() -> int:
    records = _load_queue()
    initial_count = len(records)
    # Keep running jobs
    records = [r for r in records if r.get("status") == "running"]
    cleared = initial_count - len(records)
    if cleared > 0:
        _save_queue(records)
    return cleared

def get_stats() -> Dict[str, Any]:
    records = _load_queue()
    
    stats = {
        "total": len(records),
        "queued": 0,
        "running": 0,
        "completed": 0,
        "failed": 0,
        "cancelled": 0
    }
    
    for r in records:
        status = r.get("status", "unknown")
        if status in stats:
            stats[status] += 1
            
    return stats
