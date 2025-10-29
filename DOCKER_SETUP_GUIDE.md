# Docker 安装指南

## 快速安装步骤

### 1. 下载 Docker Desktop

访问官方网站下载：
```
https://www.docker.com/products/docker-desktop/
```

**选择对应版本：**
- Windows 10/11 (64-bit): Docker Desktop for Windows
- 需要 WSL 2 支持

### 2. 安装 Docker Desktop

1. 运行下载的安装程序 `Docker Desktop Installer.exe`
2. **勾选选项**：
   - [x] Use WSL 2 instead of Hyper-V (推荐)
   - [x] Add shortcut to desktop
3. 点击 "OK" 开始安装
4. 等待安装完成（约 3-5 分钟）
5. **点击 "Close and restart"** - **必须重启电脑！**

### 3. 重启后验证安装

重启电脑后，打开命令行窗口，运行：

```bash
docker --version
```

**预期输出：**
```
Docker version 24.x.x, build xxxxxxx
```

如果看到版本号，说明安装成功！

### 4. 启动 PostgreSQL 数据库

安装成功后，告诉我 **"Docker装好了"**，我会帮你：

1. 启动 PostgreSQL 容器（10秒）
2. 初始化数据库（30秒）
3. 启动后端服务器（20秒）
4. 运行基础测试（30秒）

**总共约 90秒 就能完成整个系统启动！**

---

## 常见问题

### Q1: 安装时提示需要 WSL 2？

**解决方案：**
```bash
# 以管理员身份运行 PowerShell，执行：
wsl --install
```

然后重启电脑，再安装 Docker Desktop。

### Q2: 安装后 Docker 无法启动？

**检查步骤：**
1. 确认已重启电脑
2. 检查 WSL 2 是否安装：`wsl --version`
3. 检查虚拟化是否启用：
   - 打开任务管理器 → 性能 → CPU
   - 查看 "虚拟化" 是否显示 "已启用"

### Q3: 不想安装 Docker 怎么办？

**替代方案：**
1. **在线数据库**（推荐）：
   - 使用 Neon.tech 免费 PostgreSQL
   - 2分钟配置完成
   - 无需本地安装

2. **本地 PostgreSQL**：
   - 直接安装 PostgreSQL 14
   - 比 Docker 更简单

---

## 下一步

安装完成后，告诉我：

> **"Docker装好了"**

我会立即帮你完成剩余配置！

---

**当前系统状态：**
- ✅ 后端代码 100% 完成
- ✅ Python 环境配置完成
- ✅ Whisper + Vosk 已安装
- 🔄 Vosk 模型下载中（17%）
- ⏸️ 等待 Docker 安装

**安装 Docker 后，你就可以测试完整的实时声纹识别功能了！**
