/**
 * 实时声纹识别引擎管理器
 *
 * 功能：
 * 1. 管理多个并发的识别会话
 * 2. 提供统一的引擎创建和销毁接口
 * 3. 自动清理过期会话
 * 4. 监控引擎状态和资源使用
 */

import { RealtimeVoiceprintEngine, RealtimeEngineConfig, EngineStatus } from './RealtimeVoiceprintEngine';
import { ITranscriptionProvider, IVoiceprintProvider } from '../providers/types';
import { FunAsrTranscriptionProvider } from '../providers/transcription/FunAsrTranscription';
import { SpeechBrainVoiceprintProvider } from '../providers/voiceprint/SpeechBrainVoiceprint';
import { EventEmitter } from 'events';

// ============= 类型定义 =============

export interface SessionInfo {
  sessionId: string;
  meetingId: string;
  engine: RealtimeVoiceprintEngine;
  createdAt: Date;
  lastActivityAt: Date;
  status: EngineStatus;
}

export interface ManagerConfig {
  maxConcurrentSessions: number;     // 最大并发会话数
  sessionTimeout: number;             // 会话超时时间（毫秒）
  cleanupInterval: number;            // 清理检查间隔（毫秒）

  // Provider配置
  funasrConfig?: {
    mode?: 'realtime' | 'offline' | '2pass';
    language?: string;
    device?: 'cpu' | 'cuda';
  };

  speechbrainConfig?: {
    threshold?: number;
    device?: 'cpu' | 'cuda';
  };
}

export interface CreateSessionOptions {
  meetingId: string;
  candidateSpeakerIds?: string[];
  engineConfig?: Partial<RealtimeEngineConfig>;
}

// ============= 引擎管理器 =============

export class VoiceprintEngineManager extends EventEmitter {
  private config: ManagerConfig;
  private sessions: Map<string, SessionInfo> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  // Provider实例（可复用）
  private transcriptionProvider?: ITranscriptionProvider;
  private voiceprintProvider?: IVoiceprintProvider;

  constructor(config: ManagerConfig) {
    super();
    this.config = config;
    this.startCleanupTimer();
    this.initializeProviders();
  }

  // ============= 会话管理 =============

  /**
   * 创建新的识别会话
   */
  async createSession(options: CreateSessionOptions): Promise<string> {
    // 检查并发限制
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(`已达到最大并发会话数: ${this.config.maxConcurrentSessions}`);
    }

    // 生成会话ID
    const sessionId = this.generateSessionId();

