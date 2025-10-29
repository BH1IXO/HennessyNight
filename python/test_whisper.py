#!/usr/bin/env python3
"""
测试Whisper安装和功能
"""

import sys

print("=" * 60)
print("🧪 Whisper 测试脚本")
print("=" * 60)
print()

# 1. 检查Whisper是否安装
print("📦 检查Whisper安装...")
try:
    import whisper
    print(f"✅ Whisper 已安装")
except ImportError:
    print("❌ Whisper 未安装")
    print()
    print("请运行以下命令安装：")
    print("  pip install openai-whisper")
    sys.exit(1)

print()

# 2. 检查PyTorch
print("📦 检查PyTorch...")
try:
    import torch
    print(f"✅ PyTorch 版本: {torch.__version__}")
    print(f"✅ CUDA 可用: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"✅ CUDA 版本: {torch.version.cuda}")
        print(f"✅ GPU 设备: {torch.cuda.get_device_name(0)}")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"✅ 使用设备: {device}")
except ImportError:
    print("❌ PyTorch 未安装")
    sys.exit(1)

print()

# 3. 测试模型加载
print("🔧 测试模型加载...")
print("ℹ️  首次运行会下载模型（约150MB），请耐心等待...")
print()

try:
    # 加载最小的模型进行测试
    print("正在加载 tiny 模型（用于快速测试）...")
    model = whisper.load_model("tiny")
    print("✅ 模型加载成功")
except Exception as e:
    print(f"❌ 模型加载失败: {e}")
    sys.exit(1)

print()

# 4. 可用模型列表
print("📋 可用的模型:")
print("  - tiny   : 最快，准确率较低 (~75MB)")
print("  - base   : 平衡选择 ⭐ 推荐 (~150MB)")
print("  - small  : 更准确 (~500MB)")
print("  - medium : 高准确率 (~1.5GB)")
print("  - large  : 最高准确率 (~3GB)")
print()

# 5. 测试转录（如果有测试音频）
print("🎤 测试转录功能...")
print("ℹ️  如果要测试实际转录，请准备一个音频文件")
print()

# 总结
print("=" * 60)
print("✅ 测试完成！")
print("=" * 60)
print()
print("下一步：")
print("  1. 配置 .env 文件：")
print("     TRANSCRIPTION_PROVIDER=whisper")
print("     WHISPER_MODEL=base")
print()
print("  2. 启动服务器：")
print("     npm run dev")
print()
print("  3. 测试转录API：")
print("     curl -X POST http://localhost:3000/api/v1/audio/upload")
print()
print("=" * 60)
