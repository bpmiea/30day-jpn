# 日语语音：阿里云百炼

项目已从 Azure 切换到阿里云百炼 CosyVoice。只需一个北京地域的百炼 API Key，不再需要 Azure 账号、Key 或 Region。

## 配置步骤

1. 登录阿里云，在控制台搜索「百炼」，进入模型服务控制台，按提示完成账号认证和服务开通。
2. 选择 **华北 2（北京）** 地域，在 API Key 管理页面创建密钥。北京和新加坡的密钥不能混用；项目当前固定北京接入地址。
3. 确认该密钥所在业务空间允许调用 `cosyvoice-v3-flash`，并在控制台确认额度和计费。不要填写阿里云 AccessKey ID/Secret。
4. 编辑项目根目录 `.dev.vars` 中已准备的字段：

```dotenv
DASHSCOPE_API_KEY="你的百炼 API Key"
```

5. 保留已有 Turnstile 配置，保存后重启开发服务器。登录应用，在「我的 → 日语朗读」测试「日本・にほん」，再到课程试听完整句子与慢速播放。

不需要把密钥发到聊天中。`.dev.vars` 已被 Git 忽略；旧 Azure 字段即使保留也不会使用。页面“已配置”只表示存在密钥，不代表已经验证了服务可用性。

## 当前实现

- 模型：`cosyvoice-v3-flash`；音色：`loongtomoka_v3`（日语女声 Tomoka）。
- 请求固定 `language_hints: ["ja"]`；词汇使用教材中整理的假名读音，句子使用日语原文。
- 云端通过 SSE 返回 24kHz / 16bit / 单声道 PCM，Worker 封装为 WAV 并缓存；客户端正常/慢速共用音频，慢速为 0.75 倍、保留音高。
- 只允许朗读课程已有内容；API Key 只用于服务端调用，不发送到浏览器或音频下载地址。
- 不会自动降级到中文系统声音。正式音质、词重音和教学适用性需要真实凭据接入后逐项试听，生成语音不等于人工审校教材原声。

## 部署

Wrangler 登录后，在项目目录运行并按提示输入密钥：

```sh
wrangler secret put DASHSCOPE_API_KEY
```

Turnstile 仍使用 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY`。本地 `.dev.vars` 不会自动上传。

## 排错

- 配置后仍显示待配置：重启开发服务器，刷新页面。
- 生成失败：确认密钥为北京地域、模型权限正确，且账户状态和额度正常。
- 正式试听：检查「日本」「学生」等汉字词、假名、含助词的整句、长音促音和慢速回放。

官方参考（2026-11-09 核对）：
- 获取密钥：https://help.aliyun.com/zh/model-studio/get-api-key
- API 参数：https://help.aliyun.com/zh/model-studio/cosyvoice-tts-http-api
- 音色列表：https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list

## 2026-11-09 语音纠正

旧 Qwen 音频经 ASR 检出多余日语和错词，且流式 WAV 被错误地当作 PCM 二次封装。现改用 CosyVoice 日语专用声线，明确请求原始 PCM，拒绝含 WAV 文件头的数据，词尾补句号，固定 seed=42。缓存命名空间已更换，旧音频不会复用。

真实密钥验证 13 个样本：あ、し、つ、きゃ、を、は、日本、学生、コーヒー、切手，以及三条含助词的句子。ASR 均与目标读音相符（を 识别为同音的 お，きゃ 为片假名 キャ）；ASR 不能替代日语母语者对词重音和教学音质的审校。
