#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试 pyannote.audio 安装和配置
"""

import os
import sys

# 设置 HuggingFace Token (从环境变量获取)
if 'HUGGINGFACE_TOKEN' not in os.environ:
    print("错误: 请设置 HUGGINGFACE_TOKEN 环境变量")
    sys.exit(1)

print("=" * 60)
print("测试 pyannote.audio 安装")
print("=" * 60)

# 1. 测试导入
print("\n[1/3] 测试导入 pyannote.audio...")
try:
    from pyannote.audio import Pipeline
    print("导入成功")
except Exception as e:
    print(f"导入失败: {e}")
    sys.exit(1)

# 2. 测试模型下载
print("\n[2/3] 测试下载 speaker-diarization 模型...")
print("提示: 首次下载模型需要几分钟,请耐心等待...")
try:
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        use_auth_token=os.environ['HUGGINGFACE_TOKEN']
    )
    print("模型下载/加载成功")
except Exception as e:
    print(f"模型加载失败: {e}")
    sys.exit(1)

# 3. 测试 embedding 模型（可选，speaker-diarization已包含embedding）
print("\n[3/3] 测试 embedding 模型（可选）...")
try:
    from pyannote.audio import Inference
    # 尝试加载独立的embedding模型
    embedding_model = Inference(
        "pyannote/embedding",
        use_auth_token=os.environ['HUGGINGFACE_TOKEN']
    )
    print("Embedding 模型加载成功")
except Exception as e:
    print(f"注意: 独立Embedding 模型加载失败: {e}")
    print("这不影响使用，因为 speaker-diarization pipeline 已包含 embedding 功能")

print("\n" + "=" * 60)
print("pyannote.audio 配置成功!")
print("=" * 60)
print("\n提示:")
print("- 模型已缓存到本地,下次使用会更快")
print("- 现在可以使用实时声纹识别功能了")
print("- 上传包含多人对话的音频文件进行测试")
