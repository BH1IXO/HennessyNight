/**
 * Production App - 真实后端API版本
 * 连接到 http://localhost:3000 后端服务
 * 版本: 2025-01-29
 */

console.log('🚀 加载 Production App - 真实后端版本');

// ==================== 配置 ====================
const API_BASE_URL = 'http://localhost:3000/api/v1';
console.log('🚀 使用生产模式API - 连接到真实后端服务');

// ==================== 工具类 ====================

class EventBus {
    constructor() {
        this.events = new Map();
    }

    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);
    }

    off(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    emit(event, data) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            });
        }
    }
}

// ==================== API 服务类 ====================

class APIService {
    constructor(baseURL) {
        this.baseURL = baseURL;
    }

    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || '请求失败');
            }

            return await response.json();
        } catch (error) {
            console.error(`API请求失败 [${endpoint}]:`, error);
            throw error;
        }
    }

    // 说话人相关
    async getSpeakers() {
        return this.request('/speakers');
    }

    async createSpeaker(formData) {
        const response = await fetch(`${this.baseURL}/speakers`, {
            method: 'POST',
            body: formData // FormData不需要设置Content-Type
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '创建说话人失败');
        }

        return await response.json();
    }

    async deleteSpeaker(id) {
        return this.request(`/speakers/${id}`, { method: 'DELETE' });
    }

    // 知识库相关
    async getTerms() {
        return this.request('/terms');
    }

    async createTerm(termData) {
        return this.request('/terms', {
            method: 'POST',
            body: JSON.stringify(termData)
        });
    }

    async batchCreateTerms(terms) {
        return this.request('/terms/batch', {
            method: 'POST',
            body: JSON.stringify({ terms })
        });
    }

    async deleteTerm(id) {
        return this.request(`/terms/${id}`, { method: 'DELETE' });
    }

    // 音频转录
    async transcribeAudio(audioBlob, filename = 'recording.webm') {
        const formData = new FormData();
        formData.append('audio', audioBlob, filename);

        const response = await fetch(`${this.baseURL}/audio/transcribe`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '转录失败');
        }

        return await response.json();
    }

    // 会议纪要生成
    async generateSummary(transcript, attendees = []) {
        return this.request('/summaries/generate-from-text', {
            method: 'POST',
            body: JSON.stringify({
                transcript,
                attendees,
                meetingTitle: '会议记录',
                language: 'zh',
                style: 'formal'
            })
        });
    }
}

// ==================== 管理类 ====================

class VoiceprintManager {
    constructor(eventBus, apiService) {
        this.speakers = new Map();
        this.eventBus = eventBus;
        this.apiService = apiService;
    }

    async loadFromAPI() {
        try {
            const response = await this.apiService.getSpeakers();
            const speakers = response.data || [];

            this.speakers.clear();
            speakers.forEach(speaker => {
                this.speakers.set(speaker.id, {
                    id: speaker.id,
                    name: speaker.name,
                    email: speaker.email,
                    profileStatus: speaker.profileStatus
                });
            });

            console.log(`✅ 从API加载了 ${this.speakers.size} 个说话人`);
            this.eventBus.emit('speakers:loaded', Array.from(this.speakers.values()));
        } catch (error) {
            console.error('加载说话人失败:', error);
        }
    }

    async addSpeaker(name, email, voiceFile = null) {
        try {
            const formData = new FormData();
            formData.append('name', name);
            formData.append('email', email);
            if (voiceFile) {
                formData.append('voiceFile', voiceFile);
            }

            const response = await this.apiService.createSpeaker(formData);
            const speaker = response.data;

            this.speakers.set(speaker.id, speaker);
            this.eventBus.emit('speaker:added', speaker);

            console.log('✅ 说话人添加成功:', speaker.name);
            return speaker;
        } catch (error) {
            console.error('添加说话人失败:', error);
            throw error;
        }
    }

    async deleteSpeaker(id) {
        try {
            await this.apiService.deleteSpeaker(id);
            this.speakers.delete(id);
            this.eventBus.emit('speaker:deleted', id);
            console.log('✅ 说话人删除成功');
        } catch (error) {
            console.error('删除说话人失败:', error);
            throw error;
        }
    }

