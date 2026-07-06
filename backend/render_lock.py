import threading
from datetime import datetime

_render_lock = {
    "locked": False,
    "source": None,
    "tool_name": None,
    "job_id": None,
    "started_at": None
}
_render_lock_mutex = threading.Lock()

def get_render_lock_status() -> dict:
    with _render_lock_mutex:
        return _render_lock.copy()

def acquire_render_lock(source: str, tool_name: str, job_id: str) -> bool:
    with _render_lock_mutex:
        if _render_lock["locked"]:
            return False
        _render_lock.update({
            "locked": True,
            "source": source,
            "tool_name": tool_name,
            "job_id": job_id,
            "started_at": datetime.utcnow().isoformat() + "Z"
        })
        return True

def release_render_lock(job_id: str = None, force: bool = False):
    with _render_lock_mutex:
        if _render_lock["locked"]:
            if force or _render_lock["job_id"] == job_id:
                _render_lock.update({
                    "locked": False,
                    "source": None,
                    "tool_name": None,
                    "job_id": None,
                    "started_at": None
                })
