/**
 * 知识库术语管理路由
 * 使用 SQLite 数据库
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import { KnowledgeBaseDB } from '../../db/knowledgebase';
import db from '../../db/knowledgebase';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DocumentParser } from '../../services/document/DocumentParser';
import { DeepSeekService } from '../../services/ai/DeepSeekService';

const router = Router();

// 配置文件上传
const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PDF 和 Word 文档'));
    }
  }
});

// DeepSeek 服务实例
let deepseekService: DeepSeekService | null = null;
try {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) {
    deepseekService = new DeepSeekService({ apiKey });
    console.log('✅ DeepSeek 服务已初始化');
  } else {
    console.warn('⚠️  DEEPSEEK_API_KEY 未设置，文档解析功能将不可用');
  }
} catch (error) {
  console.error('❌ DeepSeek 服务初始化失败:', error);
}

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

/**
 * POST /api/v1/terms/upload-document
 * 上传文档并使用 AI 提取术语
 */
router.post('/upload-document', upload.single('document'), asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    throw createError('请上传文件', 400, 'FILE_REQUIRED');
  }

  if (!deepseekService) {
    throw createError('AI 服务不可用，请检查 DEEPSEEK_API_KEY 配置', 503, 'AI_SERVICE_UNAVAILABLE');
  }

  const { category } = req.body;

  console.log('[Terms API] 开始处理文档上传:', {
    filename: file.originalname,
    size: file.size,
    path: file.path
  });

  try {
    // 1. 解析文档
    const parsedDoc = await DocumentParser.parse(file.path, file.originalname);
    console.log('[Terms API] 文档解析完成:', {
      fileType: parsedDoc.fileType,
      wordCount: parsedDoc.wordCount,
      textLength: parsedDoc.text.length
    });

    // 2. 清理文本
    const cleanedText = DocumentParser.cleanText(parsedDoc.text);

    // 3. 使用 AI 提取术语
    console.log('[Terms API] 开始 AI 提取术语...');
    const extractedTerms = await deepseekService.extractTermsFromDocument(cleanedText, category);

    console.log('[Terms API] AI 提取完成，术语数量:', extractedTerms.length);

    // 4. 批量导入术语
    const importResults = {
      created: [] as any[],
      skipped: [] as any[],
      failed: [] as any[]
    };

    for (const termData of extractedTerms) {
      try {
        // 检查是否已存在
        const existingTerms = KnowledgeBaseDB.search(termData.term);
        const existingTerm = existingTerms.find(t => t.term === termData.term);

        if (existingTerm) {
          importResults.skipped.push({
            term: termData.term,
            reason: '术语已存在'
          });
          continue;
        }

        // 创建术语
        const term = KnowledgeBaseDB.create({
          term: termData.term,
          definition: termData.definition,
          category: termData.category || category,
          synonyms: termData.synonyms,
          source: file.originalname
        });

        importResults.created.push(term);

      } catch (error: any) {
        importResults.failed.push({
          term: termData.term,
          reason: error.message
        });
      }
    }

    // 5. 删除上传的文件
    try {
      fs.unlinkSync(file.path);
      console.log('[Terms API] 临时文件已删除:', file.path);
    } catch (error) {
      console.error('[Terms API] 删除临时文件失败:', error);
    }

    console.log('[Terms API] 文档处理完成:', {
      created: importResults.created.length,
      skipped: importResults.skipped.length,
      failed: importResults.failed.length
    });

    res.json({
      message: '文档处理完成',
      data: {
        document: {
          filename: file.originalname,
          fileType: parsedDoc.fileType,
          wordCount: parsedDoc.wordCount
        },
        extraction: {
          extracted: extractedTerms.length,
          created: importResults.created.length,
          skipped: importResults.skipped.length,
          failed: importResults.failed.length
        },
        results: importResults
      }
    });

  } catch (error: any) {
    // 出错时删除上传的文件
    try {
      if (file && file.path) {
        fs.unlinkSync(file.path);
      }
    } catch (unlinkError) {
      console.error('[Terms API] 删除临时文件失败:', unlinkError);
    }

    throw error;
  }
}));

/**
 * POST /api/v1/terms/match-text
 * 匹配文本中的知识库术语
 */
router.post('/match-text', asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    throw createError('text is required and must be a string', 400, 'INVALID_INPUT');
  }

  console.log('[Terms API] 匹配文本中的术语, 文本长度:', text.length);

  // 获取所有术语
  const allTerms = KnowledgeBaseDB.getAll(1000, 0);

  // 匹配文本中的术语
  const matches: Array<{
    term: string;
    definition: string;
    category?: string;
    positions: Array<{ start: number; end: number }>;
  }> = [];

  for (const term of allTerms) {
    const positions: Array<{ start: number; end: number }> = [];

    // 匹配主术语
    let index = text.indexOf(term.term);
    while (index !== -1) {
      positions.push({
        start: index,
        end: index + term.term.length
      });
      index = text.indexOf(term.term, index + 1);
    }

    // 匹配同义词
    if (term.synonyms && Array.isArray(term.synonyms)) {
      for (const synonym of term.synonyms) {
        let synIndex = text.indexOf(synonym);
        while (synIndex !== -1) {
          positions.push({
            start: synIndex,
            end: synIndex + synonym.length
          });
          synIndex = text.indexOf(synonym, synIndex + 1);
        }
      }
    }

    if (positions.length > 0) {
      matches.push({
        term: term.term,
        definition: term.definition,
        category: term.category,
        positions
      });

      // 更新匹配计数
      const stmt = db.prepare(`
        UPDATE terms
        SET matchCount = matchCount + ?,
            lastMatched = ?
        WHERE id = ?
      `);
      stmt.run(positions.length, new Date().toISOString(), term.id);
    }
  }

  console.log('[Terms API] 匹配到术语数量:', matches.length);

  res.json({
    message: '匹配完成',
    data: {
      matchCount: matches.length,
      matches
    }
  });
}));

export default router;
