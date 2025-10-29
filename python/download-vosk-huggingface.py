#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从HuggingFace下载Vosk大模型（更快）
"""

import os
import sys
import urllib.request
from zipfile import ZipFile

# HuggingFace镜像 - 通常比官网快
MODEL_URL = "https://huggingface.co/rhasspy/vosk-models/resolve/main/zh/vosk-model-cn-0.22.zip"
MODEL_NAME = "vosk-model-cn-0.22"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

def download_file(url, dest_path):
    """下载文件"""
    print(f"[+] 开始下载: {url}")
    print(f"[+] 保存到: {dest_path}")
    print()

    # 禁用代理
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    urllib.request.install_opener(opener)

    try:
        def reporthook(count, block_size, total_size):
            percent = int(count * block_size * 100 / total_size)
            downloaded = count * block_size / (1024 * 1024)
            total = total_size / (1024 * 1024)
            sys.stdout.write(f"\r[下载中] {percent}% ({downloaded:.1f}MB / {total:.1f}MB)")
            sys.stdout.flush()

        urllib.request.urlretrieve(url, dest_path, reporthook)
        print()
        print("[+] 下载完成!")
        return True

    except Exception as e:
        print(f"\n[错误] 下载失败: {e}")
        return False

def extract_zip(zip_path, extract_to):
    """解压ZIP文件"""
    print(f"[+] 正在解压...")
    try:
        with ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        print(f"[+] 解压完成: {extract_to}")
        return True
    except Exception as e:
        print(f"[错误] 解压失败: {e}")
        return False

def main():
    print("=" * 60)
    print("Vosk中文大模型下载器 (HuggingFace镜像 - 更快)")
    print("=" * 60)
    print()

    # 创建目录
    if not os.path.exists(MODELS_DIR):
        os.makedirs(MODELS_DIR)
        print(f"[+] 创建目录: {MODELS_DIR}")

    model_dir = os.path.join(MODELS_DIR, MODEL_NAME)

    # 检查是否已存在
    if os.path.exists(model_dir):
        print(f"[!] 模型已存在: {model_dir}")
        print()
        print("如需重新下载，请先删除该目录")
        return

    # 下载
    zip_path = os.path.join(MODELS_DIR, f"{MODEL_NAME}.zip")

    if not download_file(MODEL_URL, zip_path):
        sys.exit(1)

    # 解压
    if not extract_zip(zip_path, MODELS_DIR):
        sys.exit(1)

    # 删除zip
    try:
        os.remove(zip_path)
        print("[+] 已删除临时ZIP文件")
    except:
        pass

    print()
    print("=" * 60)
    print("[成功] Vosk中文大模型安装完成!")
    print("=" * 60)
    print()
    print(f"[+] 模型路径: {model_dir}")
    print()
    print("大模型准确率更高，适合服务器端处理")
    print()

if __name__ == "__main__":
    main()
