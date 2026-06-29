import sys
import os
import multiprocessing

# PyInstaller Mac Subprocess Fix:
# PyInstaller sets DYLD_LIBRARY_PATH which pollutes the environment for system binaries.
# This causes system ffmpeg to hang or crash when moviepy imports and runs try_cmd(['ffmpeg']).
if 'DYLD_LIBRARY_PATH' in os.environ:
    os.environ['DYLD_LIBRARY_PATH_ORIG'] = os.environ['DYLD_LIBRARY_PATH']
    del os.environ['DYLD_LIBRARY_PATH']

print("Starting backend launcher...", flush=True)

try:
    print("Importing uvicorn...", flush=True)
    import uvicorn
    print("Importing main...", flush=True)
    import main
    print("Imports successful.", flush=True)
except Exception as e:
    print(f"Error during imports: {e}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    print("Starting uvicorn...", flush=True)
    try:
        uvicorn.run(main.app, host="127.0.0.1", port=8000, log_level="info")
    except Exception as e:
        print(f"Error starting uvicorn: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
