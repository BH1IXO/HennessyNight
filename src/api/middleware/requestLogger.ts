/**
 * 请求日志中间件
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // 记录响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // 控制台输出
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);

    // 异步保存到数据库（不阻塞响应）
    if (process.env.ENABLE_API_LOGGING === 'true') {
      saveApiLog({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
        ip: req.ip
      }).catch(error => {
        console.error('保存API日志失败:', error);
      });
    }
  });

  next();
}

/**
 * 保存API日志到数据库
 */
async function saveApiLog(data: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
}): Promise<void> {
  try {
    await prisma.apiUsage.create({
      data: {
        endpoint: `${data.method} ${data.path}`,
        method: data.method,
        responseTime: data.duration,
        userId: 'system', // TODO: Get actual userId from request
        date: new Date()
      }
    });
  } catch (error) {
    // 忽略日志保存错误，不影响主流程
    console.error('API日志保存错误:', error);
  }
}
