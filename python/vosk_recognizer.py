#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vosk 实时语音识别服务
支持流式音频识别和断句
"""

import sys
import json
import wave
import os
import io
from vosk import Model, KaldiRecognizer

# 设置 stdout 使用 UTF-8 编码（Windows 兼容）
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 模型路径（使用大模型以提高准确率）
MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "vosk-model-cn-0.22")

# 初始化模型
print(f"[+] 正在加载Vosk模型: {MODEL_PATH}", file=sys.stderr)
if not os.path.exists(MODEL_PATH):
    print(f"[ERROR] 模型不存在: {MODEL_PATH}", file=sys.stderr)
    sys.exit(1)

model = Model(MODEL_PATH)
print("[+] 模型加载成功", file=sys.stderr)


def recognize_from_file(audio_file, sample_rate=16000):
    """
    从音频文件识别
    """
    rec = KaldiRecognizer(model, sample_rate)
    rec.SetWords(True)  # 启用词级别的时间戳

    results = []

    try:
        with wave.open(audio_file, "rb") as wf:
            # 检查音频格式
            if wf.getnchannels() != 1:
                print("[ERROR] 音频必须是单声道", file=sys.stderr)
                return {"error": "Audio must be mono"}

            if wf.getsampwidth() != 2:
                print("[ERROR] 音频必须是16位", file=sys.stderr)
                return {"error": "Audio must be 16-bit"}

            # 逐块读取音频数据
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break

                if rec.AcceptWaveform(data):
                    # 完整的句子识别完成
                    result = json.loads(rec.Result())
                    if result.get("text"):
                        results.append({
                            "type": "final",
                            "text": result["text"],
                            "words": result.get("result", [])
                        })
                        # 实时输出
                        print(json.dumps({"type": "final", "text": result["text"]}, ensure_ascii=False))

            # 获取最后的部分结果
            final_result = json.loads(rec.FinalResult())
            if final_result.get("text"):
                results.append({
                    "type": "final",
                    "text": final_result["text"],
                    "words": final_result.get("result", [])
                })
                print(json.dumps({"type": "final", "text": final_result["text"]}, ensure_ascii=False))

        return {"success": True, "results": results}

    except Exception as e:
        print(f"[ERROR] 识别失败: {str(e)}", file=sys.stderr)
        return {"error": str(e)}


def recognize_from_stream(sample_rate=16000):
    """
    从标准输入流识别（用于实时音频流）
    """
    rec = KaldiRecognizer(model, sample_rate)
    rec.SetWords(True)

    print("[+] 开始流式识别，等待音频数据...", file=sys.stderr)

    try:
        while True:
            # 从标准输入读取音频数据 (4000字节 = 0.125秒的16kHz音频)
            data = sys.stdin.buffer.read(4000)

            if len(data) == 0:
                break

            if rec.AcceptWaveform(data):
                # 识别到完整句子
                result = json.loads(rec.Result())
                if result.get("text"):
                    output = {
                        "type": "final",
                        "text": result["text"],
                        "words": result.get("result", [])
                    }
                    print(json.dumps(output, ensure_ascii=False), flush=True)
            else:
                # 部分识别结果（实时显示）
                partial = json.loads(rec.PartialResult())
                if partial.get("partial"):
                    output = {
                        "type": "partial",
                        "text": partial["partial"]
                    }
                    print(json.dumps(output, ensure_ascii=False), flush=True)

        # 处理最后的结果
        final = json.loads(rec.FinalResult())
        if final.get("text"):
            output = {
                "type": "final",
                "text": final["text"]
            }
            print(json.dumps(output, ensure_ascii=False), flush=True)

    except KeyboardInterrupt:
        print("[+] 识别已停止", file=sys.stderr)
    except Exception as e:
        print(f"[ERROR] {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python vosk_recognizer.py <mode> [audio_file]", file=sys.stderr)
        print("  mode: stream (流式) 或 file (文件)", file=sys.stderr)
        print("  audio_file: 当mode=file时必须提供", file=sys.stderr)
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "stream":
        recognize_from_stream()
    elif mode == "file":
        if len(sys.argv) < 3:
            print("[ERROR] 文件模式需要提供音频文件路径", file=sys.stderr)
            sys.exit(1)

        audio_file = sys.argv[2]
        if not os.path.exists(audio_file):
            print(f"[ERROR] 文件不存在: {audio_file}", file=sys.stderr)
            sys.exit(1)

        result = recognize_from_file(audio_file)
        if "error" in result:
            sys.exit(1)
    else:
        print(f"[ERROR] 未知模式: {mode}", file=sys.stderr)
        sys.exit(1)
