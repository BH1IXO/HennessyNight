/**
 * 健康检查路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /health
 * 系统健康检查
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();

  // 检查数据库连接
  let dbHealthy = false;
  let dbLatency = 0;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
    dbHealthy = true;
  } catch (error) {
    console.error('数据库健康检查失败:', error);
  }

  // 检查Redis连接（如果配置了）
  let redisHealthy = false;
  if (process.env.REDIS_URL) {
    try {
      // TODO: Redis健康检查
      redisHealthy = true;
    } catch (error) {
      console.error('Redis健康检查失败:', error);
    }
  }

  // 系统信息
  const healthData = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: {
        status: dbHealthy ? 'up' : 'down',
        latency: `${dbLatency}ms`
      },
      redis: process.env.REDIS_URL ? {
        status: redisHealthy ? 'up' : 'down'
      } : undefined
    },
    system: {
      platform: process.platform,
      nodeVersion: process.version,
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`
      },
      cpu: process.cpuUsage()
    },
    responseTime: `${Date.now() - startTime}ms`
  };

  const statusCode = dbHealthy ? 200 : 503;
  res.status(statusCode).json(healthData);
}));

export default router;
