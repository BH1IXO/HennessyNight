/**
 * 知识库术语管理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// 验证Schema
const createTermSchema = z.object({
  term: z.string().min(1).max(100),
  definition: z.string().min(1),
  category: z.string().optional(),
  synonyms: z.array(z.string()).optional(),
  source: z.string().optional()
});

/**
 * GET /api/v1/terms
 * 获取术语列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { category, search, limit = '50', offset = '0' } = req.query;

  const where: any = {};

  if (category && typeof category === 'string') {
    where.category = category;
  }

  if (search && typeof search === 'string') {
    where.OR = [
      { term: { contains: search, mode: 'insensitive' } },
      { definition: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [terms, total] = await Promise.all([
    prisma.term.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: 'desc' }
    }),
    prisma.term.count({ where })
  ]);

  res.json({
    data: terms,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    }
  });
}));

/**
 * POST /api/v1/terms
 * 创建术语（支持去重）
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const validated = createTermSchema.parse(req.body);

  console.log('[Terms API] 创建术语:', validated.term);

  // 检查术语是否已存在（去重）
  const existingTerm = await prisma.term.findFirst({
    where: {
      term: {
        equals: validated.term,
        mode: 'insensitive'
      }
    }
  });

  if (existingTerm) {
    console.log('[Terms API] 术语已存在，跳过:', validated.term);
    res.status(200).json({
      message: '术语已存在',
      data: existingTerm,
      skipped: true
    });
    return;
  }

  // 创建新术语
  const term = await prisma.term.create({
    data: {
      term: validated.term,
      definition: validated.definition,
      category: validated.category,
      synonyms: validated.synonyms || [],
      source: validated.source
    }
  });

  console.log('[Terms API] 术语创建成功:', term.id);

  res.status(201).json({
    message: '术语创建成功',
    data: term
  });
}));

/**
 * POST /api/v1/terms/batch
 * 批量创建术语（自动去重）
 */
router.post('/batch', asyncHandler(async (req: Request, res: Response) => {
  const { terms } = req.body;

  if (!Array.isArray(terms)) {
    throw createError('terms must be an array', 400, 'INVALID_INPUT');
  }

  console.log('[Terms API] 批量创建术语, 数量:', terms.length);

  const results = {
    created: [] as any[],
    skipped: [] as any[],
    failed: [] as any[]
  };

  for (const termData of terms) {
    try {
      // 验证数据
      const validated = createTermSchema.parse(termData);

      // 检查是否已存在
      const existingTerm = await prisma.term.findFirst({
        where: {
          term: {
            equals: validated.term,
            mode: 'insensitive'
          }
        }
      });

      if (existingTerm) {
        results.skipped.push({
          term: validated.term,
          reason: '术语已存在'
        });
        continue;
      }

      // 创建术语
      const term = await prisma.term.create({
        data: {
          term: validated.term,
          definition: validated.definition,
          category: validated.category,
          synonyms: validated.synonyms || [],
          source: validated.source
        }
      });

      results.created.push(term);
    } catch (error: any) {
      results.failed.push({
        term: termData.term,
        reason: error.message
      });
    }
  }

  console.log('[Terms API] 批量创建完成:', {
    created: results.created.length,
    skipped: results.skipped.length,
    failed: results.failed.length
  });

  res.json({
    message: '批量创建完成',
    data: results
  });
}));

/**
 * GET /api/v1/terms/:id
 * 获取术语详情
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const term = await prisma.term.findUnique({
    where: { id }
  });

  if (!term) {
    throw createError('Term not found', 404, 'TERM_NOT_FOUND');
  }

  res.json({ data: term });
}));

/**
 * PUT /api/v1/terms/:id
 * 更新术语
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validated = createTermSchema.partial().parse(req.body);

  const term = await prisma.term.update({
    where: { id },
    data: validated
  });

  res.json({
    message: '术语更新成功',
    data: term
  });
}));

/**
 * DELETE /api/v1/terms/:id
 * 删除术语
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.term.delete({ where: { id } });

  console.log('[Terms API] 术语已删除:', id);

  res.json({ message: '术语删除成功' });
}));

export default router;
