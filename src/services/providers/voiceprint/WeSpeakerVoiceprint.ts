/**
 * WeSpeaker声纹识别服务Provider (WeNet团队)
 *
 * 特点:
 * - 业界顶尖的声纹识别工具包
 * - VoxCeleb1: EER 0.723% (ResNet34)
 * - CNSRC 2022冠军系统
 * - 工业级质量，生产就绪
 * - 支持中文和英文模型
 *
 * 技术栈:
 * - 模型: ResNet/ECAPA-TDNN
 * - 训练集: VoxCeleb (英文) / CN-Celeb (中文)
 * - 特征维度: 256
 * - 推荐阈值: 0.50 (平衡模式)
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import {
  IVoiceprintProvider,
  EnrollmentResult,
  VerificationResult,
  IdentificationResult,
  VoiceprintProfile
} from '../../types/voiceprint';

export interface WeSpeakerConfig {
  modelType?: 'chinese' | 'english';  // 模型类型
  threshold?: number;                 // 相似度阈值 (0-1)
  device?: 'cpu' | 'cuda';           // 运行设备
}

interface PythonResult {
  success: boolean;
  error?: string;
  [key: string]: any;
}

/**
 * WeSpeaker声纹识别Provider实现
 *
 * 调用python/wespeaker_service.py进行声纹处理
 */
export class WeSpeakerVoiceprintProvider implements IVoiceprintProvider {
  readonly type = 'wespeaker' as const;

  private pythonPath: string;
  private scriptPath: string;
  private profiles: Map<string, VoiceprintProfile> = new Map();

  constructor(private config: WeSpeakerConfig = {}) {
    // 默认配置
    this.config = {
      modelType: config.modelType || 'chinese',
      threshold: config.threshold !== undefined ? config.threshold : 0.50,
      device: config.device || 'cpu'
    };

    // Python环境路径
    this.pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
    this.scriptPath = path.join(process.cwd(), 'python', 'wespeaker_service.py');

    console.log('[WeSpeaker] Provider初始化完成:', {
      modelType: this.config.modelType,
      threshold: this.config.threshold,
      device: this.config.device
    });
  }

