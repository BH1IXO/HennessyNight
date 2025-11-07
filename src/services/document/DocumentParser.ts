/**
 * 文档解析服务
 * 支持 PDF 和 Word 文档解析
 */

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';

export interface ParsedDocument {
  text: string;
  fileName: string;
  fileType: 'pdf' | 'docx';
  pageCount?: number;
  wordCount: number;
}

export class DocumentParser {
  /**
   * 解析 PDF 文件
   */
  static async parsePDF(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      console.log('[DocumentParser] 开始解析 PDF:', fileName);

      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);

      console.log('[DocumentParser] PDF 解析成功:', {
        pages: data.numpages,
        text_length: data.text.length
      });

      return {
        text: data.text,
        fileName,
        fileType: 'pdf',
        pageCount: data.numpages,
        wordCount: data.text.split(/\s+/).length
      };

    } catch (error: any) {
      console.error('[DocumentParser] PDF 解析失败:', error);
      throw new Error(`PDF 解析失败: ${error.message}`);
    }
  }

  /**
   * 解析 Word 文档
   */
  static async parseWord(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      console.log('[DocumentParser] 开始解析 Word:', fileName);

      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;

      console.log('[DocumentParser] Word 解析成功:', {
        text_length: text.length
      });

      return {
        text,
        fileName,
        fileType: 'docx',
        wordCount: text.split(/\s+/).length
      };

    } catch (error: any) {
      console.error('[DocumentParser] Word 解析失败:', error);
      throw new Error(`Word 解析失败: ${error.message}`);
    }
  }

  /**
   * 自动识别文件类型并解析
   */
  static async parse(filePath: string, fileName: string): Promise<ParsedDocument> {
    const ext = fileName.toLowerCase().split('.').pop();

    switch (ext) {
      case 'pdf':
        return this.parsePDF(filePath, fileName);

      case 'doc':
      case 'docx':
        return this.parseWord(filePath, fileName);

      default:
        throw new Error(`不支持的文件类型: ${ext}`);
    }
  }

  /**
   * 清理文本（去除多余空格、换行等）
   */
  static cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')      // 统一换行符
      .replace(/\n{3,}/g, '\n\n')  // 去除多余换行
      .replace(/[ \t]{2,}/g, ' ')  // 去除多余空格
      .trim();
  }
}

export default DocumentParser;
