# backend/auth_helpers.py
# Preparatory auth helpers for Supabase JWT verification.
# These functions are NOT yet enforced on any endpoint.
# Real enforcement begins in Batch 21G — Tool Lock System.

import os
from typing import Optional

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# ---------------------------------------------------------------------------
# Placeholder — Supabase JWT verification
# ---------------------------------------------------------------------------
# In future batches, install: pip install python-jose httpx
# And set the Supabase project JWT secret via environment variable:
#   SUPABASE_JWT_SECRET=<your-project-jwt-secret>
# This is NOT the service role key. It's the JWT secret found in:
#   Supabase Dashboard > Settings > API > JWT Settings
# ---------------------------------------------------------------------------

def verify_supabase_jwt(token: str) -> Optional[dict]:
    """
    Placeholder: verify a Supabase JWT token and return its payload.
    
    NOT ENFORCED YET — implement fully in Batch 21G.
    
    Future implementation will:
    1. Decode and verify the JWT signature using SUPABASE_JWT_SECRET.
    2. Validate expiry (exp), issuer (iss), and audience (aud).
    3. Return the decoded payload dict on success.
    4. Return None (or raise) on invalid/expired tokens.
    
    Args:
        token: The Bearer JWT token from the Authorization header.
    
    Returns:
        Decoded payload dict if valid, None otherwise.
    """
    # TODO (Batch 21G): Implement with python-jose
    # from jose import jwt, JWTError
    # secret = os.environ.get("SUPABASE_JWT_SECRET")
    # if not secret:
    #     return None
    # try:
    #     payload = jwt.decode(token, secret, algorithms=["HS256"],
    #                          audience="authenticated")
    #     return payload
    # except JWTError:
    #     return None
    return None  # No-op until Batch 21G


def get_current_user_id(authorization_header: Optional[str]) -> Optional[str]:
    """
    Extract and verify user ID from an Authorization: Bearer <token> header.
    
    NOT ENFORCED YET — implement fully in Batch 21G.
    
    Args:
        authorization_header: The raw Authorization header value.
    
    Returns:
        User UUID string if token is valid, None otherwise.
    """
    # TODO (Batch 21G): wire to verify_supabase_jwt
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header.removeprefix("Bearer ").strip()
    payload = verify_supabase_jwt(token)
    if payload:
        return payload.get("sub")
    return None


# ---------------------------------------------------------------------------
# Real, enforced — server-side plan lookup by token forwarding
# ---------------------------------------------------------------------------
# Rather than verifying the JWT signature ourselves (no secret management on
# this locally-installed backend — see risk note below), we forward the
# caller's own access token to Supabase's REST API and let Supabase verify
# it and the existing RLS policy ("Users can view own subscription" ON
# public.subscriptions USING auth.uid() = user_id) scope the result to the
# real authenticated user. This gives a tamper-proof plan_id without this
# backend ever holding a service-role key: this app ships as an installed
# desktop binary, and a service-role key bundled into it would be
# extractable by any user, granting full bypass of RLS on every account.

def extract_bearer_token(authorization_header: Optional[str]) -> Optional[str]:
    """Pull the raw token out of an 'Authorization: Bearer <token>' header."""
    if not authorization_header or not authorization_header.startswith("Bearer "):
        return None
    token = authorization_header.removeprefix("Bearer ").strip()
    return token or None


def get_plan_id_from_token(access_token: Optional[str]) -> str:
    """
    Resolve the caller's real plan_id server-side by forwarding their
    Supabase access token to the subscriptions REST endpoint. Falls back to
    "free" on a missing token, network failure, or no subscription row —
    mirroring BillingProvider.tsx's client-side fallback behavior.
    """
    if not access_token or not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return "free"

    try:
        resp = requests.get(
            f"{SUPABASE_URL}/rest/v1/subscriptions",
            params={"select": "plan_id", "limit": "1"},
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {access_token}",
            },
            timeout=5,
        )
        if resp.status_code != 200:
            return "free"
        rows = resp.json()
        if not rows:
            return "free"
        return rows[0].get("plan_id") or "free"
    except requests.RequestException:
        return "free"
