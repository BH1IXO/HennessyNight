/**
 * 3D-Speaker 声纹识别Provider (阿里达摩院)
 *
 * 优势:
 * - 针对中文优化，200k中文说话人训练
 * - 业界领先的准确率
 * - 与FunASR同源，无缝集成
 * - 支持多种模型：ERes2Net-Base/Large, CAM++
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  IVoiceprintProvider,
  VoiceprintProfile,
  EnrollmentResult,
  IdentificationResult,
  VerificationResult,
  DiarizationResult,
  ProviderError
} from '../types';

export interface ThreeDSpeakerConfig {
  modelId?: string;  // 模型ID，默认: 'iic/speech_eres2net_sv_zh-cn_16k-common'
  threshold?: number; // 相似度阈值，推荐: 0.50
  device?: 'cpu' | 'cuda';
  pythonPath?: string;
  scriptPath?: string;
}

interface PythonResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * 3D-Speaker声纹识别Provider实现
 */
export class ThreeDSpeakerVoiceprintProvider implements IVoiceprintProvider {
  readonly name = '3D-Speaker';
  readonly type = '3dspeaker' as const;

  private config: Required<ThreeDSpeakerConfig>;
  private profiles: Map<string, VoiceprintProfile> = new Map();

  constructor(config: ThreeDSpeakerConfig = {}) {
    this.config = {
      modelId: config.modelId || 'iic/speech_eres2net_sv_zh-cn_16k-common',
      threshold: config.threshold !== undefined ? config.threshold : 0.50,
      device: config.device || 'cpu',
      pythonPath: config.pythonPath || this.detectPythonPath(),
      scriptPath: config.scriptPath || path.join(process.cwd(), 'python', '3dspeaker_service.py')
    };

    console.log(`[3D-Speaker Provider] 初始化`);
    console.log(`  模型: ${this.config.modelId}`);
    console.log(`  阈值: ${this.config.threshold}`);
    console.log(`  设备: ${this.config.device}`);
  }

  /**
   * 检测Python路径
   */
  private detectPythonPath(): string {
    // 优先使用虚拟环境
    const venvPath = path.join(process.cwd(), 'python', 'pyannote-env');

    if (os.platform() === 'win32') {
      const venvPython = path.join(venvPath, 'Scripts', 'python.exe');
      return venvPython;
    } else {
      const venvPython = path.join(venvPath, 'bin', 'python');
      return venvPython;
    }
  }

