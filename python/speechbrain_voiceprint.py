#!/usr/bin/env python3
"""
SpeechBrain声纹识别服务
支持声纹提取、1:1验证、1:N识别
"""

import sys
import json
import os
import numpy as np
from pathlib import Path
import torch
import torchaudio

def init_model(device='cpu'):
    """
    初始化SpeechBrain声纹识别模型

    Args:
        device: 运行设备 ('cpu', 'cuda')

    Returns:
        model: 声纹识别模型
    """
    try:
        from speechbrain.inference.speaker import SpeakerRecognition

        print(f"[SpeechBrain] 正在加载声纹识别模型 (device={device})...", file=sys.stderr)

        # 使用预训练的ECAPA-TDNN模型
        model = SpeakerRecognition.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir="models/spkrec-ecapa-voxceleb",
            run_opts={"device": device}
        )

        print(f"[SpeechBrain] ✅ 模型加载成功", file=sys.stderr)
        return model

    except ImportError as e:
        print(f"[SpeechBrain] ❌ 错误: SpeechBrain未安装", file=sys.stderr)
        print(f"[SpeechBrain] 请运行: pip install speechbrain", file=sys.stderr)
        raise
    except Exception as e:
        print(f"[SpeechBrain] ❌ 模型加载失败: {e}", file=sys.stderr)
        raise


