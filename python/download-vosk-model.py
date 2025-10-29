#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vosk模型下载脚本
自动下载并解压Vosk中文小模型（约50MB）
"""

import os
import sys
import requests
from zipfile import ZipFile
from tqdm import tqdm

# Vosk中文小模型（适合开发测试）
MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip"
MODEL_NAME = "vosk-model-small-cn-0.22"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

def download_file(url, dest_path):
    """下载文件并显示进度条"""
    print(f"[+] Starting download: {url}")

    response = requests.get(url, stream=True)
    total_size = int(response.headers.get('content-length', 0))

    with open(dest_path, 'wb') as file, tqdm(
        desc="下载进度",
        total=total_size,
        unit='B',
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for data in response.iter_content(chunk_size=1024):
            size = file.write(data)
            bar.update(size)

    print(f"[+] Download complete: {dest_path}")


def extract_zip(zip_path, extract_to):
    """解压ZIP文件"""
    print(f"[+] Extracting...")
    with ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(extract_to)
    print(f"[+] Extraction complete: {extract_to}")


def main():
    print("=" * 60)
    print("Vosk Chinese Model Downloader")
    print("=" * 60)
    print()

    # 创建models目录
    if not os.path.exists(MODELS_DIR):
        os.makedirs(MODELS_DIR)
        print(f"[+] Created directory: {MODELS_DIR}")

    model_dir = os.path.join(MODELS_DIR, MODEL_NAME)

    # 检查模型是否已存在
    if os.path.exists(model_dir):
        print(f"[!] Model already exists: {model_dir}")
        response = input("Re-download? (y/N): ")
        if response.lower() != 'y':
            print("Skipping download")
            print()
            print(f"[+] Model path: {model_dir}")
            return
        else:
            # 删除旧模型
            import shutil
            shutil.rmtree(model_dir)
            print("[+] Removed old model")

    # 下载模型
    zip_path = os.path.join(MODELS_DIR, f"{MODEL_NAME}.zip")

    try:
        download_file(MODEL_URL, zip_path)

        # 解压模型
        extract_zip(zip_path, MODELS_DIR)

        # 删除zip文件
        os.remove(zip_path)
        print(f"[+] Removed ZIP file")

        print()
        print("=" * 60)
        print("[SUCCESS] Vosk Chinese model installed!")
        print("=" * 60)
        print()
        print(f"[+] Model path: {model_dir}")
        print()
        print("Next steps:")
        print("1. Configure .env file:")
        print(f"   VOSK_MODEL_PATH={model_dir}")
        print()
        print("2. Restart server to test realtime transcription")
        print()

    except Exception as e:
        print(f"[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
