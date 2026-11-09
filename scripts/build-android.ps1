param(
 [string]$SdkRoot = "$env:LOCALAPPDATA\30day-jpn\toolchain\android-sdk",
 [string]$JavaRoot = "$env:LOCALAPPDATA\30day-jpn\toolchain\jdk\jdk-17.0.21+9",
 [string]$SigningRoot = "$env:LOCALAPPDATA\30day-jpn\signing"
)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskBuild = Join-Path $taskRoot 'android\build'
$taskTools = Join-Path $SdkRoot 'build-tools\35.0.0'
$taskAndroidJar = Join-Path $SdkRoot 'platforms\android-35\android.jar'
$env:JAVA_HOME = $JavaRoot
$env:Path = (Join-Path $JavaRoot 'bin') + ';' + $env:Path
foreach ($taskFile in @($taskAndroidJar,(Join-Path $taskTools 'aapt2.exe'),(Join-Path $JavaRoot 'bin\javac.exe'))) {
 if (!(Test-Path -LiteralPath $taskFile)) { throw "Missing Android build dependency: $taskFile" }
}
function Check-Exit { if ($LASTEXITCODE -ne 0) { throw "Android build command failed ($LASTEXITCODE)." } }
New-Item -ItemType Directory -Force $taskBuild,(Join-Path $taskBuild 'classes'),(Join-Path $taskBuild 'dex'),$SigningRoot | Out-Null
$taskRes = Join-Path $taskRoot 'android\app\src\main\res'
$taskManifest = Join-Path $taskRoot 'android\app\src\main\AndroidManifest.xml'
& (Join-Path $taskTools 'aapt2.exe') compile --dir $taskRes -o (Join-Path $taskBuild 'resources.zip')
Check-Exit
& (Join-Path $taskTools 'aapt2.exe') link -o (Join-Path $taskBuild 'unsigned.apk') --manifest $taskManifest -I $taskAndroidJar (Join-Path $taskBuild 'resources.zip')
Check-Exit
$taskSources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'android\app\src\main\java') -Filter '*.java' -Recurse | ForEach-Object { $_.FullName })
& (Join-Path $JavaRoot 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -bootclasspath "$taskAndroidJar;$(Join-Path $taskTools 'core-lambda-stubs.jar')" -d (Join-Path $taskBuild 'classes') @taskSources
Check-Exit
$taskClasses = @(Get-ChildItem -LiteralPath (Join-Path $taskBuild 'classes') -Filter '*.class' -Recurse | ForEach-Object { $_.FullName })
& (Join-Path $taskTools 'd8.bat') --release --min-api 26 --lib $taskAndroidJar --output (Join-Path $taskBuild 'dex') @taskClasses
Check-Exit
& (Join-Path $JavaRoot 'bin\jar.exe') uf (Join-Path $taskBuild 'unsigned.apk') -C (Join-Path $taskBuild 'dex') classes.dex
Check-Exit
& (Join-Path $taskTools 'zipalign.exe') -f -p 4 (Join-Path $taskBuild 'unsigned.apk') (Join-Path $taskBuild 'aligned.apk')
Check-Exit
$taskKey = Join-Path $SigningRoot 'release.jks'
$taskPasswordFile = Join-Path $SigningRoot 'release-password.txt'
if (!(Test-Path -LiteralPath $taskKey)) {
 if (Test-Path -LiteralPath $taskPasswordFile) { throw 'Password file exists without keystore; inspect the signing directory before generating a replacement.' }
 $taskRandom = New-Object byte[] 32
 $taskRng = [Security.Cryptography.RandomNumberGenerator]::Create()
 $taskRng.GetBytes($taskRandom); $taskRng.Dispose()
 [IO.File]::WriteAllText($taskPasswordFile,[Convert]::ToBase64String($taskRandom))
 $taskAcl = New-Object Security.AccessControl.DirectorySecurity
 $taskAcl.SetAccessRuleProtection($true,$false)
 $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
 $taskRule = New-Object Security.AccessControl.FileSystemAccessRule($taskIdentity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
 $taskAcl.AddAccessRule($taskRule)
 Set-Acl -LiteralPath $SigningRoot -AclObject $taskAcl
 $env:JPN_SIGN_PASS = [IO.File]::ReadAllText($taskPasswordFile)
 try {
  & (Join-Path $JavaRoot 'bin\keytool.exe') -genkeypair -keystore $taskKey -alias release -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=30day-jpn, OU=Android, O=30day-jpn' -storepass:env JPN_SIGN_PASS -keypass:env JPN_SIGN_PASS
  Check-Exit
 } finally { Remove-Item Env:\JPN_SIGN_PASS -ErrorAction SilentlyContinue }
}
if (!(Test-Path -LiteralPath $taskPasswordFile)) { throw 'Release signing password file is missing.' }
$taskDownloadDir = Join-Path $taskRoot 'public\downloads'
New-Item -ItemType Directory -Force $taskDownloadDir | Out-Null
$taskApk = Join-Path $taskDownloadDir '30day-jpn-1.1.0.apk'
& (Join-Path $taskTools 'apksigner.bat') sign --ks $taskKey --ks-key-alias release --ks-pass "file:$taskPasswordFile" --out $taskApk (Join-Path $taskBuild 'aligned.apk')
Check-Exit
& (Join-Path $taskTools 'apksigner.bat') verify --verbose --print-certs $taskApk
Check-Exit
& (Join-Path $taskTools 'zipalign.exe') -c -p 4 $taskApk
Check-Exit
$taskHash = (Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLower()
$taskMetadata = [ordered]@{ version='1.1.0'; versionCode=110; minAndroid='8.0'; sizeMB=[math]::Round((Get-Item -LiteralPath $taskApk).Length/1MB,2); download='/downloads/30day-jpn-1.1.0.apk'; sha256=$taskHash; entry='https://jpn.mux1.tech/learn/'; builtAt=[DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText((Join-Path $taskRoot 'public\site\release.json'),($taskMetadata | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $taskDownloadDir 'SHA256SUMS.txt'),"$taskHash  30day-jpn-1.1.0.apk`n",[Text.UTF8Encoding]::new($false))
Write-Output "Built signed APK: $taskApk"
Write-Output "SHA256: $taskHash"
