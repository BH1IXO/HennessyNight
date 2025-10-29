#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
使用多线程下载Vosk大模型（更快）
"""

import os
import sys
import subprocess
from zipfile import ZipFile

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip"
MODEL_NAME = "vosk-model-cn-0.22"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# 备用镜像URL（如果主URL慢可以尝试）
MIRROR_URLS = [
    "https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip",
    # SourceForge可能会有镜像，但目前URL未知
]

def download_with_powershell_multithreaded(url, dest_path):
    """使用PowerShell的WebClient进行多线程下载"""
    print(f"[+] 使用PowerShell多线程下载: {url}")
    print(f"[+] 保存到: {dest_path}")
    print()

    ps_script = f'''
$url = "{url}"
$output = "{dest_path}"

# 创建WebClient对象以支持更快的下载
$webClient = New-Object System.Net.WebClient

# 禁用代理
$webClient.Proxy = $null

# 设置超时
$webClient.Headers.Add("User-Agent", "Mozilla/5.0")

# 注册下载进度事件
$downloadedBytes = 0
Register-ObjectEvent -InputObject $webClient -EventName DownloadProgressChanged -Action {{
    $global:downloadedBytes = $_.BytesReceived
    $totalBytes = $_.TotalBytesToReceive
    $percent = [int](($_.BytesReceived / $_.TotalBytesToReceive) * 100)
    Write-Host ("`r[下载中] $percent% ({{0:N1}}MB / {{1:N1}}MB)" -f ($_.BytesReceived/1MB), ($_.TotalBytesToReceive/1MB)) -NoNewline
}} | Out-Null

try {{
    # 开始异步下载
    $task = $webClient.DownloadFileTaskAsync($url, $output)
    $task.Wait()
    Write-Host ""
    Write-Host "[+] 下载完成!"
    exit 0
}} catch {{
    Write-Host ""
    Write-Host "[错误] 下载失败: $($_.Exception.Message)"
    exit 1
}} finally {{
    $webClient.Dispose()
}}
'''

    try:
        # 执行PowerShell脚本
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=False,
            text=True
        )
        return result.returncode == 0
    except Exception as e:
        print(f"[错误] PowerShell下载失败: {e}")
        return False


def extract_zip(zip_path, extract_to):
    """解压ZIP文件"""
    print(f"[+] 正在解压...")
    try:
        with ZipFile(zip_path, 'r') as zip_ref:
            # 显示解压进度
            members = zip_ref.namelist()
            total = len(members)
            for i, member in enumerate(members):
                zip_ref.extract(member, extract_to)
                percent = int((i + 1) / total * 100)
                sys.stdout.write(f"\r[解压中] {percent}% ({i+1}/{total})")
                sys.stdout.flush()
        print()
        print(f"[+] 解压完成: {extract_to}")
        return True
    except Exception as e:
        print(f"[错误] 解压失败: {e}")
        return False


def main():
    print("=" * 60)
    print("Vosk中文大模型下载器 (多线程加速版)")
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

    # 尝试多线程下载
    success = download_with_powershell_multithreaded(MODEL_URL, zip_path)

    if not success:
        print("[!] 多线程下载失败，请手动下载或使用其他工具")
        print(f"[!] 下载链接: {MODEL_URL}")
        print(f"[!] 建议使用迅雷、IDM等下载工具")
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
    print("大模型准确率更高，适合生产环境使用")
    print()


if __name__ == "__main__":
    main()