  /**
   * 运行Python脚本
   */
  private async runPythonScript(args: string[]): Promise<PythonResult> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [this.scriptPath, ...args]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        // 打印stderr用于调试（WeSpeaker的日志在stderr）
        if (stderr) {
          console.log('[WeSpeaker] Python stderr:', stderr);
        }

        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          // 解析JSON输出
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (error) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }

  /**
   * 提取音频的声纹特征
   */
  private async extractEmbedding(audioPath: string): Promise<{ success: boolean; embedding?: number[]; error?: string }> {
    const result = await this.runPythonScript([
      'extract',
      audioPath,
      this.config.modelType!,
      this.config.device!
    ]);

    return result;
  }

  /**
   * 注册声纹
   */
  async enrollProfile(profileId: string, audioData: Buffer): Promise<EnrollmentResult> {
    console.log(`[WeSpeaker] 注册声纹: ${profileId}`);

    try {
      // 写入临时WAV文件
      const tempPath = path.join(os.tmpdir(), `wespeaker_enroll_${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioData);

      try {
        // 提取embedding
        const result = await this.extractEmbedding(tempPath);

        if (!result.success || !result.embedding) {
          return {
            success: false,
            error: result.error || 'Failed to extract embedding'
          };
        }

        // 保存profile
        const profile: VoiceprintProfile = {
          profileId,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            embedding: result.embedding,
            model: this.config.modelType,
            device: this.config.device
          }
        };

        this.profiles.set(profileId, profile);

        console.log(`[WeSpeaker] ✅ 声纹注册成功: ${profileId}`);

        return {
          success: true,
          profileId,
          enrollmentProgress: 100
        };

      } finally {
        // 清理临时文件
        await fs.unlink(tempPath).catch(() => {});
      }

    } catch (error: any) {
      console.error('[WeSpeaker] 注册失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 1:1 声纹验证
   */
  async verifyProfile(profileId: string, audioData: Buffer): Promise<VerificationResult> {
    console.log(`[WeSpeaker] 1:1验证: ${profileId}`);

    try {
      // 检查profile是否存在
      const profile = this.profiles.get(profileId);
      if (!profile || !profile.metadata?.embedding) {
        return {
          success: false,
          error: 'Profile not found or no embedding available'
        };
      }

      // 写入临时WAV文件
      const tempPath = path.join(os.tmpdir(), `wespeaker_verify_${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioData);

      try {
        // 提取测试音频的embedding
        const result = await this.extractEmbedding(tempPath);

        if (!result.success || !result.embedding) {
          return {
            success: false,
            error: result.error || 'Failed to extract test embedding'
          };
        }

        // 计算相似度（使用Python服务的compute_similarity逻辑）
        const similarity = this.computeSimilarity(
          profile.metadata.embedding,
          result.embedding
        );

        const verified = similarity >= this.config.threshold!;

        console.log(`[WeSpeaker] 相似度: ${similarity.toFixed(4)}, 阈值: ${this.config.threshold}, 结果: ${verified ? '✅ 通过' : '❌ 未通过'}`);

        return {
          success: true,
          verified,
          confidence: similarity,
          threshold: this.config.threshold
        };

      } finally {
        // 清理临时文件
        await fs.unlink(tempPath).catch(() => {});
      }

    } catch (error: any) {
      console.error('[WeSpeaker] 验证失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 1:N 声纹识别
   */
  async identifyProfile(audioData: Buffer, candidateProfileIds?: string[]): Promise<IdentificationResult> {
    console.log(`[WeSpeaker] 1:N识别, 候选人数: ${candidateProfileIds?.length || this.profiles.size}`);

    try {
      // 确定候选profiles
      const candidates = candidateProfileIds
        ? candidateProfileIds.map(id => this.profiles.get(id)).filter(Boolean) as VoiceprintProfile[]
        : Array.from(this.profiles.values());

      if (candidates.length === 0) {
        return {
          success: true,
          identified: false,
          candidates: []
        };
      }

      // 写入临时WAV文件
      const tempPath = path.join(os.tmpdir(), `wespeaker_identify_${Date.now()}.wav`);
      await fs.writeFile(tempPath, audioData);

      try {
        // 提取测试音频的embedding
        const result = await this.extractEmbedding(tempPath);

        if (!result.success || !result.embedding) {
          return {
            success: false,
            error: result.error || 'Failed to extract test embedding'
          };
        }

        // 计算与所有候选人的相似度
        const scores = candidates.map(profile => ({
          profileId: profile.profileId,
          confidence: this.computeSimilarity(
            profile.metadata?.embedding || [],
            result.embedding!
          )
        }));

        // 按相似度降序排序
        scores.sort((a, b) => b.confidence - a.confidence);

        // 找到最高分
        const bestMatch = scores[0];
        const identified = bestMatch.confidence >= this.config.threshold!;

        if (identified) {
          console.log(`[WeSpeaker] ✅ 识别为: ${bestMatch.profileId} (相似度: ${bestMatch.confidence.toFixed(4)})`);
        } else {
          console.log(`[WeSpeaker] ❌ 未识别到匹配的说话人 (最高分: ${bestMatch.confidence.toFixed(4)} < ${this.config.threshold})`);
        }

        return {
          success: true,
          identified,
          profileId: identified ? bestMatch.profileId : undefined,
          speakerId: identified ? bestMatch.profileId : undefined,
          confidence: bestMatch.confidence,
          candidates: scores
        };

      } finally {
        // 清理临时文件
        await fs.unlink(tempPath).catch(() => {});
      }

    } catch (error: any) {
      console.error('[WeSpeaker] 识别失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 计算余弦相似度（本地实现，与Python保持一致）
   */
  private computeSimilarity(embedding1: number[], embedding2: number[]): number {
    // L2归一化
    const norm1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0)) || 1e-8;
    const norm2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0)) || 1e-8;

    const emb1 = embedding1.map(val => val / norm1);
    const emb2 = embedding2.map(val => val / norm2);

    // 余弦相似度
    const dotProduct = emb1.reduce((sum, val, i) => sum + val * emb2[i], 0);

    // 映射到[0, 1]
    return (dotProduct + 1) / 2;
  }

  /**
   * 删除声纹
   */
  async deleteProfile(profileId: string): Promise<boolean> {
    const deleted = this.profiles.delete(profileId);
    if (deleted) {
      console.log(`[WeSpeaker] 声纹已删除: ${profileId}`);
    }
    return deleted;
  }

  /**
   * 获取声纹列表
   */
  async listProfiles(): Promise<VoiceprintProfile[]> {
    return Array.from(this.profiles.values());
  }

  /**
   * 批量删除声纹
   */
  async deleteProfiles(profileIds: string[]): Promise<{ success: boolean; deletedCount: number }> {
    let deletedCount = 0;
    for (const id of profileIds) {
      if (this.profiles.delete(id)) {
        deletedCount++;
      }
    }
    console.log(`[WeSpeaker] 批量删除完成: ${deletedCount}/${profileIds.length}`);
    return { success: true, deletedCount };
  }
}
