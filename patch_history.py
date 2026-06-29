import os

def patch_main_py():
    with open("backend/main.py", "r") as f:
        content = f.read()

    # The string we want to replace
    old_call = """                                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None
                            )"""
                            
    # Replacement
    new_call = """                                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None,
                                metadata={
                                    "text_overlay_enabled": str(text_overlay_enabled).strip().lower() == "true",
                                    "text_overlay_mode": text_overlay_mode
                                }
                            )"""

    content = content.replace(old_call, new_call)
    
    with open("backend/main.py", "w") as f:
        f.write(content)

def patch_batch_queue_runner():
    with open("backend/batch_queue_runner.py", "r") as f:
        content = f.read()

    # old history call in batch_queue_runner
    old_call = """            history_store.add_history(
                tool=source_tool,
                tool_label=job.get("source_tool_label", "Batch Job"),
                output_name=output_filename,
                output_type="video",
                output_url=f"/outputs/{output_filename}",
                file_extension="mp4",
                duration_seconds=res.get("duration", 0),
                resolution=config.get("export_resolution", "1080p"),
                aspect_ratio=config.get("aspect_ratio", "16:9"),
                render_profile=config.get("render_profile", "balanced"),
                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None
            )"""
            
    new_call = """            history_store.add_history(
                tool=source_tool,
                tool_label=job.get("source_tool_label", "Batch Job"),
                output_name=output_filename,
                output_type="video",
                output_url=f"/outputs/{output_filename}",
                file_extension="mp4",
                duration_seconds=res.get("duration", 0),
                resolution=config.get("export_resolution", "1080p"),
                aspect_ratio=config.get("aspect_ratio", "16:9"),
                render_profile=config.get("render_profile", "balanced"),
                file_size_bytes=os.path.getsize(output_path) if os.path.exists(output_path) else None,
                metadata={
                    "text_overlay_enabled": str(config.get("text_overlay_enabled", "false")).strip().lower() == "true",
                    "text_overlay_mode": config.get("text_overlay_mode", "whole_video")
                }
            )"""
            
    content = content.replace(old_call, new_call)
    
    with open("backend/batch_queue_runner.py", "w") as f:
        f.write(content)

patch_main_py()
patch_batch_queue_runner()
print("Successfully patched main.py and batch_queue_runner.py")
