/**
 * SpeechBrain声纹识别Provider
 * 基于ECAPA-TDNN模型的声纹识别
 *
 * 特性：
 * - 声纹提取（Embedding Extraction）
 * - 1:1验证（Speaker Verification）
 * - 1:N识别（Speaker Identification）
 * - 完全免费开源
 * - 无需HuggingFace Token
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  IVoiceprintProvider,
  VoiceprintProfile,
  EnrollmentResult,
  IdentificationResult,
  VerificationResult,
  ProviderError,
  ProfileNotFoundError
} from '../types';

interface SpeechBrainConfig {
  pythonPath?: string;        // Python解释器路径
  device?: 'cpu' | 'cuda';    // 运行设备
  threshold?: number;         // 相似度阈值 (0-1, 越小越严格)
  tempDir?: string;           // 临时文件目录
}

interface StoredProfile {
  profileId: string;
  userId: string;
  embedding: number[];        // 声纹特征向量
  enrollmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class SpeechBrainVoiceprintProvider implements IVoiceprintProvider {
  readonly name = 'SpeechBrain Speaker Recognition';
  readonly type = 'speechbrain' as const;

  private config: SpeechBrainConfig;
  private profiles: Map<string, StoredProfile> = new Map();
  private pythonPath: string;
  private tempDir: string;

  constructor(config: SpeechBrainConfig = {}) {
    this.config = {
      pythonPath: config.pythonPath,
      device: config.device || 'cpu',
      threshold: config.threshold || 0.25,
      tempDir: config.tempDir || path.join(process.cwd(), 'temp', 'speechbrain')
    };

    // Python环境路径
    const pythonEnvPath = path.join(process.cwd(), 'python', 'pyannote-env');
    this.pythonPath = this.config.pythonPath || path.join(
      pythonEnvPath,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python'
    );

    this.tempDir = this.config.tempDir!;
    this.initTempDir();
  }

  /**
   * 创建声纹档案
   */
  async createProfile(userId: string): Promise<VoiceprintProfile> {
    const profileId = `speechbrain_${uuidv4()}`;

    const profile: StoredProfile = {
      profileId,
      userId,
      embedding: [],
      enrollmentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.profiles.set(profileId, profile);

    console.log(`✅ 创建声纹档案: ${profileId} (用户: ${userId})`);

    return {
      profileId,
      userId,
      status: 'created',
      enrollmentProgress: 0
    };
  }

  /**
   * 训练声纹
   */
  async enrollProfile(
    profileId: string,
    audioData: Buffer
  ): Promise<EnrollmentResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProfileNotFoundError('speechbrain', profileId);
    }

    try {
      console.log(`🎤 开始声纹训练: ${profileId}`);

      // 保存音频到临时文件
      const audioPath = await this.saveAudioTemp(audioData);

      // 提取声纹特征
      const result = await this.extractEmbedding(audioPath);

      if (!result.success) {
        throw new Error(result.error);
      }

      // 保存embedding
      profile.embedding = result.embedding;
      profile.enrollmentCount++;
      profile.updatedAt = new Date();

      // 清理临时文件
      await fs.unlink(audioPath).catch(() => {});

      // SpeechBrain通常1次训练即可
      const progress = 100;

      console.log(`✅ 声纹训练完成: ${profileId} (${profile.enrollmentCount}次)`);

      return {
        success: true,
        profileId,
        enrollmentProgress: progress,
        remainingEnrollments: 0,
        message: '声纹训练完成'
      };

    } catch (error: any) {
      console.error(`❌ 声纹训练失败: ${error.message}`);
      throw new ProviderError(
        'speechbrain',
        'ENROLLMENT_ERROR',
        'Failed to enroll profile',
        error
      );
    }
  }

  /**
   * 删除声纹档案
   */
  async deleteProfile(profileId: string): Promise<void> {
    if (!this.profiles.has(profileId)) {
      throw new ProfileNotFoundError('speechbrain', profileId);
    }
    this.profiles.delete(profileId);
    console.log(`🗑️  删除声纹档案: ${profileId}`);
  }

  /**
   * 1:N识别（从多个声纹中识别说话人）
   */
  async identifySpeaker(
    audioData: Buffer,
    candidateProfileIds: string[]
  ): Promise<IdentificationResult> {
    try {
      console.log(`🔍 开始1:N声纹识别 (候选: ${candidateProfileIds.length})`);

      // 保存音频
      const audioPath = await this.saveAudioTemp(audioData);

      // 构建参考声纹列表
      const referenceEmbeddings = [];
      for (const profileId of candidateProfileIds) {
        const profile = this.profiles.get(profileId);
        if (!profile || profile.embedding.length === 0) {
          console.warn(`⚠️  跳过档案 ${profileId}: 未训练或不存在`);
          continue;
        }

        referenceEmbeddings.push({
          profileId,
          embedding: profile.embedding
        });
      }

      if (referenceEmbeddings.length === 0) {
        console.warn('⚠️  没有可用的参考声纹');
        return { identified: false };
      }

      // 调用Python脚本进行识别
      const result = await this.runIdentify(
        audioPath,
        referenceEmbeddings,
        this.config.threshold!
      );

      // 清理临时文件
      await fs.unlink(audioPath).catch(() => {});

      if (result.identified) {
        console.log(`✅ 识别成功: ${result.profileId} (置信度: ${result.confidence?.toFixed(3) || 'N/A'})`);
      } else {
        console.log('❌ 未识别到匹配的说话人');
      }

      return result;

    } catch (error: any) {
      console.error(`❌ 1:N识别失败: ${error.message}`);
      throw new ProviderError(
        'speechbrain',
        'IDENTIFICATION_ERROR',
        'Failed to identify speaker',
        error
      );
    }
  }

  /**
   * 1:1验证（验证音频是否为某人）
   */
  async verifySpeaker(
    profileId: string,
    audioData: Buffer
  ): Promise<VerificationResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProfileNotFoundError('speechbrain', profileId);
    }

    if (profile.embedding.length === 0) {
      throw new Error('声纹档案未训练');
    }

    try {
      console.log(`🔐 开始1:1声纹验证: ${profileId}`);

      // 保存音频到临时文件（两个）
      const audioPath1 = await this.saveAudioTemp(audioData);
      const audioPath2 = await this.saveEmbeddingAsAudio(profile.embedding);

      // 调用Python脚本进行验证
      const result = await this.runVerify(
        audioPath1,
        audioPath2,
        this.config.threshold!
      );

      // 清理临时文件
      await fs.unlink(audioPath1).catch(() => {});
      await fs.unlink(audioPath2).catch(() => {});

      if (result.verified) {
        console.log(`✅ 验证通过 (置信度: ${result.confidence.toFixed(3)})`);
      } else {
        console.log(`❌ 验证失败 (置信度: ${result.confidence.toFixed(3)})`);
      }

      return result;

    } catch (error: any) {
      console.error(`❌ 1:1验证失败: ${error.message}`);
      throw new ProviderError(
        'speechbrain',
        'VERIFICATION_ERROR',
        'Failed to verify speaker',
        error
      );
    }
  }

  /**
   * SpeechBrain不支持说话人分离
   */
  async diarization(): Promise<any> {
    throw new Error('SpeechBrain不支持说话人分离，请使用FunASR或pyannote.audio');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const scriptPath = path.join(process.cwd(), 'python', 'speechbrain_voiceprint.py');
      const python = spawn(this.pythonPath, [scriptPath, 'test']);

      return new Promise((resolve) => {
        let output = '';

        python.stdout.on('data', (data) => {
          output += data.toString();
        });

        python.on('close', (code) => {
          if (code !== 0) {
            resolve(false);
            return;
          }

          try {
            const result = JSON.parse(output);
            resolve(result.success === true);
          } catch {
            resolve(false);
          }
        });

        python.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 初始化临时目录
   */
  private async initTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('创建临时目录失败:', error);
    }
  }

  /**
   * 保存音频到临时文件
   */
  private async saveAudioTemp(audioData: Buffer): Promise<string> {
    const filename = `audio_${uuidv4()}.wav`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, audioData);
    return filepath;
  }

  /**
   * 将embedding保存为音频文件（用于验证）
   * 注意：这是一个占位实现，实际应该使用embedding直接比对
   */
  private async saveEmbeddingAsAudio(embedding: number[]): Promise<string> {
    const filename = `embedding_${uuidv4()}.json`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, JSON.stringify(embedding));
    return filepath;
  }

  /**
   * 提取声纹特征
   */
  private extractEmbedding(audioPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'speechbrain_voiceprint.py');

      const python = spawn(this.pythonPath, [
        scriptPath,
        'extract',
        audioPath,
        this.config.device!
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`提取embedding失败 (退出码: ${code})\n${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (error) {
          reject(new Error(`解析结果失败: ${output}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`启动Python进程失败: ${error.message}`));
      });
    });
  }

  /**
   * 运行1:N识别
   */
  private runIdentify(
    audioPath: string,
    referenceEmbeddings: any[],
    threshold: number
  ): Promise<IdentificationResult> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'speechbrain_voiceprint.py');

      const python = spawn(this.pythonPath, [
        scriptPath,
        'identify',
        audioPath,
        JSON.stringify(referenceEmbeddings),
        threshold.toString(),
        this.config.device!
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`识别失败 (退出码: ${code})\n${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          if (!result.success) {
            reject(new Error(result.error));
            return;
          }
          resolve(result);
        } catch (error) {
          reject(new Error(`解析结果失败: ${output}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`启动Python进程失败: ${error.message}`));
      });
    });
  }

  /**
   * 运行1:1验证
   */
  private runVerify(
    audioPath1: string,
    audioPath2: string,
    threshold: number
  ): Promise<VerificationResult> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'speechbrain_voiceprint.py');

      const python = spawn(this.pythonPath, [
        scriptPath,
        'verify',
        audioPath1,
        audioPath2,
        threshold.toString(),
        this.config.device!
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`验证失败 (退出码: ${code})\n${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);
          if (!result.success) {
            reject(new Error(result.error));
            return;
          }
          resolve(result);
        } catch (error) {
          reject(new Error(`解析结果失败: ${output}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`启动Python进程失败: ${error.message}`));
      });
    });
  }

  /**
   * 保存档案到文件（持久化）
   */
  async saveProfiles(filepath: string): Promise<void> {
    const data = Array.from(this.profiles.values());
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    console.log(`💾 保存声纹档案: ${filepath} (${data.length}个)`);
  }

  /**
   * 从文件加载档案
   */
  async loadProfiles(filepath: string): Promise<void> {
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      const profiles: StoredProfile[] = JSON.parse(data);

      this.profiles.clear();
      for (const profile of profiles) {
        this.profiles.set(profile.profileId, profile);
      }

      console.log(`📂 加载声纹档案: ${filepath} (${profiles.length}个)`);
    } catch (error) {
      console.warn('⚠️  加载声纹档案失败:', error);
    }
  }
}

export default SpeechBrainVoiceprintProvider;
