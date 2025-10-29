/**
 * 快速数据库检查脚本
 * 查看数据库中是否真的存储了声纹向量
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDatabase() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 声纹数据库检查工具');
  console.log('='.repeat(60));

  try {
    // 查询所有已注册声纹的说话人
    const speakers = await prisma.speaker.findMany({
      where: {
        profileStatus: 'ENROLLED',
        voiceprintData: { not: null }
      },
      select: {
        id: true,
        name: true,
        email: true,
        profileStatus: true,
        voiceprintData: true,
        createdAt: true
      }
    });

    console.log(`\n📊 数据库统计:`);
    console.log(`   总共找到 ${speakers.length} 个已注册声纹\n`);

    if (speakers.length === 0) {
      console.log('❌ 数据库中没有已注册的声纹！');
      console.log('   请先通过前端或API注册声纹。\n');
      return;
    }

    // 检查每个说话人的声纹数据
    for (let i = 0; i < speakers.length; i++) {
      const speaker = speakers[i];
      console.log(`${i + 1}. 说话人: ${speaker.name}`);
      console.log(`   ID: ${speaker.id}`);
      console.log(`   Email: ${speaker.email || '(无)'}`);
      console.log(`   注册时间: ${speaker.createdAt.toLocaleString()}`);

      const vpData = speaker.voiceprintData;

      if (!vpData) {
        console.log(`   ❌ 错误：voiceprintData 为空`);
      } else if (typeof vpData === 'string') {
        console.log(`   ❌ 错误：voiceprintData 是字符串（文件路径）`);
        console.log(`   内容: ${vpData.substring(0, 100)}...`);
      } else if (typeof vpData === 'object') {
        if (vpData.features && Array.isArray(vpData.features)) {
          console.log(`   ✅ 正确：voiceprintData 包含 features 数组`);
          console.log(`   特征维度: ${vpData.features.length}`);
          console.log(`   前5个值: [${vpData.features.slice(0, 5).map(v => v.toFixed(3)).join(', ')}]`);

          if (vpData.featureDim) {
            console.log(`   特征维度标记: ${vpData.featureDim}`);
          }

          if (vpData.extractedAt) {
            console.log(`   提取时间: ${vpData.extractedAt}`);
          }

          // 验证所有值都是数字
          const allNumbers = vpData.features.slice(0, 10).every(v => typeof v === 'number' && !isNaN(v));
          if (allNumbers) {
            console.log(`   ✅ 数据类型: 所有值都是有效的数字`);
          } else {
            console.log(`   ❌ 错误: 包含非数字值`);
          }
        } else {
          console.log(`   ❌ 错误：voiceprintData 缺少 features 字段或格式错误`);
          console.log(`   实际字段: ${Object.keys(vpData).join(', ')}`);
        }
      } else {
        console.log(`   ❌ 错误：未知的数据类型 ${typeof vpData}`);
      }

      console.log('');
    }

    // 总结
    console.log('='.repeat(60));
    const validCount = speakers.filter(s => {
      const vpData = s.voiceprintData;
      return vpData && typeof vpData === 'object' && vpData.features && Array.isArray(vpData.features);
    }).length;

    console.log(`\n📋 验证结果:`);
    console.log(`   ✅ 有效声纹: ${validCount}/${speakers.length}`);
    console.log(`   ❌ 无效声纹: ${speakers.length - validCount}/${speakers.length}`);

    if (validCount === speakers.length) {
      console.log(`\n🎉 所有声纹数据格式正确！`);
      console.log(`   系统正在使用真实的embedding向量进行声纹识别。`);
    } else {
      console.log(`\n⚠️  部分声纹数据格式错误，需要修复！`);
    }

    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ 数据库查询失败:', error);
    console.error('   请确保：');
    console.error('   1. PostgreSQL 服务正在运行');
    console.error('   2. 数据库连接配置正确 (.env 文件)');
    console.error('   3. 已运行 Prisma 迁移 (npx prisma migrate dev)\n');
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase().catch(console.error);
