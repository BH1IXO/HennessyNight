/**
 * 实时声纹识别引擎演示脚本
 *
 * 演示如何使用引擎进行实时说话人识别
 */

import { getVoiceprintEngineManager } from './VoiceprintEngineManager';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// 加载环境变量
dotenv.config();

const prisma = new PrismaClient();

// ============= 演示配置 =============

interface DemoConfig {
  meetingId: string;
  speakerIds: string[];
}

// ============= 主演示函数 =============

async function runDemo() {
  console.log('='.repeat(60));
  console.log('🎤 实时声纹识别引擎演示');
  console.log('='.repeat(60));
  console.log();

  try {
    // 1. 检查环境变量
    console.log('📋 检查配置...');
    validateEnvVars();
    console.log('✅ 环境变量配置正确\n');

    // 2. 初始化管理器
    console.log('🚀 初始化引擎管理器...');
    const manager = getVoiceprintEngineManager({
      maxConcurrentSessions: 5,
      sessionTimeout: 3600000,      // 1小时
      cleanupInterval: 60000,       // 1分钟

      iflytekConfig: {
        appId: process.env.IFLYTEK_APP_ID!,
        apiKey: process.env.IFLYTEK_API_KEY!,
        apiSecret: process.env.IFLYTEK_API_SECRET!
      },

      pyannoteConfig: {
        modelPath: process.env.PYANNOTE_MODEL_PATH || 'pyannote/speaker-diarization',
        device: (process.env.PYANNOTE_DEVICE as 'cpu' | 'cuda') || 'cpu'
      }
    });
    console.log('✅ 管理器初始化完成\n');

    // 3. 准备测试数据
    console.log('📊 准备测试数据...');
    const demoConfig = await prepareTestData();
    console.log(`✅ 会议ID: ${demoConfig.meetingId}`);
    console.log(`✅ 候选说话人: ${demoConfig.speakerIds.length} 人\n`);

    // 4. 创建识别会话
    console.log('🎬 创建识别会话...');
    const sessionId = await manager.createSession({
      meetingId: demoConfig.meetingId,
      candidateSpeakerIds: demoConfig.speakerIds,
      engineConfig: {
        sampleRate: 16000,
        channels: 1,
        bufferDuration: 3,
        processingInterval: 1000,
        identificationThreshold: 0.75,
        minSpeechDuration: 1.0
      }
    });
    console.log(`✅ 会话已创建: ${sessionId}\n`);

    // 5. 设置事件监听
    setupEventListeners(manager, sessionId);

    // 6. 显示控制台
    console.log('='.repeat(60));
    console.log('🎙️  引擎已启动，准备接收音频');
    console.log('='.repeat(60));
    console.log();
    console.log('控制命令:');
    console.log('  - 输入 "stats" 查看统计信息');
    console.log('  - 输入 "pause" 暂停会话');
    console.log('  - 输入 "resume" 恢复会话');
    console.log('  - 输入 "stop" 停止会话并退出');
    console.log();

    // 7. 模拟音频输入（实际应用中从麦克风或音频流获取）
    console.log('💡 提示: 这是演示模式，实际应用中会从音频流获取数据\n');

    // 8. 交互式命令行
    await runInteractiveShell(manager, sessionId);

  } catch (error) {
    console.error('❌ 演示失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// ============= 辅助函数 =============

/**
 * 验证环境变量
 */
function validateEnvVars(): void {
  const required = [
    'IFLYTEK_APP_ID',
    'IFLYTEK_API_KEY',
    'IFLYTEK_API_SECRET',
    'DATABASE_URL'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`缺少必需的环境变量: ${missing.join(', ')}\n请检查 .env 文件`);
  }
}

/**
 * 准备测试数据
 */
async function prepareTestData(): Promise<DemoConfig> {
  // 查找或创建测试会议
  let meeting = await prisma.meeting.findFirst({
    where: { title: '演示会议' }
  });

  if (!meeting) {
    meeting = await prisma.meeting.create({
      data: {
        title: '演示会议',
        scheduledAt: new Date(),
        status: 'IN_PROGRESS',
        recordingUrl: null
      }
    });
  }

  // 获取已注册的说话人
  const speakers = await prisma.speaker.findMany({
    where: {
      profileStatus: 'ENROLLED'
    },
    take: 10 // 最多10个候选说话人
  });

  // 如果没有已注册说话人，创建示例说话人
  if (speakers.length === 0) {
    console.log('⚠️  警告: 未找到已注册的说话人');
    console.log('💡 提示: 请先使用声纹注册功能添加说话人');
    console.log('    或者引擎将以纯说话人分离模式运行（无法识别具体人员）\n');
  } else {
    console.log(`找到 ${speakers.length} 个已注册说话人:`);
    speakers.forEach((s, i) => {
      console.log(`   ${i + 1}. ${s.name} (ID: ${s.id})`);
    });
    console.log();
  }

  return {
    meetingId: meeting.id,
    speakerIds: speakers.map(s => s.id)
  };
}

/**
 * 设置事件监听器
 */
function setupEventListeners(manager: any, sessionId: string): void {
  let transcriptCount = 0;
  let identificationCount = 0;
  let unknownCount = 0;

  // 转录事件
  manager.on('transcript', (sid: string, segment: any) => {
    if (sid !== sessionId) return;

    transcriptCount++;
    console.log('\n📝 转录结果:');
    console.log(`   文本: ${segment.text}`);
    console.log(`   说话人: ${segment.speakerName || 'Unknown'}`);
    console.log(`   时间: ${segment.startTime.toFixed(1)}s - ${segment.endTime.toFixed(1)}s`);
    console.log(`   置信度: ${(segment.confidence * 100).toFixed(1)}%`);

    if (segment.isUnknownSpeaker) {
      console.log(`   ⚠️  未知说话人`);
    }
  });

  // 说话人识别事件
  manager.on('speaker_identified', (sid: string, speakerId: string, speakerName: string, confidence: number) => {
    if (sid !== sessionId) return;

    identificationCount++;
    console.log('\n✅ 说话人识别:');
    console.log(`   姓名: ${speakerName}`);
    console.log(`   ID: ${speakerId}`);
    console.log(`   置信度: ${(confidence * 100).toFixed(1)}%`);
  });

  // 未知说话人事件
  manager.on('speaker_unknown', (sid: string, embeddingId: string) => {
    if (sid !== sessionId) return;

    unknownCount++;
    console.log('\n❓ 检测到未知说话人:');
    console.log(`   标识: ${embeddingId}`);
    console.log(`   💡 提示: 可以邀请此说话人注册声纹`);
  });

  // 错误事件
  manager.on('error', (sid: string, error: Error) => {
    if (sid !== sessionId) return;

    console.error('\n❌ 错误:', error.message);
  });

  // 状态变化事件
  manager.on('status', (sid: string, status: string) => {
    if (sid !== sessionId) return;

    console.log(`\n📊 状态变化: ${status}`);
  });

  // 定期输出统计
  setInterval(() => {
    console.log('\n' + '─'.repeat(60));
    console.log('📈 实时统计:');
    console.log(`   转录次数: ${transcriptCount}`);
    console.log(`   识别次数: ${identificationCount}`);
    console.log(`   未知说话人: ${unknownCount}`);
    if (transcriptCount > 0) {
      console.log(`   识别率: ${(identificationCount / transcriptCount * 100).toFixed(1)}%`);
    }
    console.log('─'.repeat(60) + '\n');
  }, 30000); // 每30秒输出一次
}

/**
 * 交互式命令行
 */
async function runInteractiveShell(manager: any, sessionId: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question('> ', async (command) => {
      const cmd = command.trim().toLowerCase();

      switch (cmd) {
        case 'stats':
          displayStats(manager);
          break;

        case 'pause':
          manager.pauseSession(sessionId);
          console.log('⏸️  会话已暂停\n');
          break;

        case 'resume':
          manager.resumeSession(sessionId);
          console.log('▶️  会话已恢复\n');
          break;

        case 'stop':
          console.log('\n🛑 正在停止会话...');
          await manager.destroySession(sessionId);
          console.log('✅ 会话已停止\n');
          rl.close();
          return;

        case 'help':
          console.log('\n可用命令:');
          console.log('  stats  - 显示统计信息');
          console.log('  pause  - 暂停会话');
          console.log('  resume - 恢复会话');
          console.log('  stop   - 停止会话并退出');
          console.log('  help   - 显示帮助\n');
          break;

        default:
          if (cmd) {
            console.log(`❌ 未知命令: ${cmd}`);
            console.log('   输入 "help" 查看可用命令\n');
          }
      }

      prompt();
    });
  };

  prompt();
}

/**
 * 显示统计信息
 */
function displayStats(manager: any): void {
  const stats = manager.getStats();

  console.log('\n' + '='.repeat(60));
  console.log('📊 系统统计信息');
  console.log('='.repeat(60));
  console.log(`总会话数: ${stats.totalSessions}`);
  console.log(`活跃会话: ${stats.activeSessions}`);
  console.log(`暂停会话: ${stats.pausedSessions}`);
  console.log(`错误会话: ${stats.errorSessions}`);
  console.log(`最大并发: ${stats.maxConcurrentSessions}`);
  console.log(`会话超时: ${stats.sessionTimeout / 1000}秒`);

  if (stats.sessions.length > 0) {
    console.log('\n会话详情:');
    stats.sessions.forEach((session: any, index: number) => {
      console.log(`\n  会话 #${index + 1}:`);
      console.log(`    ID: ${session.sessionId}`);
      console.log(`    会议ID: ${session.meetingId}`);
      console.log(`    状态: ${session.status}`);
      console.log(`    运行时长: ${(session.uptime / 1000).toFixed(1)}秒`);
      console.log(`    最后活动: ${new Date(session.lastActivityAt).toLocaleString()}`);
    });
  }

  console.log('='.repeat(60) + '\n');
}

// ============= 启动演示 =============

if (require.main === module) {
  runDemo()
    .then(() => {
      console.log('\n👋 演示结束');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ 演示失败:', error);
      process.exit(1);
    });
}

export { runDemo };
