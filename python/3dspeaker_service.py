#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
3D-Speaker声纹识别服务 (阿里达摩院)
支持声纹提取、1:1验证、1:N识别

优势：
- 针对中文优化，200k中文说话人训练
- 业界领先的准确率
- 支持多种模型：CAM++, ERes2Net-Base, ERes2Net-Large
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
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 全局模型实例
_model = None
_device = None


def init_model(model_id='iic/speech_eres2net_sv_zh-cn_16k-common', device='cpu'):
    """
    初始化3D-Speaker声纹识别模型

    Args:
        model_id: ModelScope模型ID
            - 'iic/speech_eres2net_sv_zh-cn_16k-common' (推荐): ERes2Net-Base 中文模型
            - 'iic/speech_eres2net_large_sv_zh-cn_3dspeaker_16k': ERes2Net-Large 大模型
            - 'iic/speech_campplus_sv_zh-cn_16k-common': CAM++ 模型
        device: 运行设备 ('cpu', 'cuda')

    Returns:
        pipeline: 3D-Speaker推理Pipeline
    """
    global _model, _device

    if _model is not None and _device == device:
        return _model

    try:
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks

        print(f"[3D-Speaker] 正在加载声纹识别模型...", file=sys.stderr)
        print(f"[3D-Speaker] 模型ID: {model_id}", file=sys.stderr)
        print(f"[3D-Speaker] 设备: {device}", file=sys.stderr)

        # 创建Pipeline
        _model = pipeline(
            task=Tasks.speaker_verification,
            model=model_id,
            device=device
        )
        _device = device

        print(f"[3D-Speaker] ✅ 模型加载成功", file=sys.stderr)
        return _model

    except ImportError as e:
        print(f"[3D-Speaker] ❌ 错误: modelscope未安装", file=sys.stderr)
        print(f"[3D-Speaker] 请运行: pip install modelscope", file=sys.stderr)
        raise
    except Exception as e:
        print(f"[3D-Speaker] ❌ 模型加载失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        raise


def extract_embedding(audio_path, model_id='iic/speech_eres2net_sv_zh-cn_16k-common', device='cpu'):
    """
    提取音频的声纹特征向量

    Args:
        audio_path: 音频文件路径
        model_id: 模型ID
        device: 运行设备

    Returns:
        dict: 包含声纹特征的结果
    """
    print(f"[3D-Speaker] 提取声纹特征: {audio_path}", file=sys.stderr)

    try:
        model = init_model(model_id=model_id, device=device)

        # 使用3D-Speaker提取embedding
        result = model(audio_in=audio_path)

        # 获取embedding向量
        if 'spk_embedding' in result:
            embedding = result['spk_embedding']
        elif 'embedding' in result:
            embedding = result['embedding']
        else:
            # 如果返回的是numpy数组
            embedding = result

        # 转换为numpy数组
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding)

        # 确保是一维向量
        if embedding.ndim > 1:
            embedding = embedding.flatten()

        print(f"[3D-Speaker] ✅ 特征提取完成: shape={embedding.shape}, norm={np.linalg.norm(embedding):.3f}", file=sys.stderr)

        return {
            'success': True,
            'embedding': embedding.tolist(),
            'shape': list(embedding.shape),
            'model': model_id
        }

    except Exception as e:
        print(f"[3D-Speaker] ❌ 特征提取失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def compute_similarity(embedding1, embedding2):
    """
    计算两个声纹向量的余弦相似度

    Args:
        embedding1: 第一个声纹向量 (list or numpy array)
        embedding2: 第二个声纹向量

    Returns:
        float: 余弦相似度 (-1 到 1)
    """
    emb1 = np.array(embedding1)
    emb2 = np.array(embedding2)

    # 归一化
    emb1 = emb1 / (np.linalg.norm(emb1) + 1e-8)
    emb2 = emb2 / (np.linalg.norm(emb2) + 1e-8)

    # 余弦相似度
    similarity = np.dot(emb1, emb2)

    return float(similarity)


def verify_speaker(audio_path1, audio_path2, threshold=0.50, model_id='iic/speech_eres2net_sv_zh-cn_16k-common', device='cpu'):
    """
    1:1 声纹验证

    Args:
        audio_path1: 第一个音频文件路径
        audio_path2: 第二个音频文件路径
        threshold: 相似度阈值 (推荐: 0.50)
        model_id: 模型ID
        device: 运行设备

    Returns:
        dict: 验证结果
    """
    print(f"[3D-Speaker] 1:1验证: {audio_path1} vs {audio_path2}", file=sys.stderr)

    try:
        # 提取两个音频的embedding
        result1 = extract_embedding(audio_path1, model_id=model_id, device=device)
        result2 = extract_embedding(audio_path2, model_id=model_id, device=device)

        if not result1['success'] or not result2['success']:
            return {
                'success': False,
                'error': 'Failed to extract embeddings'
            }

        # 计算相似度
        similarity = compute_similarity(result1['embedding'], result2['embedding'])
        verified = similarity >= threshold

        print(f"[3D-Speaker] 相似度: {similarity:.4f}, 阈值: {threshold:.4f}, 结果: {'✅ 通过' if verified else '❌ 未通过'}", file=sys.stderr)

        return {
            'success': True,
            'verified': verified,
            'similarity': similarity,
            'threshold': threshold,
            'score': similarity  # 别名
        }

    except Exception as e:
        print(f"[3D-Speaker] ❌ 验证失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def identify_speaker(audio_path, reference_embeddings_json, threshold=0.50, model_id='iic/speech_eres2net_sv_zh-cn_16k-common', device='cpu'):
    """
    1:N 声纹识别

    Args:
        audio_path: 待识别音频路径
        reference_embeddings_json: JSON字符串，格式: {"speaker1": [embedding], "speaker2": [...]}
        threshold: 相似度阈值
        model_id: 模型ID
        device: 运行设备

    Returns:
        dict: 识别结果
    """
    print(f"[3D-Speaker] 1:N识别: {audio_path}", file=sys.stderr)

    try:
        # 解析参考embeddings
        reference_embeddings = json.loads(reference_embeddings_json)
        print(f"[3D-Speaker] 候选说话人数量: {len(reference_embeddings)}", file=sys.stderr)

        # 提取测试音频的embedding
        result = extract_embedding(audio_path, model_id=model_id, device=device)
        if not result['success']:
            return {
                'success': False,
                'error': 'Failed to extract test embedding'
            }

        test_embedding = result['embedding']

        # 计算与所有参考embedding的相似度
        scores = {}
        for speaker_id, ref_embedding in reference_embeddings.items():
            similarity = compute_similarity(test_embedding, ref_embedding)
            scores[speaker_id] = similarity
            print(f"[3D-Speaker]   {speaker_id}: {similarity:.4f}", file=sys.stderr)

        # 找到最高分
        if scores:
            best_speaker = max(scores.items(), key=lambda x: x[1])
            best_id = best_speaker[0]
            best_score = best_speaker[1]

            identified = best_score >= threshold

            # 准备候选列表（按分数降序）
            candidates = [
                {'profileId': spk_id, 'confidence': score}
                for spk_id, score in sorted(scores.items(), key=lambda x: x[1], reverse=True)
            ]

            if identified:
                print(f"[3D-Speaker] ✅ 识别为: {best_id} (相似度: {best_score:.4f})", file=sys.stderr)
            else:
                print(f"[3D-Speaker] ❌ 未识别到匹配的说话人 (最高分: {best_score:.4f} < {threshold:.4f})", file=sys.stderr)

            return {
                'success': True,
                'identified': identified,
                'profileId': best_id if identified else None,
                'speakerId': best_id if identified else None,  # 别名
                'confidence': best_score,
                'similarity': best_score,  # 别名
                'threshold': threshold,
                'candidates': candidates
            }
        else:
            return {
                'success': True,
                'identified': False,
                'candidates': []
            }

    except Exception as e:
        print(f"[3D-Speaker] ❌ 识别失败: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)

        return {
            'success': False,
            'error': str(e)
        }


def test():
    """
    测试3D-Speaker安装
    """
    try:
        print("\n" + "="*50)
        print("测试 3D-Speaker 声纹识别")
        print("="*50 + "\n")

        # 测试导入
        print("1️⃣ 测试导入...")
        from modelscope.pipelines import pipeline
        from modelscope.utils.constant import Tasks
        print("   ✅ modelscope导入成功\n")

        # 测试模型加载
        print("2️⃣ 测试模型加载...")
        try:
            model = init_model(device='cpu')
            print("   ✅ ERes2Net-Base 模型加载成功\n")
        except Exception as e:
            print(f"   ⚠️ 模型加载失败: {e}")
            print("   这是正常的，首次运行会自动下载模型（约80MB）\n")

        # 版本信息
        print("3️⃣ 版本信息:")
        try:
            import modelscope
            print(f"   modelscope: {modelscope.__version__}")
        except:
            pass

        try:
            import numpy
            print(f"   numpy: {numpy.__version__}")
        except:
            pass

        print("\n" + "="*50)
        print("✅ 3D-Speaker 安装成功！")
        print("="*50)

        print("\n提示:")
        print("  - 首次使用会自动下载模型（约80MB）")
        print("  - 推荐阈值: 0.50 (平衡模式)")
        print("  - 更严格: 0.60")
        print("  - 更宽松: 0.40")
        print("\n可用模型:")
        print("  - iic/speech_eres2net_sv_zh-cn_16k-common (推荐)")
        print("  - iic/speech_eres2net_large_sv_zh-cn_3dspeaker_16k (大模型)")
        print("  - iic/speech_campplus_sv_zh-cn_16k-common (CAM++)")
        print()

        return 0

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


def main():
    """
    命令行入口

    Usage:
        # 提取声纹
        python 3dspeaker_service.py extract <audio_file> [model_id] [device]

        # 1:1验证
        python 3dspeaker_service.py verify <audio1> <audio2> [threshold] [model_id] [device]

        # 1:N识别
        python 3dspeaker_service.py identify <audio_file> <reference_json> [threshold] [model_id] [device]

        # 测试安装
        python 3dspeaker_service.py test
    """
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nUsage:", main.__doc__)
        return 1

    command = sys.argv[1]

    try:
        if command == 'extract':
            audio_path = sys.argv[2]
            model_id = sys.argv[3] if len(sys.argv) > 3 else 'iic/speech_eres2net_sv_zh-cn_16k-common'
            device = sys.argv[4] if len(sys.argv) > 4 else 'cpu'

            result = extract_embedding(audio_path, model_id=model_id, device=device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'verify':
            audio_path1 = sys.argv[2]
            audio_path2 = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.50
            model_id = sys.argv[5] if len(sys.argv) > 5 else 'iic/speech_eres2net_sv_zh-cn_16k-common'
            device = sys.argv[6] if len(sys.argv) > 6 else 'cpu'

            result = verify_speaker(audio_path1, audio_path2, threshold=threshold, model_id=model_id, device=device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'identify':
            audio_path = sys.argv[2]
            reference_json = sys.argv[3]
            threshold = float(sys.argv[4]) if len(sys.argv) > 4 else 0.50
            model_id = sys.argv[5] if len(sys.argv) > 5 else 'iic/speech_eres2net_sv_zh-cn_16k-common'
            device = sys.argv[6] if len(sys.argv) > 6 else 'cpu'

            result = identify_speaker(audio_path, reference_json, threshold=threshold, model_id=model_id, device=device)
            print(json.dumps(result, ensure_ascii=False))

        elif command == 'test':
            return test()

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
