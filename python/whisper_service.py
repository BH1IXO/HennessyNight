#!/usr/bin/env python3
"""
Whisper语音识别服务
使用OpenAI的Whisper模型进行语音转文字
"""

import whisper
import sys
import json
import warnings

# 忽略警告
warnings.filterwarnings("ignore")

def transcribe_audio(audio_path, language='zh', model_size='base'):
    """
    转录音频文件

    参数：
        audio_path: 音频文件路径
        language: 语言代码（zh=中文, en=英文）
        model_size: 模型大小（tiny, base, small, medium, large）
    """
    try:
        print(f"正在加载 {model_size} 模型...", file=sys.stderr)

        # 加载模型
        model = whisper.load_model(model_size)

        print(f"正在转录音频: {audio_path}", file=sys.stderr)

        # 转录参数
        options = {
            "language": language,
            "verbose": False,
            "fp16": False  # CPU模式不使用fp16
        }

        # 执行转录
        result = model.transcribe(audio_path, **options)

        # 构建返回结果
        output = {
            "success": True,
            "text": result["text"].strip(),
            "language": result.get("language", language),
            "segments": []
        }

        # 添加分段信息
        for seg in result["segments"]:
            output["segments"].append({
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "text": seg["text"].strip()
            })

        print("✅ 转录完成", file=sys.stderr)
        return output

    except FileNotFoundError:
        return {
            "success": False,
            "error": f"音频文件不存在: {audio_path}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"转录失败: {str(e)}"
        }

def main():
    """主函数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "用法: python whisper_service.py <音频文件路径> [语言] [模型大小]"
        }))
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "zh"
    model_size = sys.argv[3] if len(sys.argv) > 3 else "base"

    # 执行转录
    result = transcribe_audio(audio_path, language, model_size)

    # 输出JSON结果
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # 返回状态码
    sys.exit(0 if result["success"] else 1)

if __name__ == "__main__":
    main()