    getSpeakers() {
        return Array.from(this.speakers.values());
    }
}

class KnowledgeBaseManager {
    constructor(eventBus, apiService) {
        this.terms = new Map();
        this.eventBus = eventBus;
        this.apiService = apiService;
    }

    async loadFromAPI() {
        try {
            const response = await this.apiService.getTerms();
            const terms = response.data || [];

            this.terms.clear();
            terms.forEach(term => {
                this.terms.set(term.id, term);
            });

            console.log(`✅ 从API加载了 ${this.terms.size} 个词条`);
            this.eventBus.emit('terms:loaded', Array.from(this.terms.values()));
        } catch (error) {
            console.error('加载词条失败:', error);
        }
    }

    async addTerm(termData) {
        try {
            const response = await this.apiService.createTerm(termData);
            const term = response.data;

            this.terms.set(term.id, term);
            this.eventBus.emit('term:added', term);

            console.log('✅ 词条添加成功:', term.term);
            return term;
        } catch (error) {
            console.error('添加词条失败:', error);
            throw error;
        }
    }

    async deleteTerm(id) {
        try {
            await this.apiService.deleteTerm(id);
            this.terms.delete(id);
            this.eventBus.emit('term:deleted', id);
            console.log('✅ 词条删除成功');
        } catch (error) {
            console.error('删除词条失败:', error);
            throw error;
        }
    }

    async importFromJSON(jsonData) {
        try {
            const terms = Array.isArray(jsonData) ? jsonData : jsonData.terms || [];
            const response = await this.apiService.batchCreateTerms(terms);

            console.log(`✅ 批量导入完成: 创建 ${response.data.created.length}, 跳过 ${response.data.skipped.length}, 失败 ${response.data.failed.length}`);

            await this.loadFromAPI();
            return response.data;
        } catch (error) {
            console.error('批量导入失败:', error);
            throw error;
        }
    }

    getTerms() {
        return Array.from(this.terms.values());
    }

    highlightTermsInText(text) {
        let highlightedText = text;
        this.terms.forEach(term => {
            const regex = new RegExp(`\\b${term.term}\\b`, 'gi');
            highlightedText = highlightedText.replace(
                regex,
                `<span class="term-highlight" title="${term.definition}">${term.term}<sup class="term-marker">📖</sup></span>`
            );
        });
        return highlightedText;
    }
}

// ==================== 录音管理器 ====================

class RecordingManager {
    constructor(eventBus, apiService) {
        this.eventBus = eventBus;
        this.apiService = apiService;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.chunkInterval = null;
        this.transcriptBuffer = '';
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // 使用 webm 格式，每3秒一个分片
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm'
            });

            this.audioChunks = [];
            this.transcriptBuffer = '';
            this.recordingStartTime = Date.now();
            this.isRecording = true;

            // 每3秒处理一次音频数据
            this.mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);

                    // 创建blob并发送转录
                    const audioBlob = new Blob([event.data], { type: 'audio/webm' });
                    await this.transcribeChunk(audioBlob);
                }
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                this.isRecording = false;
                clearInterval(this.chunkInterval);
            };

            // 开始录音，每3秒请求一次数据
            this.mediaRecorder.start();
            this.chunkInterval = setInterval(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.mediaRecorder.requestData();
                }
            }, 3000);

            this.eventBus.emit('recording:started');
            console.log('🎤 录音已开始');

        } catch (error) {
            console.error('启动录音失败:', error);
            throw error;
        }
    }

    async transcribeChunk(audioBlob) {
        try {
            console.log('🔊 发送音频片段进行转录...', audioBlob.size, 'bytes');

            const result = await this.apiService.transcribeAudio(
                audioBlob,
                `chunk-${Date.now()}.webm`
            );

            if (result.data && result.data.results) {
                const transcriptions = result.data.results
                    .filter(r => r.text && r.text.trim())
                    .map(r => r.text.trim());

                if (transcriptions.length > 0) {
                    const text = transcriptions.join(' ');
                    this.transcriptBuffer += text + ' ';

                    // 发送转录结果
                    this.eventBus.emit('transcription:chunk', {
                        text: text,
                        speaker: result.data.speaker || { name: '未识别说话人', confidence: 0 },
                        timestamp: Date.now()
                    });

                    console.log('✅ 转录成功:', text.substring(0, 50) + '...');
                }
            }

        } catch (error) {
            console.error('转录音频片段失败:', error);
        }
    }

    async stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.eventBus.emit('recording:stopped', {
                transcript: this.transcriptBuffer.trim()
            });
            console.log('⏹️ 录音已停止');
        }
    }

    getFullTranscript() {
        return this.transcriptBuffer.trim();
    }
}

