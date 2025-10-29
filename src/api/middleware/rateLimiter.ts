/**
 * 速率限制中间件
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// 创建Redis客户端（如果配置了REDIS_URL）
let redisClient: Redis | undefined;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
}

/**
 * 通用速率限制配置
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP最多100个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later'
    }
  },
  // 如果有Redis，使用Redis存储
  store: redisClient ? new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'rate_limit:'
  }) : undefined
});

/**
 * 严格速率限制（用于敏感操作）
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 10, // 每个IP最多10个请求
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      message: 'Too many sensitive operations from this IP, please try again later'
    }
  },
  store: redisClient ? new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'strict_rate_limit:'
  }) : undefined
});

/**
 * 上传速率限制
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 每个IP最多5次上传
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      message: 'Too many uploads from this IP, please try again later'
    }
  },
  store: redisClient ? new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'upload_rate_limit:'
  }) : undefined
});
