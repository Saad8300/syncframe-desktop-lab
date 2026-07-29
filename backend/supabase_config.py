"""
supabase_config.py
Resolves the Supabase REST credentials the backend needs for server-side
plan lookup (see auth_helpers.get_plan_id_from_token).

Resolution order, first complete pair wins:

  1. SUPABASE_URL / SUPABASE_ANON_KEY environment variables — lets an
     operator or the Electron main process override without a rebuild.
  2. _supabase_secrets.py — generated at build time by
     generate_supabase_config.py from frontend/.env.local, and bundled into
     the packaged binary. This is what makes the frozen app work; the file
     is gitignored so the key never enters the repo.
  3. frontend/.env.local, parsed directly — dev convenience so
     `python -m uvicorn main:app` behaves like the packaged app with no
     extra setup step.

If none resolve, callers fall back to the "free" plan. That is a safe
default but silently downgrades every paying account, so auth_helpers logs
a loud warning when it happens.
"""

import os
from pathlib import Path
from typing import Dict, Tuple


def _parse_env_file(path: Path) -> Dict[str, str]:
    """Minimal KEY=VALUE parser for .env files (no interpolation)."""
    values: Dict[str, str] = {}
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            values[key.strip()] = val.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def frontend_env_local_path() -> Path:
    """Location of the frontend's .env.local, relative to this file."""
    return Path(__file__).resolve().parent.parent / "frontend" / ".env.local"


def read_from_frontend_env_local() -> Tuple[str, str]:
    """Read the Supabase URL/key straight out of frontend/.env.local."""
    values = _parse_env_file(frontend_env_local_path())
    return (
        values.get("VITE_SUPABASE_URL", ""),
        values.get("VITE_SUPABASE_ANON_KEY", ""),
    )


def get_supabase_config() -> Tuple[str, str]:
    """Returns (url, anon_key); either may be "" if unresolved."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY", "")
    if url and key:
        return url.rstrip("/"), key

    try:
        from _supabase_secrets import SUPABASE_URL, SUPABASE_ANON_KEY  # type: ignore
        if SUPABASE_URL and SUPABASE_ANON_KEY:
            return SUPABASE_URL.rstrip("/"), SUPABASE_ANON_KEY
    except Exception:
        pass

    url, key = read_from_frontend_env_local()
    return url.rstrip("/"), key
