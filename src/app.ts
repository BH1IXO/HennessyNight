// 首先加载环境变量 - 必须在所有imports之前！
require('dotenv').config({ override: true });

/**
 * Express Application 配置
 *
 * 主应用入口，配置中间件、路由和错误处理
 */

// 调试环境变量加载结果
console.log('[App.ts] 环境变量已加载（override=true）');
console.log('[App.ts] SMTP配置:');
console.log(`  SMTP_HOST = '${process.env.SMTP_HOST}'`);
console.log(`  SMTP_PORT = '${process.env.SMTP_PORT}'`);
console.log(`  SMTP_USER = '${process.env.SMTP_USER}'`);
console.log(`  SMTP_PASS length = ${process.env.SMTP_PASS?.length || 0}`);

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';

// 导入路由
import meetingsRouter from './api/routes/meetings';
import speakersRouter from './api/routes/speakers';
import transcriptsRouter from './api/routes/transcripts';
import summariesRouter from './api/routes/summaries';
import audioRouter from './api/routes/audio';
import sessionsRouter from './api/routes/sessions';
import termsRouter from './api/routes/terms';
import emailRouter from './api/routes/email';
import healthRouter from './api/routes/health';

// 导入中间件
import { errorHandler } from './api/middleware/errorHandler';
import { requestLogger } from './api/middleware/requestLogger';
import { rateLimiter } from './api/middleware/rateLimiter';

// 初始化Prisma
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
});

/**
 * 创建Express应用
 */
export function createApp(): Express {
  const app = express();

  // ============= 基础中间件 =============

  // 安全头
  app.use(helmet());

  // CORS配置
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // 请求体解析
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 压缩响应
  app.use(compression());

  // HTTP日志
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // 自定义请求日志
  app.use(requestLogger);

  // 速率限制
  app.use(rateLimiter);

  // ============= 静态文件服务 =============

  // 提供前端页面
  app.use(express.static('frontend/dist'));

  // ============= API路由 =============

  // API版本前缀
  const API_PREFIX = '/api/v1';

  // 健康检查
  app.use('/health', healthRouter);
  app.use(`${API_PREFIX}/health`, healthRouter);

  // 业务路由
  app.use(`${API_PREFIX}/meetings`, meetingsRouter);
  app.use(`${API_PREFIX}/speakers`, speakersRouter);
  app.use(`${API_PREFIX}/transcripts`, transcriptsRouter);
  app.use(`${API_PREFIX}/summaries`, summariesRouter);
  app.use(`${API_PREFIX}/audio`, audioRouter);
  app.use(`${API_PREFIX}/sessions`, sessionsRouter);
  app.use(`${API_PREFIX}/terms`, termsRouter);
  app.use(`${API_PREFIX}/email`, emailRouter);

  // 根路由 - 前端页面由静态文件中间件自动处理
  // 如果访问根路径且没有找到 index.html，显示API信息
  app.get('/api', (req: Request, res: Response) => {
    res.json({
      name: 'Meeting System API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        api: `${API_PREFIX}/`,
        docs: `${API_PREFIX}/docs`
      }
    });
  });

  // API文档路由（简单版本）
  app.get(`${API_PREFIX}/docs`, (req: Request, res: Response) => {
    res.json({
      title: 'Meeting System API Documentation',
      version: '1.0.0',
      baseUrl: `${API_PREFIX}`,
      endpoints: {
        meetings: {
          list: 'GET /meetings',
          create: 'POST /meetings',
          get: 'GET /meetings/:id',
          update: 'PUT /meetings/:id',
          delete: 'DELETE /meetings/:id',
          finish: 'POST /meetings/:id/finish'
        },
        speakers: {
          list: 'GET /speakers',
          create: 'POST /speakers',
          get: 'GET /speakers/:id',
          update: 'PUT /speakers/:id',
          delete: 'DELETE /speakers/:id',
          enroll: 'POST /speakers/:id/enroll'
        },
        transcripts: {
          get: 'GET /transcripts/meeting/:meetingId',
          create: 'POST /transcripts'
        },
        summaries: {
          generate: 'POST /summaries/generate',
          get: 'GET /summaries/meeting/:meetingId',
          regenerate: 'POST /summaries/:id/regenerate'
        },
        audio: {
          upload: 'POST /audio/upload',
          process: 'POST /audio/process'
        },
        sessions: {
          create: 'POST /sessions/create',
          destroy: 'DELETE /sessions/:id',
          send: 'POST /sessions/:id/audio',
          status: 'GET /sessions/:id/status'
        },
        terms: {
          list: 'GET /terms',
          create: 'POST /terms',
          batch: 'POST /terms/batch',
          get: 'GET /terms/:id',
          update: 'PUT /terms/:id',
          delete: 'DELETE /terms/:id'
        }
      }
    });
  });

  // ============= 错误处理 =============

  // 404处理
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path
    });
  });

  // 全局错误处理
  app.use(errorHandler);

  return app;
}

/**
 * 优雅关闭
 */
export async function gracefulShutdown(): Promise<void> {
  console.log('🛑 收到关闭信号，正在优雅关闭...');

  try {
    // 关闭Prisma连接
    await prisma.$disconnect();
    console.log('✅ 数据库连接已关闭');

    // 这里可以添加其他清理逻辑
    // - 关闭WebSocket连接
    // - 停止任务队列
    // - 清理临时文件
    // - 等待正在进行的请求完成

    console.log('✅ 应用已优雅关闭');
    process.exit(0);

  } catch (error) {
    console.error('❌ 关闭过程中出错:', error);
    process.exit(1);
  }
}

// 监听关闭信号
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未捕获的Promise拒绝
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
});

// 未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  gracefulShutdown();
});

export default createApp;

// ============= 启动服务器 =============

// 仅在直接运行此文件时启动服务器（不是在测试中导入）
if (require.main === module || process.env.NODE_ENV !== 'test') {
  const app = createApp();
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log('🚀 服务器已启动');
    console.log(`📍 监听地址: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`🏥 健康检查: http://localhost:${PORT}/health`);
    console.log(`📚 API文档: http://localhost:${PORT}/api/v1/docs`);
    console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
    console.log('✨ 准备接收请求...\n');
  });
}
