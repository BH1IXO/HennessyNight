#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
音频文件转录 + 多说话人识别
使用FunASR进行语音识别,WeSpeaker进行说话人识别
"""

import sys
import json
import os
import numpy as np
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# 设置标准输出为UTF-8编码
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 导入服务
import funasr_service
import wespeaker_service


def transcribe_with_speaker_identification(audio_path, reference_embeddings_json,
                                           threshold=0.40, model_type='chinese', device='cpu'):
    """
    转录音频文件并识别说话人

    Args:
        audio_path: 音频文件路径
        reference_embeddings_json: 参考声纹JSON字符串
        threshold: 相似度阈值
        model_type: WeSpeaker模型类型
        device: 设备

    Returns:
        dict: 转录和识别结果
    """
    print(f"[TranscribeSpeaker] 开始处理音频: {audio_path}", file=sys.stderr)
    print(f"[TranscribeSpeaker] 阈值: {threshold:.2f}", file=sys.stderr)

    try:
        # 1. 使用FunASR转录音频
        print(f"[TranscribeSpeaker] ====================", file=sys.stderr)
        print(f"[TranscribeSpeaker] 步骤1: FunASR语音识别", file=sys.stderr)
        transcription_result = funasr_service.transcribe_file(
            audio_path=audio_path,
            language='zh',
            mode='offline',  # 使用离线模式获得更高精度
            device=device
        )

        if not transcription_result['success']:
            return {
                'success': False,
                'error': 'Transcription failed: ' + transcription_result.get('error', 'Unknown error')
            }

        # 获取分段信息
        segments = transcription_result.get('segments', [])
        sentences = transcription_result.get('sentences', [])

        # 优先使用句子级别的分段
        text_segments = sentences if sentences else segments

        print(f"[TranscribeSpeaker] ✅ 转录完成: {len(text_segments)} 个分段", file=sys.stderr)

        # 2. 解析参考声纹
        print(f"[TranscribeSpeaker] ====================", file=sys.stderr)
        print(f"[TranscribeSpeaker] 步骤2: 加载参考声纹", file=sys.stderr)
        reference_embeddings = json.loads(reference_embeddings_json)
        print(f"[TranscribeSpeaker] 候选说话人: {len(reference_embeddings)}人", file=sys.stderr)
        for speaker_id in reference_embeddings.keys():
            print(f"[TranscribeSpeaker]   - {speaker_id}", file=sys.stderr)

        # 3. 使用WeSpeaker对每个分段进行说话人识别
        print(f"[TranscribeSpeaker] ====================", file=sys.stderr)
        print(f"[TranscribeSpeaker] 步骤3: WeSpeaker说话人识别", file=sys.stderr)

        # 初始化WeSpeaker模型
        wespeaker_model = wespeaker_service.init_model(model_type=model_type, device=device)

        # 加载完整音频用于分段提取
        import soundfile as sf
        audio_data, sample_rate = sf.read(audio_path, dtype='float32')
        if audio_data.ndim > 1:
            audio_data = audio_data[:, 0]  # 转为单声道

        # 对每个分段进行说话人识别
        identified_segments = []

        for i, segment in enumerate(text_segments):
            text = segment.get('text', '').strip()
            if not text:
                continue

            start_time = segment.get('start', 0)
            end_time = segment.get('end', 0)

            print(f"\n[TranscribeSpeaker] --- 分段 {i+1}/{len(text_segments)} ({start_time:.1f}s - {end_time:.1f}s) ---", file=sys.stderr)
            print(f"[TranscribeSpeaker] 文本: {text}", file=sys.stderr)

            # 提取该分段的音频
            start_sample = int(start_time * sample_rate)
            end_sample = int(end_time * sample_rate)
            segment_audio = audio_data[start_sample:end_sample]

            # 跳过太短的分段(少于0.5秒)
            if len(segment_audio) < sample_rate * 0.5:
                print(f"[TranscribeSpeaker] ⚠️ 分段太短,跳过说话人识别", file=sys.stderr)
                identified_segments.append({
                    'text': text,
                    'start': start_time,
                    'end': end_time,
                    'speaker': {
                        'name': '未识别',
                        'confidence': 0
                    }
                })
                continue

            # 提取该分段的声纹
            import torch
            segment_tensor = torch.from_numpy(segment_audio).unsqueeze(0)
            segment_embedding = wespeaker_model.extract_embedding_from_pcm(segment_tensor, sample_rate)

            # 归一化
            if not isinstance(segment_embedding, np.ndarray):
                segment_embedding = np.array(segment_embedding)
            if segment_embedding.ndim > 1:
                segment_embedding = segment_embedding.flatten()
            segment_embedding = segment_embedding / (np.linalg.norm(segment_embedding) + 1e-8)

            # 匹配说话人
            best_speaker = None
            best_score = 0
            scores = {}

            for speaker_id, ref_embedding in reference_embeddings.items():
                similarity = wespeaker_service.compute_similarity(segment_embedding, ref_embedding)
                scores[speaker_id] = similarity

                if similarity > best_score:
                    best_score = similarity
                    best_speaker = speaker_id

            # 显示所有分数
            for speaker_id, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
                print(f"[TranscribeSpeaker]   {speaker_id}: {score:.4f} ({score*100:.2f}%)", file=sys.stderr)

            # 判断是否识别成功
            if best_score >= threshold:
                print(f"[TranscribeSpeaker] ✅ 识别为: {best_speaker} (置信度: {best_score:.4f})", file=sys.stderr)
                identified_segments.append({
                    'text': text,
                    'start': start_time,
                    'end': end_time,
                    'speaker': {
                        'name': best_speaker,
                        'confidence': best_score
                    }
                })
            else:
                print(f"[TranscribeSpeaker] ❌ 未识别 (最高分: {best_score:.4f} < {threshold:.4f})", file=sys.stderr)
                identified_segments.append({
                    'text': text,
                    'start': start_time,
                    'end': end_time,
                    'speaker': {
                        'name': '未识别',
                        'confidence': best_score
                    }
                })

        # 汇总统计
        print(f"\n[TranscribeSpeaker] {'='*60}", file=sys.stderr)
        print(f"[TranscribeSpeaker] 处理完成", file=sys.stderr)
        print(f"[TranscribeSpeaker] 总分段数: {len(identified_segments)}", file=sys.stderr)

        # 统计说话人
        speaker_counts = {}
        for seg in identified_segments:
            speaker_name = seg['speaker']['name']
            speaker_counts[speaker_name] = speaker_counts.get(speaker_name, 0) + 1

        print(f"[TranscribeSpeaker] 说话人统计:", file=sys.stderr)
        for speaker_name, count in sorted(speaker_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"[TranscribeSpeaker]   - {speaker_name}: {count}次", file=sys.stderr)
        print(f"[TranscribeSpeaker] {'='*60}", file=sys.stderr)

        return {
            'success': True,
            'segments': identified_segments,
            'full_text': transcription_result['text'],
            'total_segments': len(identified_segments)
        }

    except Exception as e:
        print(f"[TranscribeSpeaker] ❌ 处理失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def main():
    """
    命令行入口

    Usage:
        python transcribe_with_speaker.py <audio_file> <reference_json> [threshold] [model_type] [device]
    """
    if len(sys.argv) < 3:
        print("Usage: python transcribe_with_speaker.py <audio_file> <reference_json> [threshold] [model_type] [device]")
        return 1

    audio_path = sys.argv[1]
    reference_json = sys.argv[2]
    threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 0.40
    model_type = sys.argv[4] if len(sys.argv) > 4 else 'chinese'
    device = sys.argv[5] if len(sys.argv) > 5 else 'cpu'

    try:
        result = transcribe_with_speaker_identification(
            audio_path,
            reference_json,
            threshold=threshold,
            model_type=model_type,
            device=device
        )
        print(json.dumps(result, ensure_ascii=False))
        return 0

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
