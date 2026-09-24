---
description: "DeepSeek Harness 的 LingoLadder（语阶英语）profile：学习资料、听说读写四个练习页面、定级测评，以及由可配置 agent 技能驱动的游戏化仪表盘。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-lingoladder

[English](README.md) | 中文

## 概述

本包是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 LingoLadder（语阶英语）profile：一个本地 Web 应用，AI 导师消化学习资料、建立词汇库，并在四个专属练习页面上训练你的听说读写。定级测评确定你的 CEFR 等级，游戏化仪表盘从真实学习记录统计 XP、连续天数和各维度正确率，每个 agent 技能都可以在设置页开关。你很少直接安装本包——本仓库用 `pnpm run ship` 把它装进一个 dsh profile。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

构建本 bundle 并装入本地 dsh profile、提供 DeepSeek API 密钥、启动 profile——首次运行会在你的主目录下创建所需的一切，并在浏览器中打开仪表盘。

### 安装与运行

```sh
# 在本仓库根目录执行
export DEEPSEEK_API_KEY=sk-…        # or put it in a .env file in the directory you launch from
pnpm start                          # 构建、安装到 ~/.dsh/profiles/lingoladder 并启动
```

`ship` 会把本包（补丁层、插件、技能、构建好的仪表盘）复制进 profile 的依赖里；为什么是复制而不是链接，见[仓库 README](../../README.md)。harness 可执行文件来自固定版本的 `dsh/` 子模块——首次运行 `pnpm start` 会拉取并构建它。

首次启动会打印一个带令牌的 URL（例如 `http://127.0.0.1:4000/?token=…`）并打开浏览器。`--host`、`--port`、`--no-open` 分别改变绑定地址、端口和浏览器行为。全部学习数据——资料、词汇、进度、会话文档、语音缓存——都在 `$DSH_HOME/lingoladder/.lingoladder/`（默认 `~/.dsh/lingoladder/.lingoladder/`）下，与从哪个目录启动无关。

### 练习页面

仪表盘的四个维度卡片和工具栏为每种技能打开一个全屏练习页。听力通过神经语音朗读导师生成的短文、作答前隐藏原文；口语录制你的跟读并用浏览器语音识别评分；阅读是理解测验，写作是计分作文。每轮练习都会落成学习记录，自动喂给 XP、连续天数和正确率统计，无需手工记账。定级测评（首跑提供、可在设置里重新进行）决定每个页面的生成难度。

### 技能配置

设置 → 技能配置列出导师使用的每个 agent 技能及其描述和触发条件，各带开关。停用的技能在下一轮对话从导师目录消失；开关选择持久化在你的设置里。练习页面和定级测评依赖对应技能——面板会就地标注这些影响。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

bundle 是一个 Cordis 补丁层加一个仪表盘插件。补丁挂载 Web 服务器、聊天连接、工作区注册表和本插件；插件拥有导师 agent、预置技能以及浏览器访问的全部 HTTP 端点。

### 组合机制

profile 先启动 `@deepseek-ai/dsh-base`（共享核心：模型访问、工具、会话、设置、技能），再加载本 bundle 的 [`cordis.patch.yml`](cordis.patch.yml)，后者插入 Web 表面各行并为资料搜索的直取重新配置 `tool-web`。五个技能随本包的 `skills/` 目录一起发布，运行时注册为额外技能根，由设置驱动的技能配置过滤。

### 数据与状态

导师可见的状态是 `.lingoladder/` 下的 agent 写入 JSON：每条学习记录一个文件、每份资料一个词汇库、学习者档案，以及各练习轮次消费的页面会话文档。bundle 对照这些文档契约分类 agent 的 `write` 调用，并投影为浏览器 SSE 事件；练习页本地批改，经 REST 端点上报结果写入相同形态的记录。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | bundle 本体：Web 表面各行与 `tool-web` 重配置 |
| [`src/index.ts`](src/index.ts) | 仪表盘插件：导师 agent、预置技能、HTTP 端点、SSE 投影 |
| [`src/listening.ts`](src/listening.ts) | 听力测验文档解析与 write 分类 |
| [`src/speaking.ts`](src/speaking.ts) | 口语句文档解析与 write 分类 |
| [`src/reading.ts`](src/reading.ts) | 阅读测验文档解析与 write 分类 |
| [`src/writing.ts`](src/writing.ts) | 写作任务/结果文档解析与 write 分类 |
| [`src/tts.ts`](src/tts.ts) | Edge 神经语音合成与磁盘缓存 |
| [`src/skill-catalog.ts`](src/skill-catalog.ts) | 技能 frontmatter 解析与停用合并 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下引用位于承担运行时的固定版本 `dsh/` 子模块中：

- [app-boot profile 章节](../../dsh/packages/boot/app-boot/README.zh.md) —— profile 如何解析、分层与定制。
- [Model Experience 契约](../../dsh/.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.zh.md) —— 本页 Model Experience 章节承诺承载的内容。

-----

<a id="model-experience"></a>
## 模型体验

### 技能目录

#### 模型看到什么

导师的 `skill` 工具与逐轮目录消息携带五个预置技能——每个技能的 kebab-case 名字、路由描述和触发条件——并过滤掉学习者在仪表盘设置中停用的技能。目录仅在启用集合变化时重发。

#### Token 影响

目录重发按摘要去重：技能集合不变则不产生重复 token，切换一个技能会用新集合重写一次目录消息。

#### KV Cache 影响

基于摘要的重发让普通轮次间的对话前缀保持可缓存；目录重写会使前缀从被重写的消息处失效，后续轮次从该点重新缓存。

### 已加载技能与练习轮次

#### 模型看到什么

导师调用某个技能时收到该技能完整的 `SKILL.md` 正文；每个练习页面发送一条标准化生成或批改 prompt 作为学习者消息；导师的回复保持普通聊天文本。

#### Token 影响

加载的技能每次调用加入其 SKILL.md 正文一次，一轮练习增加一条简短 prompt 加一条确认或批改回复；不添加其他模型可见输入。

#### KV Cache 影响

已加载技能的正文留在会话历史中并保持前缀可缓存；练习轮次消息正常追加，不重写更早的上下文。

## 已知限制与延期工作

这些限制告诉你该 profile 何时需要额外注意、某项能力何时退化。它们是当前包约束，不是泛泛的对比或任务清单。

- **语音播放依赖微软 Edge 朗读服务** —— 未公开端点，可能变化；不可达时页面回退到质量参差的系统语音并明确提示。
- **Web 服务器是本地单用户表面** —— 默认绑定 `127.0.0.1`，用一次性令牌 URL 隔离浏览器；没有多用户账户模型。
- **全部学习数据明文存放在 `$DSH_HOME/lingoladder/.lingoladder/` 下**；像对待任何本地文件一样备份或清理该目录。
- **口语评分基于识别** —— 浏览器语音识别按词重叠度评价跟读还原度，只是间接衡量发音准确度；API 缺失时以自评替代。
- **`--no-open` 需要新版安装** —— 旧安装解析该标志但总会打开浏览器；更新 CLI 即可生效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

技能从本包自己的 `skills/` 目录读取（[`src/index.ts`](src/index.ts) 里的 `resolvePresetSkillsDir`），这就是为什么安装进 profile 的副本依然带着它们；整个过程不涉及任何 agent preset。

</details>
