# Decisions Log

## 2026-03-12 Initial Architecture Decision

### Why Sidecar Mode?
- 故障隔离：浏览器崩溃只影响单个Pod
- 资源控制：可分别设置MCP Server和Browser的资源限制
- 低延迟：同一Pod内通过localhost通信
- 会话共享：共享Volume提供快速一致性存储
- 安全加固：减少网络暴露点

### Why NOT Browser Pool + MCP?
| 问题 | 严重程度 |
|------|---------|
| MCP协议安全漏洞 (CVE) | 🔴 严重 |
| Browser Pool单点故障 | 🔴 严重 |
| Redis会话不一致 | 🔴 严重 |
| 分布式锁脑裂 | 🔴 严重 |

---
*Created: 2026-03-12*