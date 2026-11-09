# 30day-jpn

面向汉语母语者的手机端日语闯关应用，使用 Cloudflare Workers、Static Assets 和 D1。

- 官网：<https://jpn.mux1.tech/>
- 学习应用：<https://jpn.mux1.tech/learn/>
- 管理后台：<https://jpn.mux1.tech/admin/>
- Android APK：<https://github.com/bpmiea/30day-jpn/releases/latest>

官网采用留白、黑白排版、假名粒子与滚动动效，参考 Antigravity 的视觉节奏，使用本站原创内容与学习界面。Android 应用仅包装 `/learn/`，不包含官网或后台。

## 学习体验

- 可选零基础 → N5、N5 → N4、N4 → N3，每条路线 60 课，共 180 课；课程 ID 独立，切换路线保留进度。
- 首页使用五步闯关路径：认读、句型阅读、听力、跟读、书写。达到 80% 后标记掌握并解锁下一步；课程笔记页也可选择练习。
- 每日建议 60 分钟，支持 15/30/60 分钟目标。课程章、XP、连续学习天数依据实际记录展示。
- 配对、组句、选择、假名输入、录音回听、手写板；正确内容进入间隔复习，错题更早回来。
- 邮箱密码注册登录，D1 保存进度、偏好、错题和复习安排。注册使用 Turnstile，服务端校验 hostname 和 register action。
- 原创暖橙与青蓝界面、麻雀学习伙伴；参考短练习、路径解锁和即时反馈的学习模式。

## 本地运行

本机已独立安装 Node 24.22.2、npm 11.19.1、Wrangler 4.158.0。新开终端即可使用；详见 [本机环境](docs/LOCAL-SETUP.md)。

```sh
npm install
wrangler d1 migrations apply 30day-jpn-db --local
npm run dev
```

本地官网为 `http://127.0.0.1:8787/`，学习应用为 `/learn/`。真实配置保存在已被 Git 忽略的 `.dev.vars`，示例为 `.dev.vars.example`。

```dotenv
APP_ENV="development"
TURNSTILE_SITE_KEY="站点公钥"
TURNSTILE_SECRET_KEY="站点私钥"
DASHSCOPE_API_KEY="北京地域的百炼 API Key"
```

不要提交或发送真实密钥。正式 Turnstile 需允许使用的域名；仅在 loopback 开发环境且留空两个 Turnstile 字段时使用官方测试密钥。

## 日语语音

[百炼配置说明](docs/SPEECH.md)：使用 `cosyvoice-v3-flash`、`日语女声 Tomoka` 和显式 `language_hints: ["ja"]`，词汇按假名合成，慢速播放保留音高。密钥仅在 Worker 内使用。设备日语声音是主动开启的备用选项，不自动使用中文声音。

真实 API 已成功生成「日本」「学生」及完整句子的 WAV。页面“语音已配置”只代表密钥存在。真实词重音和教学适用性仍需听音审校，不能把接口接通等同于教材级人工审校发音。

2026-11-09 已替换会产生多余内容的旧模型，修正音频格式和缓存。13 个真实生成样本经过语音识别核对，覆盖假名、汉字词、长音、促音和整句。

## 后台与 Android

[管理员后台](docs/ADMIN.md)支持全站学习统计、账号搜索、停用/启用与注销登录，API 在服务端强制鉴权。

[Android 构建说明](docs/ANDROID.md)包含源码、签名和校验方法。在本机可直接执行 `npm run build:android`。APK 需要网络和更新的 Android System WebView。

## 验证

```sh
npm run check
npm test
# 先运行本地开发服务器，再在 PowerShell 中设置：
$env:RUN_API_TESTS='1'
npm test
npm run test:browser
wrangler deploy --dry-run
```

浏览器测试需要 Playwright 和 Edge；可通过 `PLAYWRIGHT_PATH` 指向 Playwright。测试使用临时本地账号并在结束后清理，只访问本地 D1。覆盖通关解锁、保存失败重试、刷新持久化、复习、配对、组句、语音失败状态、录音、手写以及 320–1280px 布局。

## Cloudflare 部署

正式地址：https://jpn.mux1.tech 。2026-11-09 已部署并完成 HTTPS、数据库和语音接口检查。

Wrangler 已完成账号登录，专用 D1 数据库 `30day-jpn-db` 已创建并应用全部迁移。`wrangler.jsonc` 已绑定该库及自定义域名 `jpn.mux1.tech`，三个服务密钥已上传。

新建库后，将返回的 UUID 写入 `d1_databases[0].database_id`：

```sh
wrangler d1 create 30day-jpn-db
wrangler d1 migrations apply 30day-jpn-db --remote
wrangler secret put DASHSCOPE_API_KEY
wrangler secret put TURNSTILE_SITE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
npm run deploy
```

`.dev.vars` 不会自动上传。生产环境不配置 `APP_ENV=development`；Turnstile 需允许实际访问的部署域名。

## 内容和功能范围

课程为原创教学内容，串联基础假名到 N3 常见词汇、句型与听说读写训练。每条路线 60 课是课程安排，不是通过考试的时间保证，也不代表覆盖全部 JLPT 词汇。阶段检查为本站练习，不使用官方计分。

书目参考用户指定的官方试题集及第二集 N4/N3、能力测试指南、考前冲刺单词分册、新完全掌握 N4/N3、TRY! N4/N3、标准日本语初级上下及中级上、红宝书/蓝宝书 N4、新日语能力考试对策文字词汇与语法 N3。本站未复制教材原文，未逐页对应教材。

口语为录音回听、自评和可选浏览器文字识别，不是专业发音评分；录音仅在当前页面保存。手写板用于字形练习，自动判断的是输入的假名。账号暂不含邮箱验证和密码找回。学习日界线为 Asia/Shanghai。

## 主要文件

- `worker.js`、`server/services.js`：账号、进度、Turnstile 与日语语音。
- `migrations/`：数据库结构与幂等学习事件。
- `public/app.js`、`views.js`、`path-home.js`：状态、页面与闯关路径。
- `public/ink.css`：移动端及练习页面样式。
- `public/curriculum.js` 及课程数据模块：三条路线、题库和复习材料。
- `tests/`：课程、API、媒体和浏览器测试。
