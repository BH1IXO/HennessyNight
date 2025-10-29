#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
声纹数据库验证脚本
验证数据库中的声纹embedding是否正确存储和可用
"""

import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np
from scipy.spatial.distance import cosine
from typing import Dict, List, Any

def connect_to_database():
    """连接到PostgreSQL数据库"""
    try:
        # 从环境变量或默认配置读取数据库连接信息
        # 默认使用本地PostgreSQL配置
        conn = psycopg2.connect(
            host="localhost",
            port=5432,
            database="meeting_system",
            user="postgres",
            password="postgres"
        )
        print("✅ 数据库连接成功")
        return conn
    except Exception as e:
        print(f"❌ 数据库连接失败: {e}")
        print("\n💡 提示：请检查以下配置:")
        print("   - PostgreSQL服务是否运行")
        print("   - 数据库名称: meeting_system")
        print("   - 用户名/密码是否正确")
        print("   - 端口号: 5432")
        sys.exit(1)

def check_table_structure(conn):
    """第1步：检查数据库表结构"""
    print("\n" + "="*60)
    print("📋 第1步：检查数据库表结构")
    print("="*60)

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # 检查表是否存在
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'Speaker'
            );
        """)
        table_exists = cursor.fetchone()['exists']

        if not table_exists:
            print("❌ 错误：Speaker 表不存在！")
            return False

        print("✅ Speaker 表存在")

        # 检查字段结构
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'Speaker'
            ORDER BY ordinal_position;
        """)

        columns = cursor.fetchall()
        print("\n📊 表字段结构:")
        for col in columns:
            nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
            print(f"   - {col['column_name']}: {col['data_type']} ({nullable})")

        # 检查关键字段
        column_names = [col['column_name'] for col in columns]
        required_fields = ['id', 'name', 'voiceprintData', 'profileStatus']

        missing_fields = [f for f in required_fields if f not in column_names]
        if missing_fields:
            print(f"\n❌ 缺少关键字段: {', '.join(missing_fields)}")
            return False

        print(f"\n✅ 所有关键字段存在: {', '.join(required_fields)}")

        # 检查 voiceprintData 字段类型
        voiceprint_col = next((col for col in columns if col['column_name'] == 'voiceprintData'), None)
        if voiceprint_col and voiceprint_col['data_type'] in ['json', 'jsonb']:
            print(f"✅ voiceprintData 字段类型正确: {voiceprint_col['data_type']}")
        else:
            print(f"⚠️  警告: voiceprintData 字段类型为 {voiceprint_col['data_type'] if voiceprint_col else 'Unknown'}")

        cursor.close()
        return True

    except Exception as e:
        print(f"❌ 检查表结构失败: {e}")
        return False

def check_voiceprint_count(conn):
    """第2步：检查声纹记录数量"""
    print("\n" + "="*60)
    print("📊 第2步：检查声纹记录数量")
    print("="*60)

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # 总记录数
        cursor.execute('SELECT COUNT(*) as total FROM "Speaker"')
        total = cursor.fetchone()['total']
        print(f"\n总说话人记录数: {total}")

        # 已注册声纹的数量
        cursor.execute("""
            SELECT COUNT(*) as enrolled
            FROM "Speaker"
            WHERE "profileStatus" = 'ENROLLED'
            AND "voiceprintData" IS NOT NULL
        """)
        enrolled = cursor.fetchone()['enrolled']
        print(f"已注册声纹数量: {enrolled}")

        # 各状态统计
        cursor.execute("""
            SELECT "profileStatus", COUNT(*) as count
            FROM "Speaker"
            GROUP BY "profileStatus"
            ORDER BY count DESC
        """)
        statuses = cursor.fetchall()
        print("\n📈 状态分布:")
        for status in statuses:
            print(f"   - {status['profileStatus']}: {status['count']}")

        if enrolled == 0:
            print("\n⚠️  警告：没有已注册的声纹数据！")
            print("   请先通过 POST /api/v1/speakers 注册声纹")
            cursor.close()
            return False

        cursor.close()
        return True

    except Exception as e:
        print(f"❌ 检查声纹数量失败: {e}")
        return False

def check_embedding_content(conn):
    """第3步：检查embedding数据内容"""
    print("\n" + "="*60)
    print("🔍 第3步：检查embedding数据内容")
    print("="*60)

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT id, name, "voiceprintData"
            FROM "Speaker"
            WHERE "profileStatus" = 'ENROLLED'
            AND "voiceprintData" IS NOT NULL
            LIMIT 5
        """)

        speakers = cursor.fetchall()

        if not speakers:
            print("❌ 没有找到声纹数据")
            cursor.close()
            return False

        print(f"\n📦 检查前 {len(speakers)} 条记录:\n")

        all_valid = True

        for speaker in speakers:
            print(f"说话人: {speaker['name']} (ID: {speaker['id']})")

            vp_data = speaker['voiceprintData']

            # 检查是否是字符串（文件路径）还是对象（embedding数据）
            if isinstance(vp_data, str):
                print(f"   ❌ 错误：存储的是字符串（可能是文件路径）")
                print(f"   内容: {vp_data[:100]}...")
                all_valid = False

            elif isinstance(vp_data, dict):
                # 检查是否包含 features 字段
                if 'features' in vp_data:
                    features = vp_data['features']

                    if isinstance(features, list) and len(features) > 0:
                        print(f"   ✅ 正确：存储的是embedding向量数组")
                        print(f"   维度: {len(features)}")
                        print(f"   前5个值: {features[:5]}")

                        # 检查其他元数据
                        if 'featureDim' in vp_data:
                            print(f"   特征维度标记: {vp_data['featureDim']}")
                        if 'extractedAt' in vp_data:
                            print(f"   提取时间: {vp_data['extractedAt']}")
                    else:
                        print(f"   ❌ 错误：features 不是有效的数组")
                        all_valid = False
                else:
                    print(f"   ❌ 错误：缺少 features 字段")
                    print(f"   实际字段: {list(vp_data.keys())}")
                    all_valid = False
            else:
                print(f"   ❌ 错误：未知的数据类型 {type(vp_data)}")
                all_valid = False

            print()

        cursor.close()

        if all_valid:
            print("✅ 所有声纹数据格式正确")
            return True
        else:
            print("❌ 部分声纹数据格式错误")
            return False

    except Exception as e:
        print(f"❌ 检查embedding内容失败: {e}")
        return False

