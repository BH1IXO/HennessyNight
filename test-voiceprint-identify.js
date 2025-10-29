/**
 * 测试声纹识别功能
 * 使用已注册的声纹进行识别测试
 */

const { PrismaClient } = require('@prisma/client');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const prisma = new PrismaClient();

async function testVoiceprintIdentification() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 声纹识别功能测试');
  console.log('='.repeat(60));

  try {
    // 第1步：获取所有已注册声纹
    console.log('\n📊 第1步：查询数据库中的已注册声纹...');
    const speakers = await prisma.speaker.findMany({
      where: {
        profileStatus: 'ENROLLED',
        voiceprintData: { not: null }
      },
      select: {
        id: true,
        name: true,
        voiceprintData: true,
        voiceFile: true
      }
    });

    console.log(`   ✅ 找到 ${speakers.length} 个已注册声纹`);

    if (speakers.length === 0) {
      console.log('   ❌ 错误：数据库中没有已注册声纹！');
      console.log('   请先通过前端或API注册声纹。\n');
      return;
    }

    speakers.forEach((speaker, index) => {
      console.log(`   ${index + 1}. ${speaker.name} (ID: ${speaker.id.substring(0, 8)}...)`);
      const vpData = speaker.voiceprintData;
      if (vpData && vpData.features) {
        console.log(`      - embedding维度: ${vpData.features.length}`);
        console.log(`      - 音频文件: ${speaker.voiceFile || '(无)'}`);
      }
    });

    // 第2步：构建声纹数据库
    console.log('\n🔨 第2步：构建声纹数据库...');
    const voiceprintDatabase = {};
    for (const speaker of speakers) {
      const vpData = speaker.voiceprintData;
      if (vpData && vpData.features) {
        voiceprintDatabase[speaker.id] = vpData.features;
      }
    }
    console.log(`   ✅ 声纹数据库构建完成，包含 ${Object.keys(voiceprintDatabase).length} 个说话人`);

    // 第3步：测试每个说话人的音频文件
    console.log('\n🎤 第3步：测试声纹识别...');
    console.log('   说明：使用注册时的音频文件进行自我识别测试\n');

    for (const speaker of speakers) {
      const audioFile = speaker.voiceFile;
      if (!audioFile || !require('fs').existsSync(audioFile)) {
        console.log(`   ⚠️  ${speaker.name}: 音频文件不存在，跳过测试`);
        continue;
      }

      console.log(`   测试说话人: ${speaker.name}`);
      console.log(`   音频文件: ${audioFile}`);

      // 保存临时声纹数据库
      const dbPath = path.join(process.cwd(), 'temp', `test_db_${Date.now()}.json`);
      await fs.writeFile(dbPath, JSON.stringify(voiceprintDatabase));

      // 调用Python脚本进行识别
      const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const scriptPath = path.join(process.cwd(), 'python', 'simple_voiceprint.py');

      const result = await new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, [scriptPath, 'identify', audioFile, dbPath]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        pythonProcess.on('close', async (code) => {
          // 删除临时文件
          try {
            await fs.unlink(dbPath);
          } catch (e) {
            // 忽略
          }

          if (code === 0) {
            try {
              resolve(JSON.parse(stdout));
            } catch (e) {
              reject(new Error('Failed to parse identification result'));
            }
          } else {
            reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          }
        });

        pythonProcess.on('error', (error) => {
          reject(error);
        });
      });

      // 分析结果
      if (result.identified) {
        const identifiedSpeaker = speakers.find(s => s.id === result.speaker_id);
        const isCorrect = identifiedSpeaker && identifiedSpeaker.id === speaker.id;
        const status = isCorrect ? '✅ 正确' : '❌ 错误';

        console.log(`   ${status} 识别结果: ${identifiedSpeaker?.name || '未知'} (置信度: ${(result.confidence * 100).toFixed(1)}%)`);

        if (!isCorrect) {
          console.log(`      ⚠️  预期: ${speaker.name}, 实际: ${identifiedSpeaker?.name || '未知'}`);
        }

        // 显示所有候选人
        if (result.all_candidates && result.all_candidates.length > 1) {
          console.log('   排名:');
          result.all_candidates.slice(0, 3).forEach((candidate, index) => {
            const candidateSpeaker = speakers.find(s => s.id === candidate.speaker_id);
            console.log(`      ${index + 1}. ${candidateSpeaker?.name || '未知'}: ${(candidate.confidence * 100).toFixed(2)}%`);
          });
        }
      } else {
        console.log(`   ❌ 识别失败: 置信度不足 (最高: ${(result.confidence * 100).toFixed(1)}%)`);
      }

      console.log('');
    }

    // 第4步：总结
    console.log('='.repeat(60));
    console.log('📋 测试总结');
    console.log('='.repeat(60));
    console.log('\n说明：');
    console.log('✅ 正确: 说话人自己的声音被正确识别');
    console.log('❌ 错误: 说话人被识别为其他人');
    console.log('\n如果所有测试都正确，说明声纹识别功能正常工作。');
    console.log('如果出现错误，可能原因：');
    console.log('1. 音频质量差或背景噪音大');
    console.log('2. 声纹特征提取不稳定');
    console.log('3. 阈值设置过低或过高');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error('   请确保：');
    console.error('   1. PostgreSQL 服务正在运行');
    console.error('   2. Python环境配置正确');
    console.error('   3. 已安装必要的依赖 (librosa, scipy)\n');
  } finally {
    await prisma.$disconnect();
  }
}

testVoiceprintIdentification().catch(console.error);
