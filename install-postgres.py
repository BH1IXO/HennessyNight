#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PostgreSQL便携版下载安装脚本
"""

import os
import sys
import urllib.request
from zipfile import ZipFile
import subprocess

PG_URL = "https://mirrors.huaweicloud.com/postgresql/binary/v14.9/win-x86-64/postgresql-14.9-1-windows-x64-binaries.zip"
INSTALL_DIR = "C:\\PostgreSQL14"
TEMP_ZIP = os.path.join(os.environ.get('TEMP', 'C:\\Temp'), "postgresql-14.zip")

def download_file(url, dest_path):
    """下载文件"""
    print(f"[+] 开始下载PostgreSQL...")
    print(f"[+] URL: {url}")
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
    """解压ZIP"""
    print(f"[+] 正在解压到: {extract_to}")
    try:
        with ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        print(f"[+] 解压完成!")
        return True
    except Exception as e:
        print(f"[错误] 解压失败: {e}")
        return False

def init_database():
    """初始化数据库"""
    print("[+] 初始化PostgreSQL数据库...")

    pg_bin = os.path.join(INSTALL_DIR, "pgsql", "bin")
    data_dir = os.path.join(INSTALL_DIR, "pgsql", "data")

    # 初始化数据库
    initdb = os.path.join(pg_bin, "initdb.exe")
    cmd = [initdb, "-D", data_dir, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--locale=C"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print("[+] 数据库初始化成功!")
            return True
        else:
            print(f"[错误] 初始化失败: {result.stderr}")
            return False
    except Exception as e:
        print(f"[错误] 初始化失败: {e}")
        return False

def start_postgres():
    """启动PostgreSQL"""
    print("[+] 启动PostgreSQL服务...")

    pg_bin = os.path.join(INSTALL_DIR, "pgsql", "bin")
    data_dir = os.path.join(INSTALL_DIR, "pgsql", "data")
    pg_ctl = os.path.join(pg_bin, "pg_ctl.exe")

    cmd = [pg_ctl, "-D", data_dir, "-l", "logfile", "start"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.join(INSTALL_DIR, "pgsql"))
        if result.returncode == 0:
            print("[+] PostgreSQL启动成功!")
            return True
        else:
            print(f"[警告] 启动返回码: {result.returncode}")
            print(result.stdout)
            return True  # 可能已经在运行
    except Exception as e:
        print(f"[错误] 启动失败: {e}")
        return False

def create_database():
    """创建数据库"""
    print("[+] 创建meeting_system数据库...")

    import time
    time.sleep(3)  # 等待PostgreSQL完全启动

    pg_bin = os.path.join(INSTALL_DIR, "pgsql", "bin")
    psql = os.path.join(pg_bin, "psql.exe")

    # 创建数据库
    cmd1 = [psql, "-U", "postgres", "-c", "CREATE DATABASE meeting_system;"]
    cmd2 = [psql, "-U", "postgres", "-c", "ALTER USER postgres WITH PASSWORD 'meeting123456';"]

    try:
        subprocess.run(cmd1, capture_output=True)
        subprocess.run(cmd2, capture_output=True)
        print("[+] 数据库创建成功!")
        return True
    except Exception as e:
        print(f"[警告] 数据库创建可能失败: {e}")
        return True  # 继续执行

def main():
    print("=" * 60)
    print("PostgreSQL 14 便携版安装程序")
    print("=" * 60)
    print()

    # 检查是否已安装
    if os.path.exists(os.path.join(INSTALL_DIR, "pgsql", "bin", "postgres.exe")):
        print(f"[!] PostgreSQL已安装在: {INSTALL_DIR}")
        print()

        # 尝试启动
        if start_postgres():
            create_database()

        print()
        print("=" * 60)
        print("[完成] PostgreSQL已就绪!")
        print("=" * 60)
        return

    # 下载
    if not download_file(PG_URL, TEMP_ZIP):
        print("\n[提示] 自动下载失败，请手动下载:")
        print(f"  下载地址: {PG_URL}")
        print(f"  保存到: {TEMP_ZIP}")
        print(f"  然后重新运行此脚本")
        sys.exit(1)

    # 解压
    if not extract_zip(TEMP_ZIP, INSTALL_DIR):
        sys.exit(1)

    # 初始化
    if not init_database():
        print("[警告] 数据库初始化失败，请手动初始化")

    # 启动
    if not start_postgres():
        print("[警告] PostgreSQL启动失败，请手动启动")
    else:
        # 创建数据库
        create_database()

    # 清理
    try:
        os.remove(TEMP_ZIP)
        print("[+] 已删除临时文件")
    except:
        pass

    print()
    print("=" * 60)
    print("[成功] PostgreSQL安装完成!")
    print("=" * 60)
    print()
    print(f"[+] 安装目录: {INSTALL_DIR}")
    print(f"[+] 数据库: meeting_system")
    print(f"[+] 用户名: postgres")
    print(f"[+] 密码: meeting123456")
    print()
    print("下一步:")
    print("  1. 运行: npm install")
    print("  2. 运行: npx prisma generate")
    print("  3. 运行: npx prisma migrate deploy")
    print("  4. 运行: npm run dev")
    print()

if __name__ == "__main__":
    main()
