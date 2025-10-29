/**
 * 服务器入口文件
 */

import * as dotenv from 'dotenv';
import { createApp } from './app';
import http from 'http';

// 加载环境变量
dotenv.config();

// 验证必需的环境变量
const requiredEnvVars = [
  'DATABASE_URL',
  'IFLYTEK_APP_ID',
  'IFLYTEK_API_KEY',
  'IFLYTEK_API_SECRET',
  'DEEPSEEK_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingEnvVars.length > 0) {
  console.error('❌ 缺少必需的环境变量:', missingEnvVars.join(', '));
  console.error('请检查 .env 文件');
  process.exit(1);
}

// 创建Express应用
const app = createApp();

// 配置端口
const PORT = parseInt(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';

// 创建HTTP服务器
const server = http.createServer(app);

// 启动服务器
server.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('🚀 Meeting System Backend Server');
  console.log('='.repeat(60));
  console.log();
  console.log(`📡 Server running on: http://${HOST}:${PORT}`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📚 API Documentation: http://${HOST}:${PORT}/api/v1/docs`);
  console.log();
  console.log('环境配置:');
  console.log(`  - Node 版本: ${process.version}`);
  console.log(`  - 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  - 数据库: ${process.env.DATABASE_URL?.includes('@') ? '已配置' : '未配置'}`);
  console.log(`  - Redis: ${process.env.REDIS_URL ? '已配置' : '未配置'}`);
  console.log(`  - 讯飞语音: ${process.env.IFLYTEK_APP_ID ? '已配置' : '未配置'}`);
  console.log(`  - DeepSeek AI: ${process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置'}`);
  console.log(`  - pyannote 设备: ${process.env.PYANNOTE_DEVICE || 'cpu'}`);
  console.log();
  console.log('可用功能:');
  console.log('  ✅ 会议管理 (Meetings API)');
  console.log('  ✅ 说话人管理 (Speakers API)');
  console.log('  ✅ 转录服务 (Transcripts API)');
  console.log('  ✅ AI 纪要生成 (Summaries API)');
  console.log('  ✅ 音频处理 (Audio API)');
  console.log('  ✅ 实时识别会话 (Sessions API)');
  console.log('  ⏳ WebSocket 实时通信 (即将推出)');
  console.log();
  console.log('='.repeat(60));
});

// 错误处理
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  switch (error.code) {
    case 'EACCES':
      console.error(`❌ 端口 ${PORT} 需要提升权限`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ 端口 ${PORT} 已被占用`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});

// 导出服务器实例（用于测试）
export { server, app };