def check_embedding_dimensions(conn):
    """第4步：检查embedding格式和维度"""
    print("\n" + "="*60)
    print("📏 第4步：检查embedding格式和维度")
    print("="*60)

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT id, name, "voiceprintData"
            FROM "Speaker"
            WHERE "profileStatus" = 'ENROLLED'
            AND "voiceprintData" IS NOT NULL
        """)

        speakers = cursor.fetchall()

        if not speakers:
            print("❌ 没有找到声纹数据")
            cursor.close()
            return False

        print(f"\n检查 {len(speakers)} 个声纹的维度:\n")

        dimension_stats = {}
        all_valid = True

        for speaker in speakers:
            vp_data = speaker['voiceprintData']

            if isinstance(vp_data, dict) and 'features' in vp_data:
                features = vp_data['features']
                dim = len(features)

                dimension_stats[dim] = dimension_stats.get(dim, 0) + 1

                # 检查是否是预期的维度（78维MFCC 或 512维pyannote）
                if dim == 78:
                    status = "✅ MFCC特征"
                elif dim == 512:
                    status = "✅ Pyannote特征"
                else:
                    status = "⚠️  非标准维度"
                    all_valid = False

                print(f"   {speaker['name']}: {dim}维 {status}")

                # 验证所有值都是数字
                if not all(isinstance(x, (int, float)) for x in features[:10]):
                    print(f"      ❌ 错误：包含非数字值")
                    all_valid = False
            else:
                print(f"   {speaker['name']}: ❌ 无效数据")
                all_valid = False

        print("\n📊 维度统计:")
        for dim, count in sorted(dimension_stats.items()):
            print(f"   {dim}维: {count} 个声纹")

        # 检查维度一致性
        if len(dimension_stats) == 1:
            print("\n✅ 所有声纹维度一致")
        else:
            print("\n⚠️  警告：声纹维度不一致！")
            all_valid = False

        cursor.close()
        return all_valid

    except Exception as e:
        print(f"❌ 检查embedding维度失败: {e}")
        return False

def test_similarity_calculation(conn):
    """第5步：测试相似度计算"""
    print("\n" + "="*60)
    print("🧮 第5步：测试相似度计算")
    print("="*60)

    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("""
            SELECT id, name, "voiceprintData"
            FROM "Speaker"
            WHERE "profileStatus" = 'ENROLLED'
            AND "voiceprintData" IS NOT NULL
            LIMIT 3
        """)

        speakers = cursor.fetchall()

        if len(speakers) < 2:
            print("⚠️  需要至少2个声纹才能测试相似度计算")
            cursor.close()
            return True

        print(f"\n使用 {len(speakers)} 个声纹进行相似度测试:\n")

        # 提取所有embeddings
        embeddings = []
        names = []

        for speaker in speakers:
            vp_data = speaker['voiceprintData']
            if isinstance(vp_data, dict) and 'features' in vp_data:
                embeddings.append(np.array(vp_data['features']))
                names.append(speaker['name'])

        if len(embeddings) < 2:
            print("❌ 没有足够的有效embedding进行测试")
            cursor.close()
            return False

        # 计算相似度矩阵
        print("📊 相似度矩阵 (余弦相似度):\n")
        print("     ", end="")
        for name in names:
            print(f"{name:>12}", end="")
        print()

        for i, emb1 in enumerate(embeddings):
            print(f"{names[i]:>10}", end="")
            for j, emb2 in enumerate(embeddings):
                if i == j:
                    similarity = 1.0  # 自己和自己相似度为1
                else:
                    similarity = 1 - cosine(emb1, emb2)

                print(f"{similarity:>12.4f}", end="")
            print()

        # 测试阈值判断
        print("\n🎯 阈值测试 (threshold = 0.7):")
        threshold = 0.7

        for i in range(len(embeddings)):
            for j in range(i + 1, len(embeddings)):
                similarity = 1 - cosine(embeddings[i], embeddings[j])

                if similarity >= threshold:
                    status = "✅ 识别为同一人"
                else:
                    status = "❌ 识别为不同人"

                print(f"   {names[i]} vs {names[j]}: {similarity:.4f} {status}")

        print("\n💡 说明:")
        print("   - 相似度范围: [0, 1]")
        print("   - 1.0 = 完全相同")
        print("   - 0.0 = 完全不同")
        print("   - ≥0.7 = 识别为同一人")
        print("   - <0.7 = 识别为不同人")

        cursor.close()
        return True

    except Exception as e:
        print(f"❌ 相似度计算测试失败: {e}")
        return False

def main():
    """主函数"""
    print("\n" + "="*60)
    print("🔬 声纹数据库验证工具")
    print("="*60)
    print("\n本工具将验证以下内容:")
    print("1. 数据库表结构是否正确")
    print("2. 声纹记录数量统计")
    print("3. Embedding数据内容格式")
    print("4. Embedding维度一致性")
    print("5. 相似度计算功能")

    # 连接数据库
    conn = connect_to_database()

    results = []

    # 执行所有检查
    try:
        results.append(("表结构检查", check_table_structure(conn)))
        results.append(("声纹数量检查", check_voiceprint_count(conn)))
        results.append(("数据内容检查", check_embedding_content(conn)))
        results.append(("维度检查", check_embedding_dimensions(conn)))
        results.append(("相似度测试", test_similarity_calculation(conn)))

    finally:
        conn.close()
        print("\n✅ 数据库连接已关闭")

    # 输出总结
    print("\n" + "="*60)
    print("📋 验证结果总结")
    print("="*60)

    passed = 0
    failed = 0

    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name:20} {status}")
        if result:
            passed += 1
        else:
            failed += 1

    print("\n" + "="*60)
    print(f"总计: {passed} 通过, {failed} 失败")
    print("="*60)

    if failed == 0:
        print("\n🎉 所有检查通过！声纹数据库配置正确。")
        return 0
    else:
        print(f"\n⚠️  {failed} 项检查失败，请根据上述错误信息进行修复。")
        return 1

if __name__ == "__main__":
    sys.exit(main())
