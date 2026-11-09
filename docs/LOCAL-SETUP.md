# 本机 Node / npm / Wrangler

已安装独立于 Codex 的 Node 24.22.2、npm 11.19.1、Wrangler 4.158.0。Node 压缩包来自 nodejs.org，安装前核验官方 SHA256。

- Node：`C:\Users\Administrator\AppData\Local\Programs\nodejs\node-v24.22.2-win-x64`
- 全局 npm 命令：`C:\Users\Administrator\AppData\Roaming\npm`
- 上述目录已追加到用户 PATH，保留了原有路径。
- PowerShell 当前策略为 RemoteSigned，普通 `npm`、`wrangler` 命令已验证可运行。

新开 PowerShell 或终端后执行：

```powershell
node --version
npm --version
wrangler --version
Set-Location F:\30d-jpn
npm run dev
```

已打开的终端如果还找不到命令，刷新当前终端 PATH：

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
```

Wrangler 已完成 Cloudflare OAuth 登录，可用 `wrangler whoami` 检查。项目已部署至 `jpn.mux1.tech`。本地 `preview_database_id` 保留原本的开发数据库，不与生产数据混用。

安装使用项目已验证的 Wrangler 4.158.0，显式允许官方依赖 esbuild/workerd 的安装脚本；未修改 Codex 自带运行时。
