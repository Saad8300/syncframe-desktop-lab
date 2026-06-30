import os
from plan_limits import PLANS, CREDIT_COSTS

def check_access(user_id: str, plan_id: str, tool: str, options: dict, credits_available: float = 0):
    """
    Placeholder access control for backend.
    In the future, this should fetch actual plan and credits from Supabase
    using the provided user_id, rather than relying on client-provided info.
    """
    
    plan = PLANS.get(plan_id, PLANS["free"])
    limits = plan["limits"]
    
    is_batch = options.get("is_batch", False)
    if is_batch and not limits.get("batch_enabled"):
        return {"allowed": False, "reason": f"Batch Video Generator is not available on the {plan['display_name']} plan."}
        
    is_n8n = options.get("is_n8n", False)
    if is_n8n and not limits.get("n8n_enabled"):
        return {"allowed": False, "reason": f"n8n Webhook Automations are not available on the {plan['display_name']} plan."}
        
    is_premium_template = options.get("is_premium_template", False)
    if is_premium_template and not limits.get("premium_templates"):
        return {"allowed": False, "reason": f"Premium templates are not available on the {plan['display_name']} plan."}
        
    dur = options.get("duration_seconds", 0)
    
    if tool in ["video_export", "batch_video"]:
        if dur > limits.get("max_video_length", 60):
            return {"allowed": False, "reason": f"Video length exceeds your plan limit ({limits['max_video_length']}s)."}
            
        res_map = {"720p": 720, "1080p": 1080, "2K": 1440, "4K": 2160}
        req_res = res_map.get(options.get("resolution", "720p"), 720)
        limit_res = res_map.get(limits.get("max_resolution", "720p"), 720)
        
        if req_res > limit_res:
            return {"allowed": False, "reason": f"Resolution {options.get('resolution')} exceeds your plan limit ({limits['max_resolution']})."}
            
    elif tool == "audio_merger":
        if dur > limits.get("max_audio_length", 60):
            return {"allowed": False, "reason": f"Audio length exceeds your plan limit ({limits['max_audio_length']}s)."}
            
    elif tool == "script_timestamp":
        if dur > limits.get("max_timestamp_length", 60):
            return {"allowed": False, "reason": f"Script duration exceeds your plan limit ({limits['max_timestamp_length']}s)."}
            
    # Estimated credits checking can happen here if needed.
    
    return {"allowed": True, "reason": "OK"}