  /**
   * 运行Python脚本
   */
  private async runPythonScript(args: string[]): Promise<PythonResult> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.config.pythonPath, [this.config.scriptPath, ...args]);

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
        // 实时输出stderr日志
        console.error(data.toString());
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new ProviderError(
            '3dspeaker',
            'SCRIPT_ERROR',
            `Python script exited with code ${code}: ${stderr}`
          ));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (error) {
          reject(new ProviderError(
            '3dspeaker',
            'PARSE_ERROR',
            `Failed to parse Python output: ${stdout}`
          ));
        }
      });

      process.on('error', (error) => {
        reject(new ProviderError(
          '3dspeaker',
          'SPAWN_ERROR',
          `Failed to spawn Python process: ${error.message}`
        ));
      });
    });
  }

  /**
   * 提取声纹特征
   */
  private async extractEmbedding(audioPath: string): Promise<{ embedding: number[], shape: number[] }> {
    const result = await this.runPythonScript([
      'extract',
      audioPath,
      this.config.modelId,
      this.config.device
    ]);

    if (!result.success) {
      throw new ProviderError('3dspeaker', 'EXTRACTION_ERROR', result.error || 'Failed to extract embedding');
    }

    return {
      embedding: result.embedding,
      shape: result.shape
    };
  }

  /**
   * 创建声纹档案
   */
  async createProfile(userId: string): Promise<VoiceprintProfile> {
    const profileId = `3dspeaker_${userId}_${Date.now()}`;

    const profile: VoiceprintProfile = {
      profileId,
      userId,
      status: 'created',
      enrollmentProgress: 0,
      metadata: {
        model: this.config.modelId,
        provider: '3dspeaker'
      }
    };

    this.profiles.set(profileId, profile);

    console.log(`[3D-Speaker] ✅ 创建声纹档案: ${profileId}`);
    return profile;
  }

  /**
   * 训练声纹（仅需1次）
   */
  async enrollProfile(profileId: string, audioData: Buffer): Promise<EnrollmentResult> {
    console.log(`[3D-Speaker] 训练声纹: ${profileId}`);

    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProviderError('3dspeaker', 'PROFILE_NOT_FOUND', `Profile ${profileId} not found`);
    }

    try {
      // 保存音频到临时文件
      const tempPath = path.join(os.tmpdir(), `3dspeaker_enroll_${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioData);

      // 提取embedding
      const result = await this.extractEmbedding(tempPath);

      // 保存embedding到profile
      profile.metadata = {
        ...profile.metadata,
        embedding: result.embedding,
        embeddingShape: result.shape
      };
      profile.status = 'enrolled';
      profile.enrollmentProgress = 100;

      // 清理临时文件
      await fs.unlink(tempPath).catch(() => {});

      console.log(`[3D-Speaker] ✅ 声纹训练完成: ${profileId}`);

      return {
        success: true,
        profileId,
        enrollmentProgress: 100,
        remainingEnrollments: 0,
        message: 'Enrollment completed'
      };

    } catch (error: any) {
      console.error(`[3D-Speaker] ❌ 声纹训练失败: ${error.message}`);
      throw new ProviderError(
        '3dspeaker',
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
      throw new ProviderError('3dspeaker', 'PROFILE_NOT_FOUND', `Profile ${profileId} not found`);
    }

    this.profiles.delete(profileId);
    console.log(`[3D-Speaker] ✅ 删除声纹档案: ${profileId}`);
  }

  /**
   * 1:N识别（从多个声纹中识别说话人）
   */
  async identifySpeaker(audioData: Buffer, candidateProfileIds: string[]): Promise<IdentificationResult> {
    console.log(`[3D-Speaker] 1:N识别 (候选数: ${candidateProfileIds.length})`);

    try {
      // 保存测试音频到临时文件
      const audioPath = path.join(os.tmpdir(), `3dspeaker_identify_${Date.now()}.wav`);
      await fs.writeFile(audioPath, audioData);

      // 收集所有候选的embeddings
      const referenceEmbeddings: { [key: string]: number[] } = {};
      for (const profileId of candidateProfileIds) {
        const profile = this.profiles.get(profileId);
        if (profile && profile.metadata?.embedding) {
          referenceEmbeddings[profileId] = profile.metadata.embedding;
        }
      }

      if (Object.keys(referenceEmbeddings).length === 0) {
        console.warn('[3D-Speaker] ⚠️ 没有有效的候选声纹');
        return {
          identified: false,
          candidates: []
        };
      }

      // 调用Python识别
      const result = await this.runPythonScript([
        'identify',
        audioPath,
        JSON.stringify(referenceEmbeddings),
        this.config.threshold.toString(),
        this.config.modelId,
        this.config.device
      ]);

      // 清理临时文件
      await fs.unlink(audioPath).catch(() => {});

      if (!result.success) {
        throw new ProviderError('3dspeaker', 'IDENTIFICATION_ERROR', result.error || 'Identification failed');
      }

      if (result.identified) {
        console.log(`[3D-Speaker] ✅ 识别成功: ${result.profileId} (相似度: ${result.confidence?.toFixed(3) || 'N/A'})`);
      } else {
        console.log('[3D-Speaker] ❌ 未识别到匹配的说话人');
      }

      return {
        identified: result.identified,
        profileId: result.profileId,
        speakerId: result.speakerId,
        confidence: result.confidence,
        candidates: result.candidates || []
      };

    } catch (error: any) {
      console.error(`[3D-Speaker] ❌ 1:N识别失败: ${error.message}`);
      throw new ProviderError(
        '3dspeaker',
        'IDENTIFICATION_ERROR',
        'Failed to identify speaker',
        error
      );
    }
  }

  /**
   * 1:1验证（验证音频是否为某人）
   */
  async verifySpeaker(profileId: string, audioData: Buffer): Promise<VerificationResult> {
    console.log(`[3D-Speaker] 1:1验证: ${profileId}`);

    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProviderError('3dspeaker', 'PROFILE_NOT_FOUND', `Profile ${profileId} not found`);
    }

    if (!profile.metadata?.embedding) {
      throw new ProviderError('3dspeaker', 'PROFILE_NOT_ENROLLED', `Profile ${profileId} is not enrolled`);
    }

    try {
      // 保存测试音频
      const audioPath = path.join(os.tmpdir(), `3dspeaker_verify_${Date.now()}.wav`);
      await fs.writeFile(audioPath, audioData);

      // 提取测试音频的embedding
      const testResult = await this.extractEmbedding(audioPath);

      // 清理临时文件
      await fs.unlink(audioPath).catch(() => {});

      // 计算相似度
      const referenceEmbedding = profile.metadata.embedding as number[];
      const testEmbedding = testResult.embedding;

      // 归一化向量
      const normalize = (vec: number[]) => {
        const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
        return vec.map(val => val / (norm + 1e-8));
      };

      const refNorm = normalize(referenceEmbedding);
      const testNorm = normalize(testEmbedding);

      // 余弦相似度
      const similarity = refNorm.reduce((sum, val, idx) => sum + val * testNorm[idx], 0);
      const verified = similarity >= this.config.threshold;

      console.log(
        `[3D-Speaker] ${verified ? '✅' : '❌'} 验证${verified ? '通过' : '失败'}: ` +
        `相似度=${similarity.toFixed(4)}, 阈值=${this.config.threshold}`
      );

      return {
        verified,
        confidence: similarity,
        threshold: this.config.threshold
      };

    } catch (error: any) {
      console.error(`[3D-Speaker] ❌ 1:1验证失败: ${error.message}`);
      throw new ProviderError(
        '3dspeaker',
        'VERIFICATION_ERROR',
        'Failed to verify speaker',
        error
      );
    }
  }

  /**
   * 说话人分离（未实现）
   */
  async diarization(audioData: Buffer): Promise<DiarizationResult> {
    throw new ProviderError(
      '3dspeaker',
      'NOT_IMPLEMENTED',
      'Diarization is not implemented in 3D-Speaker provider'
    );
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.runPythonScript(['test']);
      return result.success !== false;
    } catch (error) {
      console.error('[3D-Speaker] ❌ 健康检查失败:', error);
      return false;
    }
  }
}

export default ThreeDSpeakerVoiceprintProvider;
