#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
简易声纹提取和比对服务
使用基于频谱特征的简单方法进行声纹识别
"""

import sys
import json
import io
import numpy as np
import librosa
from scipy.spatial.distance import cosine

# 设置 stdout 使用 UTF-8 编码（Windows 兼容）
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


def extract_voiceprint_features(audio_path, duration=None):
    """
    提取声纹特征（使用MFCC + Delta特征）

    Args:
        audio_path: 音频文件路径
        duration: 使用的音频时长（秒），None表示全部

    Returns:
        声纹特征向量 (numpy array)
    """
    try:
        # 加载音频文件
        y, sr = librosa.load(audio_path, sr=16000, duration=duration)

        # 提取MFCC特征（13维）
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

        # 提取Delta MFCC（一阶导数）
        delta_mfcc = librosa.feature.delta(mfcc)

        # 提取Delta-Delta MFCC（二阶导数）
        delta2_mfcc = librosa.feature.delta(mfcc, order=2)

        # 合并特征
        features = np.vstack([mfcc, delta_mfcc, delta2_mfcc])

        # 计算统计特征（均值和标准差）
        mean_features = np.mean(features, axis=1)
        std_features = np.std(features, axis=1)

        # 合并成最终特征向量
        voiceprint = np.concatenate([mean_features, std_features])

        return voiceprint.tolist()

    except Exception as e:
        print(f"[ERROR] 提取声纹特征失败: {str(e)}", file=sys.stderr)
        return None


def compare_voiceprints(voiceprint1, voiceprint2):
    """
    比对两个声纹的相似度

    Args:
        voiceprint1: 第一个声纹特征向量
        voiceprint2: 第二个声纹特征向量

    Returns:
        相似度分数 (0-1，越高越相似)
    """
    try:
        # 转换为numpy数组
        v1 = np.array(voiceprint1)
        v2 = np.array(voiceprint2)

        # 计算余弦相似度
        similarity = 1 - cosine(v1, v2)

        return float(similarity)

    except Exception as e:
        print(f"[ERROR] 声纹比对失败: {str(e)}", file=sys.stderr)
        return 0.0


def identify_speaker(test_audio_path, voiceprint_database):
    """
    识别说话人（1:N识别）

    Args:
        test_audio_path: 待识别的音频文件路径
        voiceprint_database: 声纹数据库 {speaker_id: voiceprint_features}

    Returns:
        识别结果 {identified: bool, speaker_id: str, confidence: float}
    """
    try:
        # 提取测试音频的声纹特征
        test_voiceprint = extract_voiceprint_features(test_audio_path)

        if test_voiceprint is None:
            return {
                "identified": False,
                "error": "Failed to extract voiceprint"
            }

        # 与数据库中所有声纹进行比对
        candidates = []

        for speaker_id, saved_voiceprint in voiceprint_database.items():
            similarity = compare_voiceprints(test_voiceprint, saved_voiceprint)
            candidates.append({
                "speaker_id": speaker_id,
                "confidence": similarity
            })

        # 排序找到最匹配的说话人
        candidates.sort(key=lambda x: x["confidence"], reverse=True)

        # 设置识别阈值
        threshold = 0.7

        if len(candidates) > 0 and candidates[0]["confidence"] >= threshold:
            return {
                "identified": True,
                "speaker_id": candidates[0]["speaker_id"],
                "confidence": candidates[0]["confidence"],
                "all_candidates": candidates
            }
        else:
            return {
                "identified": False,
                "confidence": candidates[0]["confidence"] if candidates else 0.0,
                "all_candidates": candidates
            }

    except Exception as e:
        print(f"[ERROR] 说话人识别失败: {str(e)}", file=sys.stderr)
        return {
            "identified": False,
            "error": str(e)
        }


def main():
    """
    命令行接口
    """
    if len(sys.argv) < 2:
        print("用法:", file=sys.stderr)
        print("  1. 提取声纹: python simple_voiceprint.py extract <audio_file>", file=sys.stderr)
        print("  2. 比对声纹: python simple_voiceprint.py compare <audio1> <audio2>", file=sys.stderr)
        print("  3. 识别说话人: python simple_voiceprint.py identify <test_audio> <database_json>", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "extract":
        if len(sys.argv) < 3:
            print("[ERROR] 请提供音频文件路径", file=sys.stderr)
            sys.exit(1)

        audio_path = sys.argv[2]
        print(f"[+] 正在提取声纹特征: {audio_path}", file=sys.stderr)

        features = extract_voiceprint_features(audio_path)

        if features:
            result = {
                "success": True,
                "features": features,
                "feature_dim": len(features)
            }
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(json.dumps({"success": False, "error": "Feature extraction failed"}))
            sys.exit(1)

    elif command == "compare":
        if len(sys.argv) < 4:
            print("[ERROR] 请提供两个音频文件路径", file=sys.stderr)
            sys.exit(1)

        audio1 = sys.argv[2]
        audio2 = sys.argv[3]

        print(f"[+] 正在提取声纹特征...", file=sys.stderr)
        features1 = extract_voiceprint_features(audio1)
        features2 = extract_voiceprint_features(audio2)

        if features1 and features2:
            similarity = compare_voiceprints(features1, features2)
            result = {
                "success": True,
                "similarity": similarity,
                "match": similarity >= 0.7
            }
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(json.dumps({"success": False, "error": "Feature extraction failed"}))
            sys.exit(1)

    elif command == "identify":
        if len(sys.argv) < 4:
            print("[ERROR] 请提供测试音频和声纹数据库JSON文件", file=sys.stderr)
            sys.exit(1)

        test_audio = sys.argv[2]
        database_json = sys.argv[3]

        # 加载声纹数据库
        try:
            with open(database_json, 'r', encoding='utf-8') as f:
                database = json.load(f)
        except Exception as e:
            print(f"[ERROR] 加载声纹数据库失败: {e}", file=sys.stderr)
            sys.exit(1)

        print(f"[+] 正在识别说话人...", file=sys.stderr)
        print(f"[+] 声纹数据库包含 {len(database)} 个说话人", file=sys.stderr)

        result = identify_speaker(test_audio, database)
        print(json.dumps(result, ensure_ascii=False))

    else:
        print(f"[ERROR] 未知命令: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
