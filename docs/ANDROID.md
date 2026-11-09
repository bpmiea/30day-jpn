# Android 应用

APK 包名 `tech.mux1.jpn`，版本 1.1.0，最低 Android 8.0，目标 API 35。

按产品要求，这是 Android 原生 WebView 外壳，启动页固定为 `https://jpn.mux1.tech/learn/`。课程内容与账号进度由线上学习应用提供，需要联网。官网与后台不会打包进 APK；离开学习路径的网页链接交给系统浏览器。

Java 源码在 `android/app/src/main/java/tech/mux1/jpn/MainActivity.java`。不依赖第三方 Android 库，不携带任何百炼、Turnstile 或 Cloudflare 密钥。不忽略 TLS 错误，不开放本地文件访问，也不提供 JavaScript 原生接口。麦克风仅授予学习站点的音频录制请求，并经过 Android 系统权限确认。

## 构建

Windows PowerShell，JDK 17、Android SDK Platform 35、Build Tools 35.0.0：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 `
  -SdkRoot "C:\path\to\android-sdk" `
  -JavaRoot "C:\path\to\jdk-17" `
  -SigningRoot "$env:LOCALAPPDATA\30day-jpn\signing"
```

脚本使用 Android 官方 `aapt2`、`d8`、`zipalign` 和 `apksigner`。首次构建在项目外生成 RSA 3072 发布签名，后续构建复用同一个签名。签名目录含私钥与密码，必须单独备份；丢失后无法通过同包名覆盖升级。不要提交到 GitHub，也不要放进下载目录。

输出为 `public/downloads/30day-jpn-1.1.0.apk`，同时生成 `SHA256SUMS.txt` 和官网发布元数据。APK 二进制发布到 GitHub Release 和网站，源码仓库忽略 APK 及构建缓存。

发布证书 SHA256：`8d4fa708014aea6dc31effdf028be343c088af6a9baaf3c9e77eff75a4f4b02b`。

已通过编译、v2/v3 签名验证、ZIP 对齐和清单检查。当前电脑没有连接 Android 真机；Android System WebView 的 Turnstile、麦克风和安装体验仍需真机验收。浏览器录音、回听和写字板已使用测试麦克风在 Edge 中验证。浏览器自带的语音文字识别在部分 WebView 上不可用，可使用录音回听。
