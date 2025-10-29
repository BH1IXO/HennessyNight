#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vosk实时语音识别服务
支持真正的流式实时转录
"""

import sys
import os
import json
import wave
from vosk import Model, KaldiRecognizer

def transcribe_audio_file(audio_path, model_path, language='zh'):
    """
    转录音频文件（支持WAV格式）

    Args:
        audio_path: 音频文件路径
        model_path: Vosk模型路径
        language: 语言代码（zh/en）

    Returns:
        dict: 转录结果
    """
    try:
        # 检查模型路径
        if not os.path.exists(model_path):
            return {
                "success": False,
                "error": f"模型不存在: {model_path}"
            }

        # 加载模型
        model = Model(model_path)

        # 打开音频文件
        wf = wave.open(audio_path, "rb")

        # 检查音频格式
        if wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            return {
                "success": False,
                "error": "音频必须是单声道16位PCM格式"
            }

        sample_rate = wf.getframerate()

        # 创建识别器
        rec = KaldiRecognizer(model, sample_rate)
        rec.SetWords(True)  # 启用词级时间戳

        # 处理音频
        full_text = []
        segments = []

        while True:
            data = wf.readframes(4000)
            if len(data) == 0:
                break

            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if 'text' in result and result['text']:
                    full_text.append(result['text'])

                    # 提取分段信息
                    if 'result' in result:
                        for word_info in result['result']:
                            segments.append({
                                "text": word_info.get('word', ''),
                                "start": word_info.get('start', 0),
                                "end": word_info.get('end', 0),
                                "confidence": word_info.get('conf', 1.0)
                            })

        # 获取最终结果
        final_result = json.loads(rec.FinalResult())
        if 'text' in final_result and final_result['text']:
            full_text.append(final_result['text'])

            if 'result' in final_result:
                for word_info in final_result['result']:
                    segments.append({
                        "text": word_info.get('word', ''),
                        "start": word_info.get('start', 0),
                        "end": word_info.get('end', 0),
                        "confidence": word_info.get('conf', 1.0)
                    })

        wf.close()

        return {
            "success": True,
            "text": " ".join(full_text),
            "segments": segments,
            "language": language
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def transcribe_audio_stream(model_path, language='zh'):
    """
    实时转录音频流（从stdin读取PCM数据）

    Args:
        model_path: Vosk模型路径
        language: 语言代码

    Returns:
        实时输出JSON结果到stdout
    """
    try:
        # 检查模型路径
        if not os.path.exists(model_path):
            print(json.dumps({
                "success": False,
                "error": f"模型不存在: {model_path}"
            }), flush=True)
            return

        # 加载模型
        model = Model(model_path)

        # 创建识别器（假设16kHz采样率）
        rec = KaldiRecognizer(model, 16000)
        rec.SetWords(True)

        print(json.dumps({
            "success": True,
            "status": "ready"
        }), flush=True)

        # 从stdin读取音频数据
        while True:
            data = sys.stdin.buffer.read(4000)
            if len(data) == 0:
                break

            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                if 'text' in result and result['text']:
                    print(json.dumps({
                        "success": True,
                        "type": "partial",
                        "text": result['text'],
                        "result": result.get('result', [])
                    }), flush=True)
            else:
                # 中间结果
                partial = json.loads(rec.PartialResult())
                if 'partial' in partial and partial['partial']:
                    print(json.dumps({
                        "success": True,
                        "type": "interim",
                        "text": partial['partial']
                    }), flush=True)

        # 最终结果
        final = json.loads(rec.FinalResult())
        if 'text' in final and final['text']:
            print(json.dumps({
                "success": True,
                "type": "final",
                "text": final['text'],
                "result": final.get('result', [])
            }), flush=True)

    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }), flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "用法: python vosk_service.py <mode> <model_path> [audio_path] [language]"
        }))
        sys.exit(1)

    mode = sys.argv[1]  # 'file' 或 'stream'
    model_path = sys.argv[2]

    if mode == "file":
        if len(sys.argv) < 4:
            print(json.dumps({
                "success": False,
                "error": "文件模式需要提供音频路径"
            }))
            sys.exit(1)

        audio_path = sys.argv[3]
        language = sys.argv[4] if len(sys.argv) > 4 else 'zh'

        result = transcribe_audio_file(audio_path, model_path, language)
        print(json.dumps(result, ensure_ascii=False))

    elif mode == "stream":
        language = sys.argv[3] if len(sys.argv) > 3 else 'zh'
        transcribe_audio_stream(model_path, language)

    else:
        print(json.dumps({
            "success": False,
            "error": f"未知模式: {mode}"
        }))
        sys.exit(1)
