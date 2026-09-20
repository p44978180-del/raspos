$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $env:USERPROFILE '.cache/raspos-android/jdk/jdk-21.0.12.1+1'
if (-not (Test-Path -LiteralPath "$env:JAVA_HOME/bin/jlink.exe")) { throw 'A full JDK 21 with jlink is required.' }
$env:ANDROID_HOME = Join-Path $env:USERPROFILE '.cache/raspos-android/sdk'
$signingDirectory = Join-Path $env:USERPROFILE '.config/tim-campus-release'
if (-not (Test-Path -LiteralPath $signingDirectory)) { New-Item -ItemType Directory -Path $signingDirectory | Out-Null }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$acl = Get-Acl -LiteralPath $signingDirectory
$rules = @($acl.Access)
$privateAcl = $acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $identity -and $rules[0].AccessControlType -eq 'Allow' -and $rules[0].FileSystemRights -eq 'FullControl'
if (-not $privateAcl) {
    $restrictedAcl = New-Object Security.AccessControl.DirectorySecurity
    $restrictedAcl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $restrictedAcl.SetAccessRule($rule)
    Set-Acl -LiteralPath $signingDirectory -AclObject $restrictedAcl
}
$credentialFile = Join-Path $signingDirectory 'signing.credential.xml'
$env:ANDROID_KEYSTORE_PATH = Join-Path $signingDirectory 'release.jks'
$env:ANDROID_KEY_ALIAS = 'tim-campus-release'
if (-not (Test-Path -LiteralPath $credentialFile)) {
    if (Test-Path -LiteralPath $env:ANDROID_KEYSTORE_PATH) { throw 'Existing key has no saved credential; refusing to replace it.' }
    $randomBytes = New-Object byte[] 48
    [Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
    $password = [Convert]::ToBase64String($randomBytes)
    $secure = ConvertTo-SecureString $password -AsPlainText -Force
    $credential = New-Object Management.Automation.PSCredential('tim-campus-release', $secure)
    $credential | Export-Clixml -LiteralPath $credentialFile
}
$savedCredential = Import-Clixml -LiteralPath $credentialFile
$env:ANDROID_KEYSTORE_PASSWORD = $savedCredential.GetNetworkCredential().Password
$env:ANDROID_KEY_PASSWORD = $env:ANDROID_KEYSTORE_PASSWORD
try {
    if (-not (Test-Path -LiteralPath $env:ANDROID_KEYSTORE_PATH)) {
        & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $env:ANDROID_KEYSTORE_PATH -storetype JKS -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD -alias $env:ANDROID_KEY_ALIAS -keyalg RSA -keysize 4096 -validity 10000 -dname 'CN=TIM Campus Independent Project, O=TIM Campus, C=RU' -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed.' }
    }
    Push-Location $projectRoot
    try { node scripts/build-android.mjs; if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' } } finally { Pop-Location }
} finally {
    Remove-Item Env:ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
    $password = $null
    $savedCredential = $null
}
