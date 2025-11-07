/**
 * 知识库管理模块
 * 负责管理专业术语和知识库
 */

(function() {
    'use strict';

    console.log('[KnowledgeManager] 🚀 脚本开始加载');

    // 使用局部常量，不污染全局作用域
    const KNOWLEDGE_API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000/api/v1';
    console.log('[KnowledgeManager] API地址:', KNOWLEDGE_API_BASE_URL);

class KnowledgeManager {
    constructor() {
        console.log('[KnowledgeManager] 📦 构造函数被调用');
        this.terms = [];
        this.currentEditingTermId = null;
        this.apiBaseUrl = KNOWLEDGE_API_BASE_URL;
        this.init();
    }

    init() {
        console.log('[KnowledgeManager] 🔧 初始化知识库管理器');
        this.setupModalFunctions();
        this.bindEvents();
        this.loadTerms();
    }

    /**
     * 设置 Modal 函数（如果不存在）
     */
    setupModalFunctions() {
        if (typeof window.openModal !== 'function') {
            window.openModal = (modalId) => {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'flex';
                    console.log('[KnowledgeManager] ✅ 打开 Modal:', modalId);
                }
            };
        }

        if (typeof window.closeModal !== 'function') {
            window.closeModal = (modalId) => {
                const modal = document.getElementById(modalId);
                if (modal) {
                    modal.style.display = 'none';
                    console.log('[KnowledgeManager] ✅ 关闭 Modal:', modalId);
                }
            };
        }
    }

    bindEvents() {
        console.log('[KnowledgeManager] 🔗 开始绑定事件');

        // 添加词条按钮
        const addTermBtn = document.getElementById('addTerm');
        console.log('[KnowledgeManager] addTerm 按钮:', addTermBtn);
        if (addTermBtn) {
            addTermBtn.addEventListener('click', () => {
                console.log('[KnowledgeManager] ➕ 点击添加词条按钮');
                this.showAddTermModal();
            });
        }

        // 批量导入
        const knowledgeUpload = document.getElementById('knowledgeUpload');
        console.log('[KnowledgeManager] knowledgeUpload 元素:', knowledgeUpload);
        if (knowledgeUpload) {
            knowledgeUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // 管理Tab切换
        this.initManagementTabs();

        // 保存词条按钮
        const saveTermBtn = document.getElementById('saveTermBtn');
        if (saveTermBtn) {
            saveTermBtn.addEventListener('click', () => this.saveTerm());
        }

        // Modal 关闭按钮 (使用事件委托)
        document.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-modal-close]');
            if (closeBtn) {
                const modalId = closeBtn.dataset.modalClose;
                window.closeModal(modalId);
            }
        });

        // 使用事件委托处理词条列表中的按钮点击
        const termList = document.getElementById('termList');
        if (termList) {
            termList.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const action = target.dataset.action;
                const termId = target.dataset.termId;

                console.log('[KnowledgeManager] 词条操作:', action, termId);

                if (action === 'edit') {
                    this.editTerm(termId);
                } else if (action === 'delete') {
                    this.deleteTerm(termId);
                }
            });
        }

        console.log('[KnowledgeManager] ✅ 事件绑定完成');
    }

    /**
     * 初始化管理Tab切换功能
     */
    initManagementTabs() {
        const managementTabs = document.querySelectorAll('.management-tab');
        console.log('[KnowledgeManager] 🏷️  找到管理Tab数量:', managementTabs.length);

        managementTabs.forEach((tab, index) => {
            const tabId = tab.getAttribute('data-tab');
            console.log(`[KnowledgeManager] Tab ${index}: ${tabId}`, tab);

            tab.addEventListener('click', () => {
                console.log('[KnowledgeManager] 🖱️  点击管理Tab:', tabId);

                // 移除所有active类
                managementTabs.forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.management-content').forEach(content => {
                    content.classList.remove('active');
                });

                // 添加active类到当前tab
                tab.classList.add('active');
                const contentElement = document.getElementById(`${tabId}-content`);
                console.log('[KnowledgeManager] 内容元素:', contentElement);
                if (contentElement) {
                    contentElement.classList.add('active');
                    console.log('[KnowledgeManager] ✅ 已激活Tab:', tabId);
                }

                // 如果是知识库Tab，加载词条列表
                if (tabId === 'knowledge') {
                    console.log('[KnowledgeManager] 📚 加载知识库词条');
                    this.loadTerms();
                }
            });
        });
    }

    /**
     * 显示添加词条Modal
     */
    showAddTermModal() {
        console.log('[KnowledgeManager] 📝 显示添加词条Modal');
        this.currentEditingTermId = null;
        document.getElementById('termName').value = '';
        document.getElementById('termDefinition').value = '';
        document.getElementById('termCategory').value = '';
        document.getElementById('termSynonyms').value = '';

        window.openModal('addTermModal');
    }

    /**
     * 显示编辑词条Modal
     */
    showEditTermModal(term) {
        console.log('[KnowledgeManager] ✏️  显示编辑词条Modal:', term.term);
        this.currentEditingTermId = term.id;
        document.getElementById('termName').value = term.term;
        document.getElementById('termDefinition').value = term.definition;
        document.getElementById('termCategory').value = term.category || '';
        document.getElementById('termSynonyms').value = (term.synonyms || []).join(', ');

        window.openModal('addTermModal');
    }

    /**
     * 保存词条
     */
    async saveTerm() {
        const termName = document.getElementById('termName').value.trim();
        const termDefinition = document.getElementById('termDefinition').value.trim();
        const termCategory = document.getElementById('termCategory').value.trim();
        const termSynonyms = document.getElementById('termSynonyms').value.trim();

        if (!termName || !termDefinition) {
            alert('请填写词条和定义');
            return;
        }

        const synonymsArray = termSynonyms
            ? termSynonyms.split(',').map(s => s.trim()).filter(s => s)
            : [];

        const termData = {
            term: termName,
            definition: termDefinition,
            category: termCategory || undefined,
            synonyms: synonymsArray.length > 0 ? synonymsArray : undefined
        };

        try {
            let response;
            if (this.currentEditingTermId) {
                // 更新词条
                response = await fetch(`${this.apiBaseUrl}/terms/${this.currentEditingTermId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(termData)
                });
            } else {
                // 创建词条
                response = await fetch(`${this.apiBaseUrl}/terms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(termData)
                });
            }

            const result = await response.json();

            if (response.ok) {
                console.log('[KnowledgeManager] 词条保存成功:', result);

                // 如果词条已存在，提示用户返回修改
                if (result.skipped) {
                    alert('该词条已存在，请返回修改。');
                    return; // 不关闭Modal，让用户可以修改
                }

                // 保存成功，关闭Modal并刷新列表
                window.closeModal('addTermModal');
                this.loadTerms();
            } else {
                throw new Error(result.message || '保存失败');
            }
        } catch (error) {
            console.error('[KnowledgeManager] 保存词条失败:', error);
            alert('保存失败: ' + error.message);
        }
    }

    /**
     * 加载词条列表
     */
    async loadTerms() {
        try {
            console.log('[KnowledgeManager] 📖 加载词条列表');
            const response = await fetch(`${this.apiBaseUrl}/terms?limit=100`);
            const result = await response.json();

            if (response.ok) {
                this.terms = result.data || [];
                this.renderTermList();
            } else {
                throw new Error(result.message || '加载失败');
            }
        } catch (error) {
            console.error('[KnowledgeManager] 加载词条失败:', error);
            this.renderEmptyState('加载失败: ' + error.message);
        }
    }

    /**
     * 渲染词条列表
     */
    renderTermList() {
        const termList = document.getElementById('termList');
        if (!termList) return;

        if (this.terms.length === 0) {
            this.renderEmptyState();
            return;
        }

        console.log('[KnowledgeManager] 渲染词条列表, 数量:', this.terms.length);

        const html = this.terms.map(term => `
            <div class="term-item" data-term-id="${this.escapeHtml(term.id)}">
                <div class="term-header">
                    <div class="term-title">
                        <strong>${this.escapeHtml(term.term)}</strong>
                        ${term.category ? `<span class="term-category">${this.escapeHtml(term.category)}</span>` : ''}
                    </div>
                    <div class="term-actions">
                        <button class="btn-icon" data-action="edit" data-term-id="${this.escapeHtml(term.id)}" title="编辑">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" data-action="delete" data-term-id="${this.escapeHtml(term.id)}" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="term-definition">
                    ${this.escapeHtml(term.definition)}
                </div>
                ${term.synonyms && term.synonyms.length > 0 ? `
                    <div class="term-synonyms">
                        <i class="fas fa-tags"></i> 同义词: ${term.synonyms.map(s => this.escapeHtml(s)).join(', ')}
                    </div>
                ` : ''}
                <div class="term-meta">
                    创建时间: ${new Date(term.createdAt).toLocaleString('zh-CN')}
                </div>
            </div>
        `).join('');

        termList.innerHTML = html;
    }

    /**
     * 渲染空状态
     */
    renderEmptyState(message = '暂无词条数据') {
        const termList = document.getElementById('termList');
        if (!termList) return;

        termList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book-open"></i>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * 编辑词条
     */
    editTerm(termId) {
        const term = this.terms.find(t => t.id === termId);
        if (term) {
            this.showEditTermModal(term);
        }
    }

    /**
     * 删除词条
     */
    async deleteTerm(termId) {
        const term = this.terms.find(t => t.id === termId);
        if (!term) return;

        if (!confirm(`确定要删除词条"${term.term}"吗？`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/terms/${termId}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (response.ok) {
                console.log('[KnowledgeManager] 词条删除成功');
                // 静默删除，不显示成功提示
                this.loadTerms();
            } else {
                throw new Error(result.message || '删除失败');
            }
        } catch (error) {
            console.error('[KnowledgeManager] 删除词条失败:', error);
            alert('删除失败: ' + error.message);
        }
    }

    /**
     * 处理文件上传
     */
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        console.log('[KnowledgeManager] 开始导入文件:', file.name);

        const fileName = file.name.toLowerCase();

        // 检查是否是文档文件（PDF/Word）
        if (fileName.endsWith('.pdf') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
            await this.handleDocumentUpload(file);
            event.target.value = '';
            return;
        }

        // 处理结构化文件（JSON/CSV/TXT）
        try {
            const text = await file.text();
            let terms = [];

            if (fileName.endsWith('.json')) {
                terms = this.parseJSON(text);
            } else if (fileName.endsWith('.csv')) {
                terms = this.parseCSV(text);
            } else if (fileName.endsWith('.txt')) {
                terms = this.parseTXT(text);
            } else {
                alert('不支持的文件格式');
                return;
            }

            if (terms.length === 0) {
                alert('文件中没有找到有效的词条数据');
                return;
            }

            console.log('[KnowledgeManager] 解析到词条数量:', terms.length);

            // 批量导入
            await this.batchImport(terms);

        } catch (error) {
            console.error('[KnowledgeManager] 文件导入失败:', error);
            alert('文件导入失败: ' + error.message);
        } finally {
            event.target.value = '';
        }
    }

    /**
     * 处理文档上传（PDF/Word）- 使用 AI 提取术语
     */
    async handleDocumentUpload(file) {
        console.log('[KnowledgeManager] 开始处理文档:', file.name);

        // 显示处理中提示
        const processingMsg = alert('正在使用 AI 分析文档，请稍候...\n这可能需要几分钟时间。');

        try {
            const formData = new FormData();
            formData.append('document', file);

            const response = await fetch(`${this.apiBaseUrl}/terms/upload-document`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                const { document: doc, extraction, results } = result.data;

                let message = `📄 文档处理完成！\n\n`;
                message += `文件: ${doc.filename}\n`;
                message += `类型: ${doc.fileType.toUpperCase()}\n`;
                message += `字数: ${doc.wordCount}\n\n`;
                message += `📊 提取结果：\n`;
                message += `- AI 提取术语: ${extraction.extracted} 条\n`;
                message += `- 成功导入: ${extraction.created} 条\n`;
                if (extraction.skipped > 0) {
                    message += `- 已跳过(重复): ${extraction.skipped} 条\n`;
                }
                if (extraction.failed > 0) {
                    message += `- 失败: ${extraction.failed} 条\n`;
                }

                alert(message);
                this.loadTerms();

            } else {
                throw new Error(result.message || '文档处理失败');
            }

        } catch (error) {
            console.error('[KnowledgeManager] 文档上传失败:', error);
            alert('文档处理失败: ' + error.message);
        }
    }

    /**
     * 解析JSON文件
     */
    parseJSON(text) {
        const data = JSON.parse(text);

        if (Array.isArray(data)) {
            return data.filter(item => item.term && item.definition);
        } else if (data.terms && Array.isArray(data.terms)) {
            return data.terms.filter(item => item.term && item.definition);
        }

        return [];
    }

    /**
     * 解析CSV文件
     */
    parseCSV(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const terms = [];

        // 跳过表头
        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));

            if (parts.length >= 2 && parts[0] && parts[1]) {
                terms.push({
                    term: parts[0],
                    definition: parts[1],
                    category: parts[2] || undefined,
                    synonyms: parts[3] ? parts[3].split(';').map(s => s.trim()) : undefined
                });
            }
        }

        return terms;
    }

    /**
     * 解析TXT文件
     */
    parseTXT(text) {
        const lines = text.split('\n').filter(line => line.trim());
        const terms = [];

        for (const line of lines) {
            // 支持格式: 词条:定义 或 词条=定义 或 词条 - 定义
            const match = line.match(/^(.+?)[:=\-]\s*(.+)$/);
            if (match) {
                terms.push({
                    term: match[1].trim(),
                    definition: match[2].trim()
                });
            }
        }

        return terms;
    }

    /**
     * 批量导入词条
     */
    async batchImport(terms) {
        try {
            console.log('[KnowledgeManager] 🚀 开始批量导入词条');

            const response = await fetch(`${this.apiBaseUrl}/terms/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ terms })
            });

            const result = await response.json();

            if (response.ok) {
                const { created, skipped, failed } = result.data;

                console.log('[KnowledgeManager] 批量导入完成:', {
                    created: created.length,
                    skipped: skipped.length,
                    failed: failed.length
                });

                let message = `导入完成！\n`;
                message += `✅ 成功创建: ${created.length} 条\n`;
                if (skipped.length > 0) {
                    message += `⚠️ 已跳过(重复): ${skipped.length} 条\n`;
                }
                if (failed.length > 0) {
                    message += `❌ 失败: ${failed.length} 条\n`;
                }

                alert(message);
                this.loadTerms();
            } else {
                throw new Error(result.message || '批量导入失败');
            }
        } catch (error) {
            console.error('[KnowledgeManager] 批量导入失败:', error);
            alert('批量导入失败: ' + error.message);
        }
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 创建全局实例
let knowledgeManager;

// 页面加载完成后初始化
function initKnowledgeManager() {
    console.log('[KnowledgeManager] 🎬 初始化函数被调用');
    console.log('[KnowledgeManager] 当前knowledgeManager:', knowledgeManager);

    if (!knowledgeManager) {
        // 延迟一点，确保其他脚本已加载
        console.log('[KnowledgeManager] ⏱️  延迟500ms后创建实例');
        setTimeout(() => {
            knowledgeManager = new KnowledgeManager();
            console.log('[KnowledgeManager] ✅ 知识库管理器已就绪');

            // 暴露到全局
            window.knowledgeManager = knowledgeManager;
        }, 500);
    }
}

if (document.readyState === 'loading') {
    console.log('[KnowledgeManager] 📄 文档正在加载，添加DOMContentLoaded监听器');
    document.addEventListener('DOMContentLoaded', initKnowledgeManager);
} else {
    console.log('[KnowledgeManager] 📄 文档已加载，立即初始化');
    initKnowledgeManager();
}

// 全局函数 - 供HTML onclick调用
window.saveTerm = function() {
    console.log('[KnowledgeManager] 💾 saveTerm 被调用');
    if (window.knowledgeManager) {
        window.knowledgeManager.saveTerm();
    } else {
        console.error('[KnowledgeManager] ❌ knowledgeManager 未初始化');
    }
};

})(); // 关闭 IIFE
