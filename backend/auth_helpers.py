# backend/auth_helpers.py
# Preparatory auth helpers for Supabase JWT verification.
# These functions are NOT yet enforced on any endpoint.
# Real enforcement begins in Batch 21G — Tool Lock System.

import os
from typing import Optional

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
