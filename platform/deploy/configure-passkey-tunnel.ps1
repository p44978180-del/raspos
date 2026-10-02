param(
    [Parameter(Mandatory = $true)][string]$HttpsUrl
)

$ErrorActionPreference = 'Stop'
$publicUri = [Uri]$HttpsUrl
if (-not $publicUri.IsAbsoluteUri -or $publicUri.Scheme -ne 'https' -or
    $publicUri.Port -ne 443 -or $publicUri.AbsolutePath -ne '/' -or
    $publicUri.UserInfo -or $publicUri.Query -or $publicUri.Fragment -or
    [Uri]::CheckHostName($publicUri.Host) -ne [UriHostNameType]::Dns) {
    throw 'Supply only a public HTTPS origin, for example https://your-tunnel.example.com'
}

$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$composePath = Join-Path $PSScriptRoot 'docker-compose.yml'
$mainEnvPath = Join-Path $PSScriptRoot '.env'
$cachePath = Join-Path $workspacePath '.cache'
$overridePath = Join-Path $cachePath 'phase8-passkey-tunnel.env'
$assetlinksPath = Join-Path $PSScriptRoot 'well-known\assetlinks.json'
$links = Get-Content -LiteralPath $assetlinksPath -Raw | ConvertFrom-Json
$target = $links | Where-Object { $_.target.package_name -eq 'ru.timacad.platform' }
$fingerprint = $target.target.sha256_cert_fingerprints[0]
if ($fingerprint -notmatch '^([0-9A-F]{2}:){31}[0-9A-F]{2}$') { throw 'Invalid release certificate fingerprint' }
$digest = [byte[]]::new(32)
$hex = $fingerprint.Split(':')
for ($index = 0; $index -lt 32; $index++) { $digest[$index] = [Convert]::ToByte($hex[$index], 16) }
$androidOrigin = 'android:apk-key-hash:' + [Convert]::ToBase64String($digest).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$origin = $publicUri.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
$publicLinks = Invoke-RestMethod -Uri "$origin/.well-known/assetlinks.json" -TimeoutSec 30
$matching = $publicLinks | Where-Object {
    $_.target.package_name -eq 'ru.timacad.platform' -and
    $fingerprint -in $_.target.sha256_cert_fingerprints -and
    'delegate_permission/common.get_login_creds' -in $_.relation
}
if (-not $matching) { throw 'Public Digital Asset Links do not match the release certificate' }

New-Item -ItemType Directory -Path $cachePath -Force | Out-Null
$content = "WEBAUTHN_RP_ID=$($publicUri.IdnHost)`nWEBAUTHN_EXTRA_ORIGINS=$androidOrigin`n"
[IO.File]::WriteAllText($overridePath, $content, [Text.UTF8Encoding]::new($false))
& docker compose -f $composePath --env-file $mainEnvPath --env-file $overridePath --profile full up -d --no-deps server
if ($LASTEXITCODE -ne 0) { throw 'Cannot apply the RP configuration' }

Write-Output "RP: $($publicUri.IdnHost)"
Write-Output "API build option: -Ptimacad.apiUrl=$origin"
Write-Output "Realtime build option: -Ptimacad.realtimeUrl=$($origin.Replace('https://', 'wss://'))/connection/websocket"
Write-Output 'Verified HTTPS Digital Asset Links; server configured with the Android certificate origin.'
