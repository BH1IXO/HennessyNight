# 🎤 Whisper快速开始指南

## ✅ 已完成配置

- ✅ Whisper Python脚本已创建
- ✅ Node.js Provider已集成
- ✅ 环境变量已配置
- ✅ 测试脚本已准备

## 🚀 3步安装Whisper

### 第1步：确保Python环境存在

```bash
cd D:\Hennessy.uno\meeting-system-backend\python

# 如果还没有创建Python环境，运行：
setup.bat
```

### 第2步：安装Whisper（自动化）

```bash
# 运行自动安装脚本
setup-whisper.bat
```

**这个脚本会：**
- ✅ 激活Python环境
- ✅ 安装OpenAI Whisper
- ✅ 自动测试安装
- ✅ 显示配置说明

**预计时间：** 2-5分钟（首次下载模型可能需要更长时间）

### 第3步：验证安装

```bash
# 手动测试（可选）
cd python
pyannote-env\Scripts\activate
python test_whisper.py
```

**看到这个输出表示成功：**
```
✅ Whisper 已安装
✅ PyTorch 版本: 2.x.x
✅ 模型加载成功
✅ 测试完成！
```

---

## 🧪 测试转录功能

### 方式1：通过API测试

启动服务器后：

```bash
# 启动服务器
npm run dev

# 在另一个终端上传音频文件
curl -X POST http://localhost:3000/api/v1/audio/upload ^
  -F "audio=@test.wav" ^
  -F "meetingId=meeting_123"
```

### 方式2：直接使用Python脚本测试

```bash
cd python
pyannote-env\Scripts\activate

# 转录音频文件
python whisper_service.py test.wav zh base
```

**参数说明：**
- `test.wav` - 音频文件路径
- `zh` - 语言（zh=中文, en=英文）
- `base` - 模型大小（tiny, base, small, medium, large）

---

## ⚙️ 配置说明

配置文件：`D:\Hennessy.uno\meeting-system-backend\.env`

```env
# 转录服务提供商
TRANSCRIPTION_PROVIDER=whisper  ✅ 已配置

# Whisper配置
WHISPER_MODEL=base              # 推荐
WHISPER_LANGUAGE=zh             # 中文
WHISPER_DEVICE=cpu              # CPU模式
```

### 模型大小选择

| 模型 | 大小 | 速度 | 准确率 | 推荐场景 |
|------|------|------|--------|----------|
| tiny | ~75MB | 非常快 | 低 | 快速测试 |
| **base** | ~150MB | 快 | 中 | **开发推荐** ⭐ |
| small | ~500MB | 中等 | 好 | 一般使用 |
| medium | ~1.5GB | 慢 | 很好 | 生产环境 |
| large | ~3GB | 很慢 | 最好 | 高质量需求 |

**建议：**
- 开发测试：使用 `base`
- 生产环境：使用 `small` 或 `medium`

---

## 📊 Whisper vs 讯飞对比

| 功能 | Whisper | 讯飞 |
|------|---------|------|
| **费用** | 完全免费 ✅ | 有免费额度 |
| **配置** | 简单（2步） | 需要注册 |
| **实时性** | ❌ 不支持 | ✅ 支持 |
| **准确率** | 优秀 | 优秀 |
| **隐私** | 本地处理 ✅ | 云端处理 |
| **网络** | 离线可用 ✅ | 需要联网 |

**结论：**
- 录制好的音频 → **Whisper**（免费、效果好）
- 实时会议转录 → **讯飞**（需要注册）

---

## 💡 使用场景

### 场景1：离线音频转录

```typescript
// 上传音频文件
POST /api/v1/audio/upload
{
  "audio": <file>,
  "meetingId": "meeting_123"
}

// 处理音频（自动使用Whisper）
POST /api/v1/audio/process
{
  "audioFileId": "audio_xxx"
}

// 查看转录结果
GET /api/v1/transcripts/meeting/meeting_123
```

### 场景2：批量处理会议录音

1. 导入会议录音文件
2. 系统自动调用Whisper转录
3. 生成转录文本
4. AI生成会议纪要

**完全免费！无需任何API密钥！**

---

## 🐛 常见问题

### Q: 首次运行很慢？
**A:** 正常！首次运行会下载模型（~150MB），之后会使用缓存。

### Q: 模型保存在哪里？
**A:**
- Windows: `C:\Users\用户名\.cache\whisper\`
- Linux/Mac: `~/.cache/whisper/`

### Q: 如何切换到GPU加速？
**A:**
```bash
# 安装CUDA版PyTorch
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# 修改.env
WHISPER_DEVICE=cuda
```

速度提升10-20倍！

### Q: 转录不准确怎么办？
**A:** 尝试更大的模型：
```env
WHISPER_MODEL=small  # 或 medium
```

### Q: 支持哪些语言？
**A:** Whisper支持99种语言！常用：
- `zh` - 中文
- `en` - 英文
- `ja` - 日语
- `ko` - 韩语

### Q: 可以和讯飞一起使用吗？
**A:** 可以！系统支持多Provider：
- Whisper处理录制文件
- 讯飞处理实时转录

---

## ✅ 检查清单

安装完成后，确认：

- [ ] Python环境已创建（`python/pyannote-env/`）
- [ ] Whisper已安装（`pip list | grep whisper`）
- [ ] 测试通过（`python test_whisper.py`）
- [ ] .env配置正确（`TRANSCRIPTION_PROVIDER=whisper`）
- [ ] 服务器可以启动（`npm run dev`）

---

## 🎯 下一步

### 现在可以：
1. ✅ 启动服务器测试基础功能
2. ✅ 上传音频文件进行转录
3. ✅ 使用AI生成会议纪要

### 未来可选：
- 安装GPU版PyTorch加速
- 配置讯飞实现实时转录
- 结合pyannote进行声纹识别

---

## 📚 相关文档

- `docs/WHISPER_SETUP.md` - 详细配置指南
- `docs/TRANSCRIPTION_OPTIONS.md` - 方案对比
- `python/whisper_service.py` - Python脚本
- `src/services/providers/transcription/WhisperTranscription.ts` - Node.js集成

---

**🎉 现在运行 `python\setup-whisper.bat` 开始安装！**