def extract_embedding(audio_path, device='cpu'):
    """
    提取音频的声纹特征向量

    Args:
        audio_path: 音频文件路径
        device: 运行设备

    Returns:
        dict: 包含声纹特征的结果
    """
    print(f"[SpeechBrain] 提取声纹特征: {audio_path}", file=sys.stderr)

    try:
        model = init_model(device=device)

        # 加载音频
        signal, fs = torchaudio.load(audio_path)

        # 重采样到16kHz (如果需要)
        if fs != 16000:
            resampler = torchaudio.transforms.Resample(fs, 16000)
            signal = resampler(signal)

        # 转为单声道
        if signal.shape[0] > 1:
            signal = torch.mean(signal, dim=0, keepdim=True)

        # 提取embedding
        with torch.no_grad():
            embedding = model.encode_batch(signal)
            embedding_np = embedding.squeeze().cpu().numpy()

        print(f"[SpeechBrain] ✅ 特征提取完成: {embedding_np.shape}", file=sys.stderr)

        return {
            'success': True,
            'embedding': embedding_np.tolist(),
            'shape': list(embedding_np.shape)
        }

    except Exception as e:
        print(f"[SpeechBrain] ❌ 特征提取失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def verify_speaker(audio_path1, audio_path2, threshold=0.25, device='cpu'):
    """
    1:1声纹验证 (判断两段音频是否为同一人)

    Args:
        audio_path1: 音频1路径
        audio_path2: 音频2路径
        threshold: 相似度阈值 (越小越严格)
        device: 运行设备

    Returns:
        dict: 验证结果
    """
    print(f"[SpeechBrain] 1:1声纹验证", file=sys.stderr)
    print(f"[SpeechBrain] 音频1: {audio_path1}", file=sys.stderr)
    print(f"[SpeechBrain] 音频2: {audio_path2}", file=sys.stderr)

    try:
        model = init_model(device=device)

        # 计算相似度分数
        score, prediction = model.verify_files(audio_path1, audio_path2)

        # score越小表示越相似 (cosine distance)
        # prediction: True表示同一人，False表示不同人
        verified = score.item() < threshold

        print(f"[SpeechBrain] 相似度分数: {score.item():.4f} (阈值: {threshold})", file=sys.stderr)
        print(f"[SpeechBrain] 验证结果: {'✅ 同一人' if verified else '❌ 不同人'}", file=sys.stderr)

        return {
            'success': True,
            'verified': verified,
            'score': float(score.item()),
            'threshold': threshold,
            'confidence': 1.0 - min(float(score.item()), 1.0)  # 转换为0-1的置信度
        }

    except Exception as e:
        print(f"[SpeechBrain] ❌ 验证失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def identify_speaker(audio_path, reference_embeddings, threshold=0.25, device='cpu'):
    """
    1:N声纹识别 (从多个声纹中识别说话人)

    Args:
        audio_path: 待识别音频路径
        reference_embeddings: 参考声纹列表 [{'profileId': str, 'embedding': list}, ...]
        threshold: 相似度阈值
        device: 运行设备

    Returns:
        dict: 识别结果
    """
    print(f"[SpeechBrain] 1:N声纹识别", file=sys.stderr)
    print(f"[SpeechBrain] 待识别音频: {audio_path}", file=sys.stderr)
    print(f"[SpeechBrain] 候选声纹数: {len(reference_embeddings)}", file=sys.stderr)

    try:
        # 提取待识别音频的embedding
        result = extract_embedding(audio_path, device)
        if not result['success']:
            return result

        test_embedding = np.array(result['embedding'])

        # 与每个参考声纹计算相似度
        candidates = []
        for ref in reference_embeddings:
            profile_id = ref['profileId']
            ref_embedding = np.array(ref['embedding'])

            # 计算余弦距离
            similarity = cosine_distance(test_embedding, ref_embedding)

            candidates.append({
                'profileId': profile_id,
                'score': float(similarity),
                'confidence': 1.0 - min(float(similarity), 1.0)
            })

            print(f"[SpeechBrain] {profile_id}: 分数={similarity:.4f}", file=sys.stderr)

        # 按分数排序 (越小越相似)
        candidates.sort(key=lambda x: x['score'])

        # 判断最佳匹配
        if candidates and candidates[0]['score'] < threshold:
            identified = True
            best_match = candidates[0]
            print(f"[SpeechBrain] ✅ 识别成功: {best_match['profileId']}", file=sys.stderr)
        else:
            identified = False
            best_match = None
            print(f"[SpeechBrain] ❌ 未识别到匹配的说话人", file=sys.stderr)

        return {
            'success': True,
            'identified': identified,
            'profileId': best_match['profileId'] if identified else None,
            'confidence': best_match['confidence'] if identified else 0.0,
            'candidates': candidates
        }

    except Exception as e:
        print(f"[SpeechBrain] ❌ 识别失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def cosine_distance(embedding1, embedding2):
    """
    计算余弦距离

    Args:
        embedding1: 声纹特征1
        embedding2: 声纹特征2

    Returns:
        float: 余弦距离 (0-2, 越小越相似)
    """
    # 归一化
    embedding1 = embedding1 / (np.linalg.norm(embedding1) + 1e-8)
    embedding2 = embedding2 / (np.linalg.norm(embedding2) + 1e-8)

    # 余弦相似度
    similarity = np.dot(embedding1, embedding2)

    # 转换为距离
    distance = 1.0 - similarity

    return distance


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python speechbrain_voiceprint.py <command> [args]'
        }))
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == 'extract':
            # 提取声纹特征
            if len(sys.argv) < 3:
                print(json.dumps({
                    'success': False,
                    'error': 'Usage: python speechbrain_voiceprint.py extract <audio_file> [device]'
                }))
                sys.exit(1)

            audio_file = sys.argv[2]
            device = sys.argv[3] if len(sys.argv) > 3 else 'cpu'

            result = extract_embedding(audio_file, device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'verify':
            # 1:1验证
            if len(sys.argv) < 4:
                print(json.dumps({
                    'success': False,
                    'error': 'Usage: python speechbrain_voiceprint.py verify <audio1> <audio2> [threshold] [device]'
                }))
                sys.exit(1)

            audio1 = sys.argv[2]
            audio2 = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
            device = sys.argv[5] if len(sys.argv) > 5 else 'cpu'

            result = verify_speaker(audio1, audio2, threshold, device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'identify':
            # 1:N识别
            if len(sys.argv) < 4:
                print(json.dumps({
                    'success': False,
                    'error': 'Usage: python speechbrain_voiceprint.py identify <audio_file> <reference_embeddings_json> [threshold] [device]'
                }))
                sys.exit(1)

            audio_file = sys.argv[2]
            reference_json = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
            device = sys.argv[5] if len(sys.argv) > 5 else 'cpu'

            # 解析参考声纹
            reference_embeddings = json.loads(reference_json)

            result = identify_speaker(audio_file, reference_embeddings, threshold, device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'test':
            # 测试模式
            print("[SpeechBrain] 正在测试环境...", file=sys.stderr)
            from speechbrain.inference.speaker import SpeakerRecognition
            print(json.dumps({
                'success': True,
                'message': 'SpeechBrain环境正常'
            }))

        else:
            print(json.dumps({
                'success': False,
                'error': f'Unknown command: {command}'
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
