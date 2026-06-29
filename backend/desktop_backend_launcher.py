import uvicorn
import main

if __name__ == "__main__":
    # Passing the app instance directly is safer for PyInstaller bundling
    uvicorn.run(main.app, host="127.0.0.1", port=8000, log_level="info")
