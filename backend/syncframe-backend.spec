# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
from PyInstaller.utils.hooks import copy_metadata

datas = []
binaries = []
hiddenimports = ['imageio', 'imageio_ffmpeg', 'moviepy', 'moviepy.editor', 'moviepy.video.io.ffmpeg_reader', 'moviepy.video.io.ffmpeg_writer', 'moviepy.audio.io.ffmpeg_audiowriter', 'moviepy.audio.io.AudioFileClip', 'moviepy.video.VideoClip', 'moviepy.audio.AudioClip', 'PIL', 'numpy', 'uvicorn.lifespan.off', 'uvicorn.lifespan.on', 'uvicorn.lifespan', 'uvicorn.protocols.websockets.auto', 'uvicorn.protocols.websockets.wsproto_impl', 'uvicorn.protocols.websockets_impl', 'uvicorn.protocols.http.auto', 'uvicorn.protocols.http.h11_impl', 'uvicorn.protocols.http.httptools_impl', 'uvicorn.protocols.websockets', 'uvicorn.protocols.http', 'uvicorn.protocols', 'uvicorn.loops.auto', 'uvicorn.loops.asyncio', 'uvicorn.loops.uvloop', 'uvicorn.loops', 'uvicorn.logging']
datas += copy_metadata('imageio')
datas += copy_metadata('imageio-ffmpeg')
datas += copy_metadata('moviepy')
datas += copy_metadata('decorator')
datas += copy_metadata('proglog')
from PyInstaller.utils.hooks import collect_data_files

tmp_ret = collect_all('imageio')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('imageio_ffmpeg')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('faster_whisper')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
datas += collect_data_files('faster_whisper')


a = Analysis(
    ['desktop_backend_launcher.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='syncframe-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
