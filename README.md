# OpenClaw Browser Sidecar

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 TypeScript 的 Kubernetes Sidecar 浏览器自动化工具，专为 OpenClaw 平台设计。通过 Playwright 提供强大的浏览器控制能力，支持会话持久化、加密存储和健康检查。

## 📋 目录

- [功能特性](#功能特性)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [安装](#安装)
- [配置](#配置)
- [API 参考](#api-参考)
- [使用示例](#使用示例)
- [Kubernetes 部署](#kubernetes-部署)
- [安全性](#安全性)
- [开发指南](#开发指南)
- [故障排除](#故障排除)
- [许可证](#许可证)

---

## 功能特性

### 🌐 浏览器自动化
- **页面导航** - 支持多种等待策略（网络空闲、DOM 加载、元素出现）
- **元素操作** - 点击、输入、滚动、截图等
- **多重选择器** - 支持 CSS、XPath、文本、角色、TestID、标签、占位符等多种选择方式

### 🔐 会话管理
- **登录态保存** - 自动保存 Cookies 和 LocalStorage
- **会话恢复** - 快速恢复登录状态，无需重复登录
- **加密存储** - 使用 AES-256-GCM 加密敏感数据
- **自动过期** - 会话 7 天自动过期，保证安全性

### 🚀 性能与可靠性
- **资源监控** - 实时 CPU 和内存使用监控
- **健康检查** - 提供 `/health` 和 `/ready` 端点，支持 Kubernetes 探针
- **优雅关闭** - 信号处理和资源清理
- **连接管理** - TCP 和 Unix Socket 双模式支持

### ☁️ 云原生支持
- **Kubernetes 友好** - 完整的健康检查和就绪探针
- **容器化部署** - 提供 Dockerfile 和 Kubernetes 配置
- **共享卷存储** - 支持多 Pod 间会话共享

---

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│                  OpenClaw 平台                       │
│                                                      │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │   主应用     │  TCP/   │  Browser Sidecar     │  │
│  │  (Client)    │───────▶│  ┌────────────────┐  │  │
│  │              │  Socket │  │  TCPServer     │  │  │
│  └──────────────┘         │  │  ├─ Handlers   │  │  │
│                           │  │  ├─ Browser    │  │  │
│                           │  │  └─ Session    │  │  │
│                           │  └────────────────┘  │  │
│                           │         │             │  │
│                           │         ▼             │  │
│                           │  ┌────────────────┐  │  │
│                           │  │  Playwright    │  │  │
│                           │  │  (Chromium)    │  │  │
│                           │  └────────────────┘  │  │
│                           └──────────────────────┘  │
│                                    │                │
│                                    ▼                │
│                           ┌────────────────┐       │
│                           │  会话存储      │       │
│                           │  (加密文件)    │       │
│                           └────────────────┘       │
└─────────────────────────────────────────────────────┘
```

---

## 快速开始

### 前置要求

- Node.js >= 20.0.0
- npm 或 yarn
- Playwright 浏览器

### 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd oh-agent-browser

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

### 启动服务器

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

服务器将在以下端口启动：
- **TCP 服务**: 3001 (可通过 `PORT` 环境变量修改)
- **健康检查**: 8080 (`/health`, `/ready`)

---

## 安装

### 作为依赖安装

```bash
npm install @oh-agent/browser-sidecar
```

### Docker 部署

```bash
# 构建镜像
docker build -t browser-sidecar .

# 运行容器
docker run -d \
  -p 3001:3001 \
  -p 8080:8080 \
  -v /tmp/sessions:/tmp/sessions \
  -e SESSION_ENCRYPTION_KEY=your-secret-key \
  browser-sidecar
```

---

## 配置

### 环境变量

| 变量名 | 描述 | 默认值 |
|--------|------|--------|
| `PORT` | TCP 服务端口 | `3001` |
| `SOCKET_PATH` | Unix Socket 路径 | - |
| `SESSION_STORAGE_PATH` | 会话存储路径 | `/tmp/sessions` |
| `SESSION_ENCRYPTION_KEY` | 会话加密密钥 | `default-key` |
| `BROWSER_HEADLESS` | 无头模式 | `true` |
| `LOG_LEVEL` | 日志级别 | `info` |

### 配置示例

```typescript
import { createServer } from '@oh-agent/browser-sidecar';

const server = createServer({
  port: 3001,
  sessionStoragePath: '/data/sessions',
  encryptionKey: process.env.SESSION_ENCRYPTION_KEY,
  headless: true,
  defaultTimeout: 30000,
  logLevel: 'debug',
});
```

---

## API 参考

### 客户端初始化

```typescript
import { BrowserSidecarClient } from '@oh-agent/browser-sidecar';

// TCP 连接
const client = new BrowserSidecarClient({
  host: 'localhost',
  port: 3001,
});

// Unix Socket 连接
const client = new BrowserSidecarClient({
  socketPath: '/tmp/browser-sidecar.sock',
});
```

### 页面导航

```typescript
// 基本导航
await client.navigate('https://example.com');

// 等待网络空闲
await client.navigate('https://example.com', { 
  networkIdle: true,
  timeout: 10000 
});

// 等待特定元素
await client.navigate('https://example.com', {
  selector: '#content',
  timeout: 5000
});
```

### 元素操作

```typescript
// 点击元素
await client.click({ css: 'button.submit' });
await client.click({ xpath: '//button[@type="submit"]' });
await client.click({ text: '登录' });
await client.click({ role: 'button' });
await client.click({ testId: 'submit-btn' });
await client.click({ label: '用户名' });
await client.click({ placeholder: '请输入邮箱' });

// 输入文本
await client.type({ css: '#username' }, 'user@example.com');
await client.type({ css: '#password' }, 'password123');
```

### 等待策略

```typescript
// 等待网络空闲
await client.wait({ networkIdle: true });

// 等待元素出现
await client.wait({ selector: '#result', timeout: 5000 });

// 等待页面加载完成
await client.wait({ load: true });
await client.wait({ domContentLoaded: true });

// 等待自定义函数
await client.wait({ 
  function: 'document.querySelector("#status").textContent === "完成"' 
});

// 等待元素可见
await client.wait({ 
  visible: true,
  selector: '#modal',
  timeout: 5000
});

// 等待元素可点击
await client.wait({ 
  clickable: true,
  selector: '#submit-btn',
  timeout: 5000
});
```

### 截图

```typescript
// 全页面截图
const screenshot = await client.screenshot({ fullPage: true });

// 特定元素截图
const screenshot = await client.screenshot({ 
  selector: { css: '#chart' },
  type: 'png'
});

// 返回 Base64 编码
console.log(screenshot.base64);
```

### 会话管理

```typescript
// 保存登录会话
await client.authSave('user-session', 'example.com');

// 恢复登录会话
await client.authRestore('user-session');

// 获取浏览器状态
const state = await client.getState();
console.log(state);
// {
//   url: 'https://example.com/dashboard',
//   title: 'Dashboard',
//   isConnected: true,
//   cookies: 5
// }
```

### 关闭浏览器

```typescript
await client.close();
```

### 悬停元素

```typescript
await client.hover({ css: '#menu-item' });
```

### 批量填写表单

```typescript
await client.fillForm([
  { selector: { css: '#name' }, value: '张三' },
  { selector: { css: '#email' }, value: 'zhang@example.com' },
]);
```

### 提交表单

```typescript
await client.submit({ css: '#login-form' });
```

### 智能操作

```typescript
// 智能点击 - 尝试多个选择器直到成功
await client.smartClick([
  { css: '#submit-btn' },
  { role: 'button' },
  { text: '提交' },
]);

// 智能输入 - 尝试多个选择器直到成功
await client.smartType([
  { css: '#username' },
  { label: '用户名' },
], 'user@example.com');

// 重试操作
const result = await client.retry(async () => {
  return await client.click({ css: '#dynamic-button' });
}, 3, 1000);
```

### 调试工具

```typescript
// 启用调试模式
client.enableDebug();

// 调试截图
const screenshot = await client.debugScreenshot('before-action');

// 获取调试状态
const state = await client.debugState();

// 禁用调试模式
client.disableDebug();
```

### 元素发现

```typescript
// 发现页面上所有可交互元素
const result = await client.discover();

// 过滤特定类型的元素
const inputsAndButtons = await client.discover(['input', 'button']);

// 结果包含:
console.log(result.data.elements);     // 所有元素
console.log(result.data.loginFields); // 检测到的登录字段
```

### 智能登录

```typescript
// 自动检测登录字段并登录
const result = await client.smartLogin({
  username: 'user@example.com',
  password: 'password123',
});

// 或者先导航到登录页面
await client.smartLogin({
  username: 'user@example.com',
  password: 'password123',
}, 'https://example.com/login');
```

### AI 自动化

```typescript
// 发现元素供 AI 决策下一步操作
const result = await client.autoPerform(
  '登录并进入设置页面',
  { username: 'user@example.com', password: 'pass123' },
  'https://example.com'
);

// 结果包含发现的元素和登录字段
console.log(result.data.elements);     // 供 AI 使用的元素列表
console.log(result.data.loginFields);  // 登录字段信息
```

---

## 使用示例

### 完整登录流程

```typescript
import { BrowserSidecarClient } from '@oh-agent/browser-sidecar';

async function loginFlow() {
  const client = new BrowserSidecarClient({ 
    host: 'localhost', 
    port: 3001 
  });

  try {
    // 1. 导航到登录页面
    await client.navigate('https://example.com/login');
    
    // 2. 输入凭据
    await client.type({ css: '#username' }, 'user@example.com');
    await client.type({ css: '#password' }, 'password123');
    
    // 3. 点击登录按钮
    await client.click({ css: 'button[type="submit"]' });
    
    // 4. 等待登录完成
    await client.wait({ networkIdle: true });
    
    // 5. 保存会话
    await client.authSave('my-session');
    
    // 6. 验证状态
    const state = await client.getState();
    console.log('登录成功:', state.url);
    
  } finally {
    await client.close();
  }
}
```

### 会话复用示例

```typescript
async function reuseSession() {
  const client = new BrowserSidecarClient({ 
    host: 'localhost', 
    port: 3001 
  });

  try {
    // 恢复之前的会话
    await client.authRestore('my-session');
    
    // 直接访问需要登录的页面
    await client.navigate('https://example.com/dashboard');
    
    // 无需重新登录即可操作
    const state = await client.getState();
    console.log('已恢复会话:', state.url);
    
  } finally {
    await client.close();
  }
}
```

### 批量操作示例

```typescript
async function batchOperations() {
  const client = new BrowserSidecarClient({ 
    host: 'localhost', 
    port: 3001 
  });

  try {
    await client.navigate('https://example.com/form');
    
    // 批量填写表单
    const fields = [
      { selector: { css: '#name' }, value: '张三' },
      { selector: { css: '#email' }, value: 'zhang@example.com' },
      { selector: { css: '#phone' }, value: '13800138000' },
    ];
    
    for (const field of fields) {
      await client.type(field.selector, field.value);
    }
    
    // 提交表单
    await client.click({ css: 'button[type="submit"]' });
    await client.wait({ networkIdle: true });
    
    // 截图验证
    const screenshot = await client.screenshot({ fullPage: true });
    console.log('表单提交完成');
    
  } finally {
    await client.close();
  }
}
```

---

## Kubernetes 部署

### Deployment 配置

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: browser-sidecar
spec:
  replicas: 1
  selector:
    matchLabels:
      app: browser-sidecar
  template:
    metadata:
      labels:
        app: browser-sidecar
    spec:
      containers:
        - name: browser-sidecar
          image: browser-sidecar:latest
          ports:
            - containerPort: 3001
              name: tcp
            - containerPort: 8080
              name: health
          env:
            - name: PORT
              value: "3001"
            - name: SESSION_STORAGE_PATH
              value: "/data/sessions"
            - name: SESSION_ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: browser-secrets
                  key: encryption-key
          volumeMounts:
            - name: sessions
              mountPath: /data/sessions
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: sessions
          emptyDir: {}
```

### Sidecar 模式部署

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-with-browser-sidecar
spec:
  replicas: 1
  selector:
    matchLabels:
      app: main-app
  template:
    metadata:
      labels:
        app: main-app
    spec:
      containers:
        # 主应用容器
        - name: main-app
          image: main-app:latest
          env:
            - name: BROWSER_SIDECAR_HOST
              value: "localhost"
            - name: BROWSER_SIDECAR_PORT
              value: "3001"
        
        # Browser Sidecar 容器
        - name: browser-sidecar
          image: browser-sidecar:latest
          ports:
            - containerPort: 3001
            - containerPort: 8080
          env:
            - name: SESSION_ENCRYPTION_KEY
              valueFrom:
                secretKeyRef:
                  name: browser-secrets
                  key: encryption-key
          volumeMounts:
            - name: shared-sessions
              mountPath: /tmp/sessions
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
      
      volumes:
        - name: shared-sessions
          emptyDir: {}
```

---

## 安全性

### 会话加密

所有会话数据使用 **AES-256-GCM** 加密存储：

```typescript
// 加密流程
const iv = crypto.randomBytes(12);  // 12字节 IV
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
const authTag = cipher.getAuthTag();  // 16字节认证标签

// 存储格式: IV || AuthTag || EncryptedData
```

### 密钥管理

```bash
# 生成安全密钥 (推荐)
openssl rand -base64 32

# 设置环境变量
export SESSION_ENCRYPTION_KEY="your-generated-key"
```

### 路径遍历防护

会话名称自动清理，防止路径遍历攻击：

```typescript
// 输入: "../../../etc/passwd"
// 输出: "________etc_passwd"
const safeName = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
```

### 安全最佳实践

1. **密钥管理**
   - 使用 Kubernetes Secrets 存储加密密钥
   - 定期轮换密钥
   - 不同环境使用不同密钥

2. **网络安全**
   - 使用 TLS 加密 TCP 连接
   - 限制服务访问范围
   - 使用 NetworkPolicy 隔离

3. **会话管理**
   - 设置合理的会话过期时间
   - 定期清理过期会话
   - 监控异常登录行为

---

## 开发指南

### 项目结构

```
oh-agent-browser/
├── src/
│   ├── index.ts           # 入口点
│   ├── server.ts          # TCP 服务器
│   ├── types.ts           # 类型定义
│   ├── browser/           # 浏览器管理
│   │   └── index.ts
│   ├── session/           # 会话管理
│   │   └── index.ts
│   └── handlers/          # 操作处理器
│       └── index.ts
├── tests/                 # 测试文件
│   ├── integration.test.ts
│   ├── benchmark.test.ts
│   ├── browser.test.ts
│   ├── handlers.test.ts
│   └── session.test.ts
├── docker/                # Docker 配置
├── k8s/                   # Kubernetes 配置
└── dist/                  # 编译输出
```

### 开发命令

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck

# 运行测试
npm test

# 运行特定测试
npm test -- --testNamePattern="login"

# 代码检查 (需要配置 ESLint)
npm run lint
```

### 添加新的操作处理器

1. 在 `src/types.ts` 中定义请求和响应类型：

```typescript
export interface MyOperationRequest extends Request {
  operation: 'my_operation';
  param1: string;
  param2?: number;
}
```

2. 在 `src/handlers/index.ts` 中创建处理器：

```typescript
export function createMyOperationHandler(ctx: HandlerContext) {
  return async (request: Request): Promise<Response> => {
    const req = request as MyOperationRequest;
    
    try {
      // 实现操作逻辑
      const result = await doSomething(req.param1, req.param2);
      
      return {
        id: req.id,
        success: true,
        timestamp: Date.now(),
        duration: 0,
        data: result,
      };
    } catch (err) {
      return {
        id: req.id,
        success: false,
        timestamp: Date.now(),
        duration: 0,
        error: {
          code: 'MY_OPERATION_FAILED' as ErrorCode,
          message: err instanceof Error ? err.message : 'Operation failed',
        },
      };
    }
  };
}
```

3. 注册处理器：

```typescript
export function registerHandlers(server: TCPServer, ctx: HandlerContext): void {
  // ... 其他处理器
  server.registerHandler('my_operation', createMyOperationHandler(ctx));
}
```

### 测试指南

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- tests/integration.test.ts

# 运行带覆盖率的测试
npm test -- --coverage

# 调试模式
npm test -- --detectOpenHandles --forceExit
```

---

## 故障排除

### 常见问题

#### 1. 浏览器启动失败

```
Error: Failed to launch browser
```

**解决方案：**
```bash
# 安装 Playwright 浏览器
npx playwright install chromium

# 或者设置系统依赖
npx playwright install-deps
```

#### 2. 会话恢复失败

```
Error: Session expired
```

**解决方案：**
```bash
# 检查会话文件
ls -la /tmp/sessions/

# 检查会话过期时间
# 会话默认 7 天过期，可以重新保存
```

#### 3. 连接超时

```
Error: Connection timeout
```

**解决方案：**
```bash
# 检查服务是否运行
curl http://localhost:8080/health

# 检查端口是否被占用
lsof -i :3001
```

#### 4. 内存不足

```
Error: JavaScript heap out of memory
```

**解决方案：**
```bash
# 增加 Node.js 内存限制
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### 日志调试

```bash
# 启用调试日志
export LOG_LEVEL=debug
npm run dev

# 查看日志输出
# 日志包含: 时间戳、级别、模块、消息、额外数据
```

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

## 许可证

MIT License

Copyright (c) 2024 OpenClaw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.