// ==================== UI 管理器 ====================

class UIManager {
    constructor(eventBus, voiceprintManager, knowledgeBaseManager, recordingManager, apiService) {
        this.eventBus = eventBus;
        this.voiceprintManager = voiceprintManager;
        this.knowledgeBaseManager = knowledgeBaseManager;
        this.recordingManager = recordingManager;
        this.apiService = apiService;

        this.transcriptMessages = [];
        this.currentSpeaker = null;
        this.lastTranscriptTime = 0;
    }

    init() {
        this.bindEvents();
        this.setupEventHandlers();
        this.updateSpeakerList();
        this.updateTermList();
    }

    bindEvents() {
        // 按钮事件
        document.getElementById('startRecording')?.addEventListener('click', () => this.startRecording());
        document.getElementById('stopRecording')?.addEventListener('click', () => this.stopRecording());
        document.getElementById('generateSummary')?.addEventListener('click', () => this.generateSummary());

        // 声纹管理
        document.getElementById('addSpeaker')?.addEventListener('click', () => this.showAddSpeakerModal());
        document.querySelector('[onclick="saveSpeaker()"]')?.addEventListener('click', () => this.saveSpeaker());

        // 知识库管理
        document.getElementById('addTerm')?.addEventListener('click', () => this.showAddTermModal());
        document.querySelector('[onclick="saveTerm()"]')?.addEventListener('click', () => this.saveTerm());
        document.getElementById('knowledgeUpload')?.addEventListener('change', (e) => this.handleKnowledgeUpload(e));

        // 管理标签切换
        document.querySelectorAll('.management-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchManagementTab(tab));
        });

