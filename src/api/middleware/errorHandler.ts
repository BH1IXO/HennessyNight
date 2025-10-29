/**
 * 错误处理中间件
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

/**
 * 全局错误处理中间件
 */
export function errorHandler(
  error: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 默认500错误
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';
  let details = error.details;

  // Prisma错误处理
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    ({ statusCode, message, code, details } = handlePrismaError(error));
  }

  // Prisma验证错误
  if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid data provided';
    code = 'VALIDATION_ERROR';
  }

  // 开发环境返回完整错误栈
  const response: any = {
    error: {
      code,
      message,
      ...(details && { details })
    }
  };

  if (process.env.NODE_ENV === 'development') {
    response.error.stack = error.stack;
    response.error.path = req.path;
    response.error.method = req.method;
  }

  // 记录错误日志
  console.error('❌ 错误:', {
    code,
    message,
    path: req.path,
    method: req.method,
    stack: error.stack
  });

  res.status(statusCode).json(response);
}

/**
 * 处理Prisma错误
 */
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
  statusCode: number;
  message: string;
  code: string;
  details?: any;
} {
  switch (error.code) {
    case 'P2002':
      // 唯一约束冲突
      return {
        statusCode: 409,
        message: 'A record with this value already exists',
        code: 'DUPLICATE_ENTRY',
        details: error.meta
      };

    case 'P2025':
      // 记录未找到
      return {
        statusCode: 404,
        message: 'Record not found',
        code: 'NOT_FOUND',
        details: error.meta
      };

    case 'P2003':
      // 外键约束失败
      return {
        statusCode: 400,
        message: 'Foreign key constraint failed',
        code: 'FOREIGN_KEY_ERROR',
        details: error.meta
      };

    case 'P2014':
      // 必需字段缺失
      return {
        statusCode: 400,
        message: 'Required field is missing',
        code: 'MISSING_FIELD',
        details: error.meta
      };

    default:
      return {
        statusCode: 500,
        message: 'Database operation failed',
        code: 'DATABASE_ERROR',
        details: error.meta
      };
  }
}

/**
 * 创建自定义错误
 */
export function createError(
  message: string,
  statusCode: number = 500,
  code?: string,
  details?: any
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

/**
 * 异步路由错误包装器
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