    try {
      // 创建引擎实例
      const engine = new RealtimeVoiceprintEngine(
        this.getTranscriptionProvider(),
        this.getVoiceprintProvider(),
        options.engineConfig
      );

      // 监听引擎事件
      this.attachEngineListeners(engine, sessionId);

      // 启动引擎
      await engine.start(options.meetingId, options.candidateSpeakerIds);

      // 保存会话信息
      const sessionInfo: SessionInfo = {
        sessionId,
        meetingId: options.meetingId,
        engine,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        status: engine.getStatus()
      };

      this.sessions.set(sessionId, sessionInfo);

      console.log(`✅ 创建会话: ${sessionId} (会议: ${options.meetingId})`);
      this.emit('session_created', sessionInfo);

      return sessionId;

    } catch (error) {
      console.error(`❌ 创建会话失败: ${error}`);
      throw error;
    }
  }

  /**
   * 销毁会话
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    try {
      // 停止引擎
      await session.engine.stop();
      await session.engine.cleanup();

      // 移除会话
      this.sessions.delete(sessionId);

      console.log(`✅ 销毁会话: ${sessionId}`);
      this.emit('session_destroyed', sessionId);

    } catch (error) {
      console.error(`❌ 销毁会话失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取引擎
   */
  getEngine(sessionId: string): RealtimeVoiceprintEngine | undefined {
    const session = this.sessions.get(sessionId);
    return session?.engine;
  }

  /**
   * 获取所有会话
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(
      s => s.status === EngineStatus.RUNNING
    ).length;
  }

  // ============= 音频处理 =============

  /**
   * 发送音频数据到指定会话
   */
  async sendAudio(sessionId: string, audioData: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    try {
      await session.engine.sendAudio(audioData);
      session.lastActivityAt = new Date();

    } catch (error) {
      console.error(`❌ 发送音频失败: ${error}`);
      throw error;
    }
  }

  /**
   * 暂停会话
   */
  pauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    session.engine.pause();
    session.status = EngineStatus.PAUSED;
  }

  /**
   * 恢复会话
   */
  resumeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }

    session.engine.resume();
    session.status = EngineStatus.RUNNING;
  }

  // ============= 资源管理 =============

  /**
   * 清理过期会话
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const inactiveTime = now - session.lastActivityAt.getTime();

      if (inactiveTime > this.config.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      console.log(`🗑️  清理过期会话: ${sessionId}`);
      try {
        await this.destroySession(sessionId);
      } catch (error) {
        console.error(`清理会话失败: ${sessionId}`, error);
      }
    }

    if (expiredSessions.length > 0) {
      this.emit('sessions_cleaned', expiredSessions);
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.config.cleanupInterval);
  }

  /**
   * 停止清理定时器
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // ============= Provider管理 =============

  /**
   * 初始化Providers
   */
  private initializeProviders(): void {
    // 这里使用单例Provider，多个引擎可以共享
    // 实际的连接管理在各个Provider内部进行

    // 使用新的FunASR Provider (默认2pass模式)
    const funasrConfig = this.config.funasrConfig || {
      mode: '2pass',
      language: 'zh',
      device: 'cpu'
    };
    this.transcriptionProvider = new FunAsrTranscriptionProvider(funasrConfig);

    // 使用新的SpeechBrain Provider (默认阈值0.25)
    const speechbrainConfig = this.config.speechbrainConfig || {
      threshold: 0.25,
      device: 'cpu'
    };
    this.voiceprintProvider = new SpeechBrainVoiceprintProvider(speechbrainConfig);
  }

  /**
   * 获取转录Provider
   */
  private getTranscriptionProvider(): ITranscriptionProvider {
    if (!this.transcriptionProvider) {
      throw new Error('Transcription provider 未初始化');
    }
    return this.transcriptionProvider;
  }

  /**
   * 获取声纹Provider
   */
  private getVoiceprintProvider(): IVoiceprintProvider {
    if (!this.voiceprintProvider) {
      throw new Error('Voiceprint provider 未初始化');
    }
    return this.voiceprintProvider;
  }

  // ============= 事件处理 =============

  /**
   * 绑定引擎事件监听器
   */
  private attachEngineListeners(engine: RealtimeVoiceprintEngine, sessionId: string): void {
    // 转录事件
    engine.on('transcript', (segment) => {
      this.emit('transcript', sessionId, segment);
    });

    // 说话人识别事件
    engine.on('speaker_identified', (speakerId, speakerName, confidence) => {
      this.emit('speaker_identified', sessionId, speakerId, speakerName, confidence);
    });

    // 未知说话人事件
    engine.on('speaker_unknown', (embeddingId) => {
      this.emit('speaker_unknown', sessionId, embeddingId);
    });

    // 错误事件
    engine.on('error', (error) => {
      this.emit('error', sessionId, error);
    });

    // 状态变化事件
    engine.on('status', (status) => {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = status;
        session.lastActivityAt = new Date();
      }
      this.emit('status', sessionId, status);
    });
  }

  // ============= 辅助方法 =============

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());

    return {
      totalSessions: this.sessions.size,
      activeSessions: sessions.filter(s => s.status === EngineStatus.RUNNING).length,
      pausedSessions: sessions.filter(s => s.status === EngineStatus.PAUSED).length,
      errorSessions: sessions.filter(s => s.status === EngineStatus.ERROR).length,
      maxConcurrentSessions: this.config.maxConcurrentSessions,
      sessionTimeout: this.config.sessionTimeout,
      sessions: sessions.map(s => ({
        sessionId: s.sessionId,
        meetingId: s.meetingId,
        status: s.status,
        createdAt: s.createdAt,
        lastActivityAt: s.lastActivityAt,
        uptime: Date.now() - s.createdAt.getTime()
      }))
    };
  }

  /**
   * 销毁管理器
   */
  async destroy(): Promise<void> {
    console.log('🛑 正在销毁引擎管理器...');

    // 停止清理定时器
    this.stopCleanupTimer();

    // 销毁所有会话
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.destroySession(sessionId);
      } catch (error) {
        console.error(`销毁会话失败: ${sessionId}`, error);
      }
    }

    console.log('✅ 引擎管理器已销毁');
  }
}

// ============= 单例导出 =============

let managerInstance: VoiceprintEngineManager | null = null;

/**
 * 获取管理器单例
 */
export function getVoiceprintEngineManager(config?: ManagerConfig): VoiceprintEngineManager {
  if (!managerInstance) {
    if (!config) {
      throw new Error('首次调用需要提供配置');
    }
    managerInstance = new VoiceprintEngineManager(config);
  }
  return managerInstance;
}

/**
 * 销毁管理器单例
 */
export async function destroyVoiceprintEngineManager(): Promise<void> {
  if (managerInstance) {
    await managerInstance.destroy();
    managerInstance = null;
  }
}

export default VoiceprintEngineManager;
