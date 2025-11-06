/**
 * 知识库SQLite数据库管理
 * 独立的轻量级数据库，用于存储词条数据
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'knowledgebase.db');

// 确保data目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据库
const db = new Database(DB_PATH);

// 创建表
db.exec(`
    CREATE TABLE IF NOT EXISTS terms (
        id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        definition TEXT NOT NULL,
        category TEXT,
        synonyms TEXT,
        source TEXT,
        matchCount INTEGER DEFAULT 0,
        lastMatched TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_terms_term ON terms(term);
    CREATE INDEX IF NOT EXISTS idx_terms_category ON terms(category);
`);

console.log('✅ 知识库数据库已初始化:', DB_PATH);

export interface Term {
    id: string;
    term: string;
    definition: string;
    category?: string;
    synonyms?: string[];
    source?: string;
    matchCount?: number;
    lastMatched?: string;
    createdAt: string;
    updatedAt: string;
}

export class KnowledgeBaseDB {
    /**
     * 获取所有词条
     */
    static getAll(limit: number = 100, offset: number = 0): Term[] {
        const stmt = db.prepare(`
            SELECT * FROM terms
            ORDER BY createdAt DESC
            LIMIT ? OFFSET ?
        `);

        const rows = stmt.all(limit, offset) as any[];

        return rows.map(row => ({
            ...row,
            synonyms: row.synonyms ? JSON.parse(row.synonyms) : []
        }));
    }

    /**
     * 根据ID获取词条
     */
    static getById(id: string): Term | null {
        const stmt = db.prepare('SELECT * FROM terms WHERE id = ?');
        const row = stmt.get(id) as any;

        if (!row) return null;

        return {
            ...row,
            synonyms: row.synonyms ? JSON.parse(row.synonyms) : []
        };
    }

    /**
     * 搜索词条
     */
    static search(query: string, category?: string): Term[] {
        let sql = `
            SELECT * FROM terms
            WHERE (term LIKE ? OR definition LIKE ?)
        `;

        const params: any[] = [`%${query}%`, `%${query}%`];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        sql += ' ORDER BY matchCount DESC, createdAt DESC LIMIT 50';

        const stmt = db.prepare(sql);
        const rows = stmt.all(...params) as any[];

        return rows.map(row => ({
            ...row,
            synonyms: row.synonyms ? JSON.parse(row.synonyms) : []
        }));
    }

    /**
     * 创建词条
     */
    static create(data: Omit<Term, 'id' | 'createdAt' | 'updatedAt'>): Term {
        const id = `term_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        const stmt = db.prepare(`
            INSERT INTO terms (id, term, definition, category, synonyms, source, matchCount, lastMatched, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id,
            data.term,
            data.definition,
            data.category || null,
            data.synonyms ? JSON.stringify(data.synonyms) : null,
            data.source || null,
            data.matchCount || 0,
            data.lastMatched || null,
            now,
            now
        );

        return this.getById(id)!;
    }

    /**
     * 更新词条
     */
    static update(id: string, data: Partial<Omit<Term, 'id' | 'createdAt' | 'updatedAt'>>): Term | null {
        const existing = this.getById(id);
        if (!existing) return null;

        const now = new Date().toISOString();

        const stmt = db.prepare(`
            UPDATE terms
            SET term = ?,
                definition = ?,
                category = ?,
                synonyms = ?,
                source = ?,
                updatedAt = ?
            WHERE id = ?
        `);

        stmt.run(
            data.term ?? existing.term,
            data.definition ?? existing.definition,
            data.category ?? existing.category ?? null,
            data.synonyms ? JSON.stringify(data.synonyms) : (existing.synonyms ? JSON.stringify(existing.synonyms) : null),
            data.source ?? existing.source ?? null,
            now,
            id
        );

        return this.getById(id);
    }

    /**
     * 删除词条
     */
    static delete(id: string): boolean {
        const stmt = db.prepare('DELETE FROM terms WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    /**
     * 批量创建词条（带去重）
     */
    static batchCreate(terms: Array<Omit<Term, 'id' | 'createdAt' | 'updatedAt'>>): {
        created: Term[];
        skipped: Array<{ term: string; reason: string }>;
        failed: Array<{ term: string; reason: string }>;
    } {
        const result = {
            created: [] as Term[],
            skipped: [] as Array<{ term: string; reason: string }>,
            failed: [] as Array<{ term: string; reason: string }>
        };

        for (const termData of terms) {
            try {
                // 检查是否已存在
                const existing = db.prepare('SELECT id FROM terms WHERE term = ?').get(termData.term);

                if (existing) {
                    result.skipped.push({
                        term: termData.term,
                        reason: '词条已存在'
                    });
                    continue;
                }

                // 创建新词条
                const created = this.create(termData);
                result.created.push(created);
            } catch (error: any) {
                result.failed.push({
                    term: termData.term,
                    reason: error.message
                });
            }
        }

        return result;
    }

    /**
     * 获取词条总数
     */
    static count(): number {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM terms');
        const result = stmt.get() as any;
        return result.count;
    }

    /**
     * 清空所有词条
     */
    static clear(): void {
        db.exec('DELETE FROM terms');
    }
}

export default db;