        // 主标签切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab));
        });

        // 导入录音
        const importBtn = document.getElementById('importRecording');
        const fileInput = document.getElementById('recordingFileInput');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleRecordingImport(e));
        }
    }

    setupEventHandlers() {
        // 说话人列表更新
        this.eventBus.on('speakers:loaded', () => this.updateSpeakerList());
        this.eventBus.on('speaker:added', () => this.updateSpeakerList());
        this.eventBus.on('speaker:deleted', () => this.updateSpeakerList());

        // 词条列表更新
        this.eventBus.on('terms:loaded', () => this.updateTermList());
        this.eventBus.on('term:added', () => this.updateTermList());
        this.eventBus.on('term:deleted', () => this.updateTermList());

        // 录音状态
        this.eventBus.on('recording:started', () => {
            document.getElementById('startRecording').disabled = true;
            document.getElementById('stopRecording').disabled = false;
            document.getElementById('generateSummary').disabled = true;
            this.setStatus('录音中...', 'recording');
            this.clearTranscriptDisplay();
        });

        this.eventBus.on('recording:stopped', () => {
            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            document.getElementById('generateSummary').disabled = false;
            this.setStatus('录音已停止', 'idle');
        });

        // 转录结果
        this.eventBus.on('transcription:chunk', (data) => {
            this.addTranscriptMessage(data);
        });
    }

    // 状态显示
    setStatus(text, state = 'idle') {
        const statusText = document.getElementById('statusText');
        const statusDot = document.getElementById('statusDot');

        if (statusText) statusText.textContent = text;
        if (statusDot) {
            statusDot.classList.remove('recording');
            if (state === 'recording') {
                statusDot.classList.add('recording');
            }
        }
    }

    // 清空转录显示
    clearTranscriptDisplay() {
        const container = document.getElementById('transcriptDisplay');
        if (container) {
            container.innerHTML = '';
            this.transcriptMessages = [];
            this.currentSpeaker = null;
            this.lastTranscriptTime = 0;
        }
    }

    // 添加转录消息（带断句和自动滚动）
    addTranscriptMessage(data) {
        const { text, speaker, timestamp } = data;
        const container = document.getElementById('transcriptDisplay');

        if (!container) return;

        // 检查是否需要新建消息块（说话人切换或时间间隔超过5秒）
        const timeSinceLastMessage = timestamp - this.lastTranscriptTime;
        const needNewBlock = !this.currentSpeaker ||
                           this.currentSpeaker.name !== speaker.name ||
                           timeSinceLastMessage > 5000;

        if (needNewBlock) {
            // 创建新消息块
            const messageDiv = document.createElement('div');
            messageDiv.className = 'speaker-message';
            messageDiv.dataset.timestamp = timestamp;
            messageDiv.innerHTML = `
                <div class="speaker-label">
                    <div class="speaker-avatar">${speaker.name.charAt(0)}</div>
                    <span>${speaker.name}</span>
                    ${speaker.confidence ? `<span style="font-size:0.8rem;color:var(--gray);margin-left:8px;">(${(speaker.confidence * 100).toFixed(0)}%)</span>` : ''}
                </div>
                <div class="message-content">${this.highlightTerms(text)}</div>
                <div class="message-time">${this.formatTime(new Date())}</div>
            `;

            container.appendChild(messageDiv);
            this.currentSpeaker = speaker;
            this.transcriptMessages.push({ speaker: speaker.name, text, timestamp });

            // 动画效果
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(20px)';
            setTimeout(() => {
                messageDiv.style.transition = 'all 0.3s ease';
                messageDiv.style.opacity = '1';
                messageDiv.style.transform = 'translateY(0)';
            }, 10);
        } else {
            // 追加到当前消息块
            const lastMessage = container.lastElementChild;
            if (lastMessage) {
                const contentDiv = lastMessage.querySelector('.message-content');
                if (contentDiv) {
                    // 添加句子，自动断句
                    const currentText = contentDiv.textContent;
                    const separator = this.shouldAddPunctuation(currentText) ? '' : ' ';
                    contentDiv.innerHTML = this.highlightTerms(currentText + separator + text);
                }
            }
        }

        this.lastTranscriptTime = timestamp;

        // 自动滚动到底部
        this.scrollToBottom(container);
    }

    // 判断是否需要添加标点符号
    shouldAddPunctuation(text) {
        const lastChar = text.trim().slice(-1);
        return ['。', '，', '、', '！', '？', '；', '.', ',', '!', '?', ';'].includes(lastChar);
    }

    // 平滑滚动到底部
    scrollToBottom(container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }

    // 高亮知识库词条
    highlightTerms(text) {
        return this.knowledgeBaseManager.highlightTermsInText(text);
    }

    // 格式化时间
    formatTime(date) {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }

    // 录音控制
    async startRecording() {
        try {
            await this.recordingManager.startRecording();
        } catch (error) {
            alert('启动录音失败: ' + error.message);
        }
    }

    async stopRecording() {
        await this.recordingManager.stopRecording();
    }

    // 导入录音文件
    async handleRecordingImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.setStatus('正在处理录音文件...');
        this.clearTranscriptDisplay();

        try {
            const result = await this.apiService.transcribeAudio(file, file.name);

            if (result.data && result.data.results) {
                // 显示转录结果
                const speaker = result.data.speaker || { name: '未识别说话人', confidence: 0 };
                const fullText = result.data.results
                    .filter(r => r.text && r.text.trim())
                    .map(r => r.text.trim())
                    .join(' ');

                if (fullText) {
                    this.addTranscriptMessage({
                        text: fullText,
                        speaker: speaker,
                        timestamp: Date.now()
                    });

                    // 保存到录音管理器
                    this.recordingManager.transcriptBuffer = fullText;
                    document.getElementById('generateSummary').disabled = false;
                }

                this.setStatus(`录音文件处理完成 - 识别到 ${speaker.name}`);
            }

        } catch (error) {
            console.error('处理录音文件失败:', error);
            alert('处理录音文件失败: ' + error.message);
            this.setStatus('处理失败');
        }

        event.target.value = '';
    }

    // 生成会议纪要
    async generateSummary() {
        const transcript = this.recordingManager.getFullTranscript();

        if (!transcript) {
            alert('请先进行录音或导入录音文件');
            return;
        }

        this.setStatus('正在生成会议纪要...');
        document.getElementById('generateSummary').disabled = true;

        try {
            const speakers = this.voiceprintManager.getSpeakers();
            const attendees = speakers.map(s => s.name);

            const result = await this.apiService.generateSummary(transcript, attendees);

            if (result.data) {
                this.displaySummary(result.data);
                this.switchToTab('summary');
                this.setStatus('会议纪要生成成功');
            }

        } catch (error) {
            console.error('生成会议纪要失败:', error);
            alert('生成会议纪要失败: ' + error.message);
            this.setStatus('生成失败');
        } finally {
            document.getElementById('generateSummary').disabled = false;
        }
    }

    // 显示会议纪要
    displaySummary(summary) {
        const container = document.getElementById('summaryDisplay');
        if (!container) return;

        let html = '';

        // 会议摘要
        if (summary.summary) {
            html += `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-file-alt"></i> 会议摘要</div>
                    <div class="summary-content">${summary.summary}</div>
                </div>
            `;
        }

        // 关键要点
        if (summary.keyPoints && summary.keyPoints.length > 0) {
            html += `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-list-ul"></i> 关键要点</div>
                    <div class="summary-content">
                        <ul>
                            ${summary.keyPoints.map(point => `<li>${point}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
        }

        // 行动项
        if (summary.actionItems && summary.actionItems.length > 0) {
            html += `
                <div class="summary-section">
                    <div class="summary-title"><i class="fas fa-tasks"></i> 行动项</div>
                    <div class="summary-content">
                        <ul>
                            ${summary.actionItems.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // 标签切换
    switchTab(tab) {
        const tabId = tab.dataset.tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`${tabId}-tab`)?.classList.add('active');
    }

    switchToTab(tabName) {
        const tab = document.querySelector(`[data-tab="${tabName}"]`);
        if (tab) this.switchTab(tab);
    }

    switchManagementTab(tab) {
        const tabId = tab.dataset.tab;

        document.querySelectorAll('.management-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        document.querySelectorAll('.management-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tabId}-content`)?.classList.add('active');
    }

    // 说话人管理
    updateSpeakerList() {
        const container = document.getElementById('speakerList');
        if (!container) return;

        const speakers = this.voiceprintManager.getSpeakers();

        if (speakers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>暂无声纹数据</p>
                </div>
            `;
            return;
        }

        container.innerHTML = speakers.map(speaker => `
            <div class="speaker-item">
                <div class="speaker-avatar">${speaker.name.charAt(0)}</div>
                <div class="speaker-info">
                    <div class="speaker-name">${speaker.name}</div>
                    <div class="speaker-email">${speaker.email || ''}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon delete" onclick="app.deleteSpeaker('${speaker.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    showAddSpeakerModal() {
        document.getElementById('addSpeakerModal')?.classList.add('active');
    }

    async saveSpeaker() {
        const name = document.getElementById('speakerName').value.trim();
        const email = document.getElementById('speakerEmail').value.trim();
        const voiceFile = document.getElementById('speakerVoiceFile').files[0];

        if (!name || !email) {
            alert('请填写姓名和邮箱');
            return;
        }

        const btn = document.getElementById('saveSpeakerBtn');
        btn?.classList.add('btn-loading');

        try {
            await this.voiceprintManager.addSpeaker(name, email, voiceFile);
            this.closeModal('addSpeakerModal');

            // 清空表单
            document.getElementById('speakerName').value = '';
            document.getElementById('speakerEmail').value = '';
            document.getElementById('speakerVoiceFile').value = '';

            alert('说话人添加成功！');
        } catch (error) {
            alert('添加失败: ' + error.message);
        } finally {
            btn?.classList.remove('btn-loading');
        }
    }

    async deleteSpeaker(id) {
        if (!confirm('确定要删除这个说话人吗？')) return;

        try {
            await this.voiceprintManager.deleteSpeaker(id);
            alert('删除成功');
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    }

    // 知识库管理
    updateTermList() {
        const container = document.getElementById('termList');
        if (!container) return;

        const terms = this.knowledgeBaseManager.getTerms();

        if (terms.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>暂无词条数据</p>
                </div>
            `;
            return;
        }

        container.innerHTML = terms.map(term => `
            <div class="term-item">
                <div class="term-info">
                    <div class="term-name">${term.term}${term.category ? ` <span class="badge">${term.category}</span>` : ''}</div>
                    <div class="term-definition">${term.definition}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon delete" onclick="app.deleteTerm('${term.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    showAddTermModal() {
        document.getElementById('addTermModal')?.classList.add('active');
    }

    async saveTerm() {
        const term = document.getElementById('termName').value.trim();
        const definition = document.getElementById('termDefinition').value.trim();
        const category = document.getElementById('termCategory').value.trim();
        const synonymsText = document.getElementById('termSynonyms').value.trim();

        if (!term || !definition) {
            alert('请填写词条和定义');
            return;
        }

        const synonyms = synonymsText ? synonymsText.split(',').map(s => s.trim()).filter(Boolean) : [];

        try {
            await this.knowledgeBaseManager.addTerm({
                term,
                definition,
                category: category || undefined,
                synonyms: synonyms.length > 0 ? synonyms : undefined
            });

            this.closeModal('addTermModal');

            // 清空表单
            document.getElementById('termName').value = '';
            document.getElementById('termDefinition').value = '';
            document.getElementById('termCategory').value = '';
            document.getElementById('termSynonyms').value = '';

            alert('词条添加成功！');
        } catch (error) {
            alert('添加失败: ' + error.message);
        }
    }

    async deleteTerm(id) {
        if (!confirm('确定要删除这个词条吗？')) return;

        try {
            await this.knowledgeBaseManager.deleteTerm(id);
            alert('删除成功');
        } catch (error) {
            alert('删除失败: ' + error.message);
        }
    }

    async handleKnowledgeUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            const result = await this.knowledgeBaseManager.importFromJSON(data);
            alert(`导入完成！创建 ${result.created.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个`);
        } catch (error) {
            alert('导入失败: ' + error.message);
        }

        event.target.value = '';
    }

    closeModal(modalId) {
        document.getElementById(modalId)?.classList.remove('active');
    }
}

// ==================== 全局函数（供HTML调用） ====================

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

function saveSpeaker() {
    window.app?.uiManager.saveSpeaker();
}

function saveTerm() {
    window.app?.uiManager.saveTerm();
}

// ==================== 应用初始化 ====================

class App {
    constructor() {
        this.eventBus = new EventBus();
        this.apiService = new APIService(API_BASE_URL);
        this.voiceprintManager = new VoiceprintManager(this.eventBus, this.apiService);
        this.knowledgeBaseManager = new KnowledgeBaseManager(this.eventBus, this.apiService);
        this.recordingManager = new RecordingManager(this.eventBus, this.apiService);
        this.uiManager = new UIManager(
            this.eventBus,
            this.voiceprintManager,
            this.knowledgeBaseManager,
            this.recordingManager,
            this.apiService
        );
    }

    async init() {
        console.log('🚀 初始化应用...');

        // 加载数据
        await Promise.all([
            this.voiceprintManager.loadFromAPI(),
            this.knowledgeBaseManager.loadFromAPI()
        ]);

        // 初始化UI
        this.uiManager.init();

        console.log('✅ 应用初始化完成');
    }

    // 暴露给HTML使用的方法
    deleteSpeaker(id) {
        this.uiManager.deleteSpeaker(id);
    }

    deleteTerm(id) {
        this.uiManager.deleteTerm(id);
    }
}

// 当DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    window.app = new App();
    await window.app.init();
});

console.log('✅ Production App 加载完成');
