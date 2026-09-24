## 从哪里构建、在哪里运行

本前端不再独立发布：`pnpm --filter @deepseek-ai/dsh-lingoladder-web build` 把产物直接写进 bundle 的
[`packages/lingoladder/web/`](../../packages/lingoladder/web)，随 `@deepseek-ai/dsh-lingoladder` 一起安装。
运行入口在仓库根目录：

```sh
pnpm start                                 # 构建、安装并启动（首次会一并准备 dsh 子模块）
pnpm --dir dsh dsh --profile lingoladder   # 只启动，不重新构建
```

LingoLadder 不再打进 dsh 的 single-exe / 桌面版闭包，桌面版启动方式不适用于本 profile。

## Use OpenCode Zen Model

open `~/.dsh/settings.yaml` and set `llm-pi-ai.providers.opencode.customUserAgent` to `opencode/1.18.0`
and set `llm-pi-ai.providers.opencode.sendSessionAffinityHeaders` to `true`

```yaml
llm-pi-ai:
  providers:
    opencode:
      apiKeyEnv: OPENCODE_API_KEY
      customUserAgent: "opencode/1.18.0"
      compat:
        sendSessionAffinityHeaders: true
      models:
        - id: mimo-v2.5-free
          name: MiMo V2.5 Free
          contextWindow: 200000
          maxTokens: 32000
        - id: nemotron-3-ultra-free
          name: Nemotron 3 Ultra Free
          contextWindow: 1000000
          maxTokens: 128000
```

## HOST API

以下是 LingoLadder dashboard 插件通过 `webServer.register` 暴露的全部 host API（均在 [packages/lingoladder/src/index.ts](../../packages/lingoladder/src/index.ts) 中注册）：

### 模型 / 设置

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/settings/model` | 保存当前激活的模型选择（provider + model），并确保对应 pi-ai route 已物化 |
| GET | `/api/models/added` | 读取手动添加的模型列表与当前激活模型 |
| POST | `/api/models/added` | 添加模型（可带 apiKey），去重后持久化，新模型自动设为激活 |
| DELETE | `/api/models/added` | 删除一个模型；若它是激活模型则清空选择 |
| POST | `/api/models/key` | 只存 provider 的 API key 并物化 pi-ai route（可不添加模型） |
| GET | `/api/models/available` | 遍历所有已注册 adapter，返回各 provider 的可用模型 |
| GET | `/api/models/providers` | 列出所有可配置的 LLM provider |
| POST | `/api/models/discover` | 向单个或全部 provider 探测可用模型（支持 baseURL/api/apiKey 覆盖） |

### 会话 / 流

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/chat` | 提交用户消息转发给导师 agent（首条消息时按激活模型创建 agent）；响应只是 `{ok}`，结果走 SSE |
| GET | `/api/events` | SSE 长连接：转发 session 事件、agent 状态与错误给浏览器 |

### 仪表盘数据（GET）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/progress` | 聚合学习记录为各技能统计、XP、连续天数、最近 8 条记录 |
| GET | `/api/vocabulary` | 词汇库条目（新材料优先） |
| GET | `/api/placement` | 进行中的测评阶段文档，无测评时为 `null` |

### 学习者档案 / 技能开关

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/profile` | 读取学习者placement 档案 |
| POST | `/api/profile` | 手动指定 CEFR 等级（`currentLevel`），写入档案 |
| GET | `/api/skills` | 列出预设技能（frontmatter 元数据 + 启用状态） |
| POST | `/api/skills` | 切换单个技能启用/禁用，持久化 disabled 列表，下轮对话目录重发布 |

### 练习页会话恢复（GET）与结果上报（POST）

每个技能一个 GET 端点返回待完成练习（无则 `null`，页面刷新后可恢复），一个 POST 端点上报成绩——后端写成统一的学习记录并删除会话文档：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/listening` | 待完成的听力练习 |
| POST | `/api/listening/result` | 上报 `count`/`correct`，写记录并退场 |
| GET | `/api/speaking` | 待完成的口语练习 |
| POST | `/api/speaking/result` | 上报 `count`/`correct`（浏览器语音识别打分结果） |
| GET | `/api/reading` | 待完成的阅读练习 |
| POST | `/api/reading/result` | 上报 `count`/`correct`（客户端对照答案批改） |
| GET | `/api/writing` | 待完成写作文档（`task` 阶段或 `result` 批改结果） |
| POST | `/api/writing/result` | 上报 `score`（0–100，≥60 计答对），一条作文记一题 |

### 材料 / 语音

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/materials` | 列出学习材料（`.lingoladder/materials/` 下的 Markdown 文件） |
| POST | `/api/materials` | 新增材料（`name` + `content`） |
| DELETE | `/api/materials` | 按 `id` 删除材料 |
| POST | `/api/materials/extract` | 上传 base64 编码的 PDF，返回提取的纯文本与页数 |
| POST | `/api/tts` | 用 Edge 神经语音合成任意文本，返回音频（磁盘缓存）；上游失败返回 502 以便页面降级到浏览器语音 |

### 其他

- **Fallback seat**（`registerFallback`，index.ts:1680）：GET/HEAD 的静态资源服务，承载本包 `web/` 下的前端产物；`/` 走 connection 插件的 cookie 鉴权，非文件路径回退到 `index.html`（SPA fallback）。

**通用错误约定**：方法不匹配 → 405，请求体校验失败 → 400，无待完成会话时上报结果 → 409，删除不存在的材料 → 404，TTS 上游失败 → 502，其余内部错误 → 500。所有路由都是 `kind: 'exact'` 精确匹配，全部经 `ctx.effect()` 注册。

### Storage

LingoLadder 的存储分两层：学习数据全部是 `$DSH_HOME/lingoladder/.lingoladder/` 下的纯文件（无数据库），配置类数据走 harness 的 settings/credentials/session 能力