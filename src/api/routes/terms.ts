/**
 * 知识库术语管理路由
 * 使用 SQLite 数据库
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import { KnowledgeBaseDB } from '../../db/knowledgebase';

const router = Router();

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
  const { category, search, limit = '100', offset = '0' } = req.query;

  console.log('[Terms API] 获取术语列表, category:', category, 'search:', search);

  let terms;

  if (search && typeof search === 'string') {
    // 如果有搜索关键词，使用搜索功能
    terms = KnowledgeBaseDB.search(search, category as string);
  } else {
    // 否则获取所有词条
    terms = KnowledgeBaseDB.getAll(parseInt(limit as string), parseInt(offset as string));

    // 如果有分类筛选
    if (category && typeof category === 'string') {
      terms = terms.filter(t => t.category === category);
    }
  }

  const total = KnowledgeBaseDB.count();

  console.log('[Terms API] 返回术语数量:', terms.length, '总数:', total);

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

  // 先检查词条是否已存在
  const existingTerms = KnowledgeBaseDB.search(validated.term);
  const existingTerm = existingTerms.find(t => t.term === validated.term);

  if (existingTerm) {
    console.log('[Terms API] 术语已存在，拒绝创建:', validated.term);

    res.status(200).json({
      message: '术语已存在',
      data: existingTerm,
      skipped: true
    });
    return;
  }

  try {
    const term = KnowledgeBaseDB.create({
      term: validated.term,
      definition: validated.definition,
      category: validated.category,
      synonyms: validated.synonyms,
      source: validated.source
    });

    console.log('[Terms API] 术语创建成功:', term.id);

    res.status(201).json({
      message: '术语创建成功',
      data: term
    });
  } catch (error: any) {
    // 如果是重复词条错误（SQLite的UNIQUE约束）
    if (error.message && error.message.includes('UNIQUE')) {
      console.log('[Terms API] 术语已存在（UNIQUE约束）:', validated.term);

      // 获取已存在的词条
      const terms = KnowledgeBaseDB.search(validated.term);
      const term = terms.find(t => t.term === validated.term);

      res.status(200).json({
        message: '术语已存在',
        data: term,
        skipped: true
      });
    } else {
      throw error;
    }
  }
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

      // 尝试创建术语
      const term = KnowledgeBaseDB.create({
        term: validated.term,
        definition: validated.definition,
        category: validated.category,
        synonyms: validated.synonyms,
        source: validated.source
      });

      results.created.push(term);
    } catch (error: any) {
      // 如果是重复词条
      if (error.message && error.message.includes('UNIQUE')) {
        results.skipped.push({
          term: termData.term,
          reason: '术语已存在'
        });
      } else {
        results.failed.push({
          term: termData.term,
          reason: error.message
        });
      }
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

  const term = KnowledgeBaseDB.getById(id);

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

  const term = KnowledgeBaseDB.update(id, validated);

  if (!term) {
    throw createError('Term not found', 404, 'TERM_NOT_FOUND');
  }

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

  const success = KnowledgeBaseDB.delete(id);

  if (!success) {
    throw createError('Term not found', 404, 'TERM_NOT_FOUND');
  }

  console.log('[Terms API] 术语已删除:', id);

  res.json({ message: '术语删除成功' });
}));

export default router;
