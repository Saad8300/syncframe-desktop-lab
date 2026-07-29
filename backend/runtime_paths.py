import os
import sys
import platform
from pathlib import Path


def get_data_dir() -> Path:
    """
    Returns a writable directory for runtime data (uploads/outputs/temp/data).
    - Packaged/frozen app: use the OS user-data folder (writable without
      admin rights), matching where desktop-backend.log already lives.
    - Local dev (python -m uvicorn ...): keep using the folder next to
      this file, so nothing changes for the dev workflow.
    """
    is_frozen = getattr(sys, "frozen", False)

    if not is_frozen:
        return Path(__file__).parent

    if platform.system() == "Windows":
        base = Path(os.environ["APPDATA"]) / "syncframe-desktop"
    elif platform.system() == "Darwin":
        base = Path.home() / "Library" / "Application Support" / "syncframe-desktop"
    else:
        base = Path.home() / ".syncframe-desktop"

    base.mkdir(parents=True, exist_ok=True)
    return base
