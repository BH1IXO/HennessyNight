#!/usr/bin/env python3
"""
FunASR语音识别服务
支持实时流式识别 + VAD自动断句 + 标点预测
"""

import sys
import json
import os
import io
import wave
import numpy as np
from pathlib import Path

def init_model(mode='2pass', device='cpu'):
    """
    初始化FunASR模型

    Args:
        mode: 识别模式 ('realtime', 'offline', '2pass')
        device: 运行设备 ('cpu', 'cuda')

    Returns:
        pipeline: FunASR识别管道
    """
    try:
        from funasr import AutoModel

        print(f"[FunASR] 正在加载模型 (mode={mode}, device={device})...", file=sys.stderr)

        if mode == 'realtime' or mode == '2pass':
            # 实时流式模型
            model_name = "paraformer-zh-streaming"
        else:
            # 离线高精度模型
            model_name = "paraformer-zh"

        # 创建识别管道
        pipeline = AutoModel(
            model=model_name,
            vad_model="fsmn-vad",           # VAD自动断句
            punc_model="ct-punc",           # 标点预测
            # spk_model="cam++",            # 可选：说话人识别
            device=device,
            ncpu=4,                         # CPU线程数
            disable_update=True             # 禁用自动更新
        )

        print(f"[FunASR] ✅ 模型加载成功: {model_name}", file=sys.stderr)
        return pipeline

    except ImportError as e:
        print(f"[FunASR] ❌ 错误: FunASR未安装", file=sys.stderr)
        print(f"[FunASR] 请运行: pip install funasr modelscope", file=sys.stderr)
        raise
    except Exception as e:
        print(f"[FunASR] ❌ 模型加载失败: {e}", file=sys.stderr)
        raise


def transcribe_file(audio_path, language='zh', mode='2pass', device='cpu'):
    """
    转录音频文件

    Args:
        audio_path: 音频文件路径
        language: 语言代码 (zh, en)
        mode: 识别模式
        device: 运行设备

    Returns:
        dict: 转录结果
    """
    print(f"[FunASR] 开始转录: {audio_path}", file=sys.stderr)

    try:
        # 初始化模型
        pipeline = init_model(mode=mode, device=device)

        # 执行识别
        print(f"[FunASR] 正在识别...", file=sys.stderr)
        result = pipeline.generate(
            input=audio_path,
            batch_size=1,
            language=language,
            use_itn=True  # 逆文本归一化 (数字转阿拉伯数字等)
        )

        # 解析结果
        if isinstance(result, list) and len(result) > 0:
            result = result[0]

        # 提取文本
        text = result.get('text', '')

        # 提取时间戳
        timestamp = result.get('timestamp', [])
        sentences = result.get('sentences', [])

        # 构建分段信息
        segments = []
        if timestamp:
            for item in timestamp:
                segments.append({
                    'text': item[0],
                    'start': float(item[1]) / 1000,  # ms转秒
                    'end': float(item[2]) / 1000,
                    'confidence': 1.0
                })

        # 如果有句子级别的时间戳
        sentence_segments = []
        if sentences:
            for sent in sentences:
                sentence_segments.append({
                    'text': sent.get('text', ''),
                    'start': float(sent.get('start', 0)) / 1000,
                    'end': float(sent.get('end', 0)) / 1000
                })

        print(f"[FunASR] ✅ 识别完成: {len(text)} 字", file=sys.stderr)

        return {
            'success': True,
            'text': text,
            'language': language,
            'segments': segments,
            'sentences': sentence_segments,
            'mode': mode
        }

    except Exception as e:
        print(f"[FunASR] ❌ 识别失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def transcribe_realtime_stream():
    """
    实时流式识别 (从stdin读取音频数据)
    """
    print("[FunASR] 启动实时流式识别模式...", file=sys.stderr)

    try:
        # 初始化模型
        pipeline = init_model(mode='realtime', device='cpu')

        print("[FunASR] ✅ 实时识别已就绪，等待音频流...", file=sys.stderr)

        # 音频缓冲区
        audio_buffer = []
        chunk_size = 1600  # 100ms @ 16kHz (16000 * 0.1)

        # 从stdin读取PCM数据
        while True:
            # 读取音频块
            chunk = sys.stdin.buffer.read(chunk_size * 2)  # 16bit = 2 bytes

            if len(chunk) == 0:
                # 流结束，处理剩余数据
                if audio_buffer:
                    result = pipeline.generate(
                        input=np.array(audio_buffer),
                        is_final=True
                    )
                    output_result(result, is_final=True)
                break

            # 转换为numpy数组
            audio_data = np.frombuffer(chunk, dtype=np.int16)
            audio_buffer.extend(audio_data.tolist())

            # 每隔一段时间处理一次 (例如每秒)
            if len(audio_buffer) >= 16000:  # 1秒
                result = pipeline.generate(
                    input=np.array(audio_buffer),
                    is_final=False
                )
                output_result(result, is_final=False)

                # 保留部分重叠数据
                audio_buffer = audio_buffer[-1600:]  # 保留100ms重叠

        print("[FunASR] ✅ 实时识别结束", file=sys.stderr)

    except Exception as e:
        print(f"[FunASR] ❌ 实时识别错误: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)


def output_result(result, is_final=False):
    """输出识别结果 (JSON格式)"""
    if isinstance(result, list) and len(result) > 0:
        result = result[0]

    text = result.get('text', '')
    if not text:
        return

    output = {
        'success': True,
        'type': 'final' if is_final else 'partial',
        'text': text,
        'timestamp': result.get('timestamp', [])
    }

    # 输出到stdout
    print(json.dumps(output, ensure_ascii=False), flush=True)


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python funasr_service.py <mode> [args]'
        }))
        sys.exit(1)

    mode = sys.argv[1]

    try:
        if mode == 'file':
            # 文件转录模式
            if len(sys.argv) < 3:
                print(json.dumps({
                    'success': False,
                    'error': 'Usage: python funasr_service.py file <audio_file> [language] [mode]'
                }))
                sys.exit(1)

            audio_file = sys.argv[2]
            language = sys.argv[3] if len(sys.argv) > 3 else 'zh'
            recog_mode = sys.argv[4] if len(sys.argv) > 4 else '2pass'
            device = sys.argv[5] if len(sys.argv) > 5 else 'cpu'

            result = transcribe_file(audio_file, language, recog_mode, device)
            print(json.dumps(result, ensure_ascii=False))

        elif mode == 'stream':
            # 实时流式模式
            transcribe_realtime_stream()

        elif mode == 'test':
            # 测试模式
            print("[FunASR] 正在测试环境...", file=sys.stderr)
            from funasr import AutoModel
            print(json.dumps({
                'success': True,
                'message': 'FunASR环境正常'
            }))

        else:
            print(json.dumps({
                'success': False,
                'error': f'Unknown mode: {mode}'
            }))
            sys.exit(1)

    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }), file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
