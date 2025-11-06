#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
批量修复 pyannote.audio 与 torchaudio 2.9+ 的兼容性问题
"""
import os
import re

BASE_DIR = r"C:\Users\liu.tao9\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\LocalCache\local-packages\Python313\site-packages"

fixes = [
    # 1. Fix torchaudio.set_audio_backend in io.py
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "core", "io.py"),
        "find": 'torchaudio.set_audio_backend("soundfile")',
        "replace": '# torchaudio.set_audio_backend("soundfile")  # Commented out: removed in torchaudio 2.9+'
    },
    # 2. Fix np.NaN in inference.py
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "core", "inference.py"),
        "find": "missing: float = np.NaN,",
        "replace": "missing: float = np.nan,"
    },
    # 3. Fix use_auth_token -> token in pipeline.py
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "core", "pipeline.py"),
        "find": "                    use_auth_token=use_auth_token,  # Changed from use_auth_token to token for huggingface_hub 1.0+",
        "replace": "                    token=use_auth_token,  # Changed from use_auth_token to token for huggingface_hub 1.0+"
    },
    # 4. Fix backend in speaker_verification.py
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "pipelines", "speaker_verification.py"),
        "find": "backend = torchaudio.get_audio_backend()",
        "replace": "# backend = torchaudio.get_audio_backend()  # Commented out: removed in torchaudio 2.9+"
    },
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "pipelines", "speaker_verification.py"),
        "find": "    torchaudio.set_audio_backend(backend)",
        "replace": "    pass  # torchaudio.set_audio_backend(backend)  # Commented out: removed in torchaudio 2.9+"
    },
    # 5. Fix list_audio_backends in torch_audio_backend.py
    {
        "file": os.path.join(BASE_DIR, "speechbrain", "utils", "torch_audio_backend.py"),
        "find": """    elif torchaudio_major >= 2 and torchaudio_minor >= 1:
        available_backends = torchaudio.list_audio_backends()

        if len(available_backends) == 0:
            logger.warning(
                "SpeechBrain could not find any working torchaudio backend. Audio files may fail to load. Follow this link for instructions and troubleshooting: https://speechbrain.readthedocs.io/en/latest/audioloading.html"
            )""",
        "replace": """    elif torchaudio_major >= 2 and torchaudio_minor >= 1:
        # Note: torchaudio.list_audio_backends() was removed in torchaudio 2.9+
        # Backend checking is no longer necessary as torchaudio auto-detects backends
        pass
        # available_backends = torchaudio.list_audio_backends()
        # if len(available_backends) == 0:
        #     logger.warning(
        #         "SpeechBrain could not find any working torchaudio backend. Audio files may fail to load. Follow this link for instructions and troubleshooting: https://speechbrain.readthedocs.io/en/latest/audioloading.html"
        #     )"""
    },
    {
        "file": os.path.join(BASE_DIR, "speechbrain", "utils", "torch_audio_backend.py"),
        "find": """        raise ValueError(
            f"backend must be one of {allowed_backends}",
            "Available backends on your system: ",
            torchaudio.list_audio_backends(),
        )""",
        "replace": """        raise ValueError(
            f"backend must be one of {allowed_backends}",
            # Note: torchaudio.list_audio_backends() was removed in torchaudio 2.9+
        )"""
    },
    # 6. Fix backend parameter in speechbrain dataio.py - use regex
    {
        "file": os.path.join(BASE_DIR, "speechbrain", "dataio", "dataio.py"),
        "pattern": r", backend=backend",
        "replace": ""
    },
    # 7. Fix AudioMetaData import in mixins.py
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "tasks", "segmentation", "mixins.py"),
        "find": "from torchaudio.backend.common import AudioMetaData",
        "replace": """# Note: torchaudio.backend was removed in torchaudio 2.9+
# AudioMetaData is no longer exposed - we'll use torchaudio.info() return type
try:
    from torchaudio.backend.common import AudioMetaData
except (ImportError, ModuleNotFoundError):
    # For torchaudio 2.9+, AudioMetaData is not directly importable
    # Use Any for type hints or create a simple placeholder
    from typing import Any as AudioMetaData"""
    },
    # 8. Fix use_auth_token in model.py and inference.py - use regex
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "core", "model.py"),
        "pattern": r"use_auth_token=use_auth_token,",
        "replace": "token=use_auth_token,"
    },
    {
        "file": os.path.join(BASE_DIR, "pyannote", "audio", "core", "inference.py"),
        "pattern": r"use_auth_token=use_auth_token,",
        "replace": "token=use_auth_token,"
    },
]

def apply_fix(fix):
    file_path = fix["file"]
    if not os.path.exists(file_path):
        print(f"⚠️  文件不存在: {file_path}")
        return False

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    if "pattern" in fix:
        # Use regex replacement
        new_content = re.sub(fix["pattern"], fix["replace"], content)
    else:
        # Simple string replacement
        if fix["find"] not in content:
            print(f"⚠️  未找到目标字符串: {os.path.basename(file_path)}")
            return False
        new_content = content.replace(fix["find"], fix["replace"])

    if new_content != content:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"✅ 已修复: {os.path.basename(file_path)}")
        return True
    else:
        print(f"ℹ️  无需修改: {os.path.basename(file_path)}")
        return False

print("=" * 60)
print("开始批量修复 pyannote.audio 兼容性问题...")
print("=" * 60)

success_count = 0
for i, fix in enumerate(fixes, 1):
    print(f"\n[{i}/{len(fixes)}] 处理: {os.path.basename(fix['file'])}")
    if apply_fix(fix):
        success_count += 1

print("\n" + "=" * 60)
print(f"修复完成! 成功: {success_count}/{len(fixes)}")
print("=" * 60)
