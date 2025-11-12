#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
多说话人识别服务
解决音频导入时将整段音频识别为单一说话人的问题

策略:
1. 将音频分割成小段(3-5秒)
2. 对每段提取声纹并识别
3. 返回所有检测到的不同说话人
"""

import sys
import io
import json
import os
import numpy as np
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# 设置标准输出为UTF-8编码
# 注意: 不要重新包装sys.stdout/stderr,会导致退出时"I/O operation on closed file"错误
if sys.platform == 'win32':
    import codecs
    # 使用codecs设置编码,而不是重新包装流
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# 导入wespeaker服务
import wespeaker_service


def split_audio_to_chunks(audio_path, chunk_duration=4.0):
    """
    将音频分割成多个小段

    Args:
        audio_path: 音频文件路径
        chunk_duration: 每段时长(秒)

    Returns:
        list: 音频段列表 [(audio_data, start_time, end_time), ...]
    """
    try:
        import soundfile as sf

        print(f"[MultiSpeaker] 正在加载音频: {audio_path}", file=sys.stderr)
        audio, sample_rate = sf.read(audio_path, dtype='float32')

        # 转为单声道
        if audio.ndim > 1:
            audio = audio[:, 0]

        duration = len(audio) / sample_rate
        chunk_samples = int(chunk_duration * sample_rate)

        print(f"[MultiSpeaker] 音频时长: {duration:.2f}秒, 采样率: {sample_rate}Hz", file=sys.stderr)
        print(f"[MultiSpeaker] 分割参数: {chunk_duration}秒/段", file=sys.stderr)

        chunks = []
        start_sample = 0

        while start_sample < len(audio):
            end_sample = min(start_sample + chunk_samples, len(audio))
            chunk = audio[start_sample:end_sample]

            # 跳过太短的段
            if len(chunk) < sample_rate * 1.0:  # 最少1秒
                break

            start_time = start_sample / sample_rate
            end_time = end_sample / sample_rate

            chunks.append({
                'audio': chunk,
                'sample_rate': sample_rate,
                'start_time': start_time,
                'end_time': end_time
            })

            start_sample = end_sample

        print(f"[MultiSpeaker] 分割完成: {len(chunks)}个音频段", file=sys.stderr)
        return chunks

    except Exception as e:
        print(f"[MultiSpeaker] ❌ 音频分割失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return []


def extract_chunk_embedding(chunk, sample_rate, model_type='chinese', device='cpu'):
    """
    从音频块提取声纹特征

    Args:
        chunk: 音频数据 (numpy array)
        sample_rate: 采样率
        model_type: 模型类型
        device: 设备

    Returns:
        numpy array: 声纹向量
    """
    try:
        import torch

        # 初始化模型
        model = wespeaker_service.init_model(model_type=model_type, device=device)

        # 转换为torch tensor
        if isinstance(chunk, np.ndarray):
            chunk_tensor = torch.from_numpy(chunk).unsqueeze(0)  # (samples,) -> (1, samples)
        else:
            chunk_tensor = chunk

        # 提取embedding
        embedding = model.extract_embedding_from_pcm(chunk_tensor, sample_rate)

        # 转换为numpy并归一化
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding)

        if embedding.ndim > 1:
            embedding = embedding.flatten()

        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)

        return embedding

    except Exception as e:
        print(f"[MultiSpeaker] ⚠️ 块特征提取失败: {e}", file=sys.stderr)
        return None


def identify_multi_speaker(audio_path, reference_embeddings_json, threshold=0.40,
                          chunk_duration=4.0, model_type='chinese', device='cpu'):
    """
    多说话人识别

    Args:
        audio_path: 音频文件路径
        reference_embeddings_json: 参考声纹JSON
        threshold: 相似度阈值 (降低到40%以适应音频质量差异)
        chunk_duration: 分段时长
        model_type: 模型类型
        device: 设备

    Returns:
        dict: 识别结果
    """
    print(f"[MultiSpeaker] 开始多说话人识别: {audio_path}", file=sys.stderr)
    print(f"[MultiSpeaker] 阈值: {threshold:.2f}, 分段: {chunk_duration}秒", file=sys.stderr)

    try:
        # 解析参考声纹
        reference_embeddings = json.loads(reference_embeddings_json)
        print(f"[MultiSpeaker] 候选说话人: {len(reference_embeddings)}人", file=sys.stderr)

        # 分割音频
        chunks = split_audio_to_chunks(audio_path, chunk_duration)

        if not chunks:
            return {
                'success': False,
                'error': 'Failed to split audio'
            }

        # 对每段进行识别
        all_identifications = []
        detected_speakers = {}  # speaker_id -> {'count': n, 'max_confidence': x, 'time_ranges': [...]}

        for i, chunk_info in enumerate(chunks):
            print(f"\n[MultiSpeaker] --- 处理第 {i+1}/{len(chunks)} 段 ({chunk_info['start_time']:.1f}s - {chunk_info['end_time']:.1f}s) ---", file=sys.stderr)

            # 提取这段的声纹
            chunk_embedding = extract_chunk_embedding(
                chunk_info['audio'],
                chunk_info['sample_rate'],
                model_type=model_type,
                device=device
            )

            if chunk_embedding is None:
                print(f"[MultiSpeaker] ⚠️ 跳过该段", file=sys.stderr)
                continue

            # 匹配说话人
            best_speaker = None
            best_score = 0
            scores = {}

            for speaker_id, ref_embedding in reference_embeddings.items():
                similarity = wespeaker_service.compute_similarity(chunk_embedding, ref_embedding)
                scores[speaker_id] = similarity

                if similarity > best_score:
                    best_score = similarity
                    best_speaker = speaker_id

            # 显示所有分数
            for speaker_id, score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
                print(f"[MultiSpeaker]   {speaker_id}: {score:.4f} ({score*100:.2f}%)", file=sys.stderr)

            # 判断是否识别成功
            if best_score >= threshold:
                print(f"[MultiSpeaker] ✅ 识别为: {best_speaker} (置信度: {best_score:.4f})", file=sys.stderr)

                # 记录检测到的说话人
                if best_speaker not in detected_speakers:
                    detected_speakers[best_speaker] = {
                        'count': 0,
                        'max_confidence': 0,
                        'time_ranges': []
                    }

                detected_speakers[best_speaker]['count'] += 1
                detected_speakers[best_speaker]['max_confidence'] = max(
                    detected_speakers[best_speaker]['max_confidence'],
                    best_score
                )
                detected_speakers[best_speaker]['time_ranges'].append({
                    'start': chunk_info['start_time'],
                    'end': chunk_info['end_time']
                })

                all_identifications.append({
                    'chunk_index': i,
                    'start_time': chunk_info['start_time'],
                    'end_time': chunk_info['end_time'],
                    'speaker_id': best_speaker,
                    'confidence': best_score
                })
            else:
                print(f"[MultiSpeaker] ❌ 未识别 (最高分: {best_score:.4f} < {threshold:.4f})", file=sys.stderr)

        # 汇总结果
        print(f"\n[MultiSpeaker] {'='*60}", file=sys.stderr)
        print(f"[MultiSpeaker] 识别完成", file=sys.stderr)
        print(f"[MultiSpeaker] 处理音频段: {len(chunks)}个", file=sys.stderr)
        print(f"[MultiSpeaker] 检测到说话人: {len(detected_speakers)}人", file=sys.stderr)

        if detected_speakers:
            print(f"[MultiSpeaker] 说话人详情:", file=sys.stderr)
            for speaker_id, info in sorted(detected_speakers.items(),
                                          key=lambda x: x[1]['count'],
                                          reverse=True):
                print(f"[MultiSpeaker]   - {speaker_id}: 出现{info['count']}次, "
                      f"最高置信度{info['max_confidence']:.4f}", file=sys.stderr)

        print(f"[MultiSpeaker] {'='*60}", file=sys.stderr)

        # 返回结果
        if detected_speakers:
            # 按出现次数排序，返回最可能的说话人
            primary_speaker = max(detected_speakers.items(),
                                key=lambda x: x[1]['count'])[0]

            # 准备候选列表
            candidates = [
                {
                    'profileId': speaker_id,
                    'confidence': info['max_confidence'],
                    'occurrences': info['count'],
                    'timeRanges': info['time_ranges']
                }
                for speaker_id, info in sorted(detected_speakers.items(),
                                              key=lambda x: x[1]['max_confidence'],
                                              reverse=True)
            ]

            return {
                'success': True,
                'identified': True,
                'profileId': primary_speaker,
                'speakerId': primary_speaker,
                'confidence': detected_speakers[primary_speaker]['max_confidence'],
                'multiSpeaker': len(detected_speakers) > 1,
                'detectedSpeakers': list(detected_speakers.keys()),
                'numDetectedSpeakers': len(detected_speakers),
                'candidates': candidates,
                'chunks': all_identifications
            }
        else:
            return {
                'success': True,
                'identified': False,
                'multiSpeaker': False,
                'detectedSpeakers': [],
                'numDetectedSpeakers': 0,
                'candidates': []
            }

    except Exception as e:
        print(f"[MultiSpeaker] ❌ 识别失败: {e}", file=sys.stderr)
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
        python multi_speaker_识别.py identify_multi <audio_file> <reference_json> [threshold] [chunk_duration] [model_type] [device]
    """
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    command = sys.argv[1]

    try:
        if command == 'identify_multi':
            audio_path = sys.argv[2]
            reference_json = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.40
            chunk_duration = float(sys.argv[5]) if len(sys.argv) > 5 else 4.0
            model_type = sys.argv[6] if len(sys.argv) > 6 else 'chinese'
            device = sys.argv[7] if len(sys.argv) > 7 else 'cpu'

            result = identify_multi_speaker(
                audio_path,
                reference_json,
                threshold=threshold,
                chunk_duration=chunk_duration,
                model_type=model_type,
                device=device
            )
            print(json.dumps(result, ensure_ascii=False))

        else:
            print(f"Unknown command: {command}")
            print(__doc__)
            return 1

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
