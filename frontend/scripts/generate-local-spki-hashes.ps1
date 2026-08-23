<#
.SYNOPSIS
  Generate self-signed TLS certificates for local development and extract
  the SPKI SHA-256 hashes needed by TrustKit (iOS) and Android
  network_security_config.xml.

.DESCRIPTION
  Creates a local dev CA, a primary + backup server certificate for the API
  domain and the CDN domain, signs them with the dev CA, and prints the
  base64 SHA-256 SPKI hash of each leaf certificate.

  The generated certificates are written to docker/nginx/certs/ so the
  optional nginx-tls Docker service can terminate TLS for local pinning
  tests against the Docker backend.

  !!! LOCAL DEV ONLY !!!
  The hashes and certificates produced by this script are for LOCAL
  DEVELOPMENT AND TESTING ONLY. They MUST NOT be used in production.
  Replace them with real SPKI hashes from your production certificates
  (see frontend/scripts/generate-spki-hashes.sh) before shipping.

.PARAMETER OpensslPath
  Path to openssl.exe. Defaults to the Git for Windows bundled copy at
  "C:\Program Files\Git\usr\bin\openssl.exe" if present, otherwise relies
  on PATH.

.EXAMPLE
  .\generate-local-spki-hashes.ps1
#>
[CmdletBinding()]
param(
  [string]$OpensslPath
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir '..\..')
$CertDir = Join-Path $RepoRoot 'docker\nginx\certs'

if (-not $OpensslPath) {
  $gitOpenssl = 'C:\Program Files\Git\usr\bin\openssl.exe'
  if (Test-Path $gitOpenssl) {
    $OpensslPath = $gitOpenssl
  } else {
    $OpensslPath = 'openssl'
  }
}

# Verify openssl is usable
try {
  & $OpensslPath version | Out-Null
} catch {
  Write-Error "openssl not found. Install Git for Windows or provide -OpensslPath. Error: $_"
  exit 1
}

New-Item -ItemType Directory -Force -Path $CertDir | Out-Null
Set-Location $CertDir

# Helper: run openssl without letting stderr info messages abort the script.
function Invoke-Ossl([string[]]$Args) {
  $output = & $OpensslPath @Args 2>&1
  # openssl writes progress to stderr; only fail on real errors.
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    Write-Error "openssl failed (exit $exitCode): $output"
  }
  # Return stdout lines only (skip stderr objects).
  $output | Where-Object { $_ -is [string] } | ForEach-Object { $_ }
}

# Helper: extract SPKI SHA-256 base64 hash from a certificate file.
# Uses a bash subprocess (Git Bash) for correct binary piping when
# available; falls back to a temp-file pipeline otherwise.
function Get-SpkiHash([string]$CertFile) {
  $gitBash = 'C:\Program Files\Git\bin\bash.exe'
  if (Test-Path $gitBash) {
    $certRel = $CertFile
    $cmd = "openssl x509 -in '$certRel' -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64"
    $result = & $gitBash -lc $cmd 2>&1
    return ($result | Where-Object { $_ -is [string] }).Trim()
  }
  # Fallback: temp files for each pipeline stage to avoid PowerShell
  # mangling binary data in text pipes.
  $pubKeyFile = [IO.Path]::GetTempFileName()
  $derFile = [IO.Path]::GetTempFileName()
  $hashFile = [IO.Path]::GetTempFileName()
  try {
    & $OpensslPath x509 -in $CertFile -pubkey -noout 2>$null | Out-File -FilePath $pubKeyFile -Encoding ascii -NoNewline
    & $OpensslPath pkey -pubin -in $pubKeyFile -outform der -out $derFile 2>$null
    & $OpensslPath dgst -sha256 -binary $derFile 2>$null | & $OpensslPath enc -base64 2>$null | Out-File -FilePath $hashFile -Encoding ascii -NoNewline
    return (Get-Content $hashFile -Raw).Trim()
  } finally {
    Remove-Item $pubKeyFile, $derFile, $hashFile -ErrorAction SilentlyContinue
  }
}

function Write-SanConfig([string]$Path, [string]$PrimaryDns, [string[]]$ExtraDns) {
  $lines = @(
    '[req]',
    'distinguished_name = req_distinguished_name',
    '[req_distinguished_name]',
    '[v3_ext]',
    'subjectAltName = @alt_names',
    '[alt_names]',
    "DNS.1 = $PrimaryDns"
  )
  $idx = 2
  foreach ($d in $ExtraDns) {
    $lines += "DNS.$idx = $d"
    $idx++
  }
  $lines += 'DNS.5 = localhost'
  $lines += 'IP.1  = 127.0.0.1'
  $lines += 'IP.2  = 10.0.2.2'
  $lines -join "`r`n" | Set-Content -Path $Path -Encoding ascii
}

function New-ServerCert([string]$Name, [string]$Cn, [string]$SanFile) {
  Write-Host "==> Generating $Name certificate (CN=$Cn)..."
  Invoke-Ossl 'genrsa', '-out', "$Name.key", '2048' | Out-Null
  Invoke-Ossl 'req', '-new', '-key', "$Name.key", '-subj', "/C=NL/ST=North Holland/L=Amsterdam/O=ThryftVerse Dev/CN=$Cn", '-out', "$Name.csr" | Out-Null
  Invoke-Ossl 'x509', '-req', '-in', "$Name.csr", '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', "$Name.crt", '-days', '825', '-sha256', '-extfile', $SanFile, '-extensions', 'v3_ext' | Out-Null
}

# ── CA ──────────────────────────────────────────────────────────────────
Write-Host '==> Generating local dev CA...'
Invoke-Ossl 'genrsa', '-out', 'ca.key', '2048' | Out-Null
Invoke-Ossl 'req', '-x509', '-new', '-nodes', '-key', 'ca.key', '-sha256', '-days', '3650', '-subj', '/C=NL/ST=North Holland/L=Amsterdam/O=ThryftVerse Dev/CN=ThryftVerse Local Dev CA', '-out', 'ca.crt' | Out-Null

# ── API domain ──────────────────────────────────────────────────────────
Write-SanConfig 'api-san.cnf' 'api.thryftverse.local' @('api.thryftverse.com', 'cdn.thryftverse.local', 'cdn.thryftverse.com')
New-ServerCert 'api-primary' 'api.thryftverse.local' 'api-san.cnf'
New-ServerCert 'api-backup'  'api.thryftverse.local' 'api-san.cnf'

# ── CDN domain ──────────────────────────────────────────────────────────
Write-SanConfig 'cdn-san.cnf' 'cdn.thryftverse.local' @('cdn.thryftverse.com', 'api.thryftverse.local', 'api.thryftverse.com')
New-ServerCert 'cdn-primary' 'cdn.thryftverse.local' 'cdn-san.cnf'
New-ServerCert 'cdn-backup'  'cdn.thryftverse.local' 'cdn-san.cnf'

# ── Extract and report hashes ───────────────────────────────────────────
$apiPrimary = Get-SpkiHash 'api-primary.crt'
$apiBackup  = Get-SpkiHash 'api-backup.crt'
$cdnPrimary = Get-SpkiHash 'cdn-primary.crt'
$cdnBackup  = Get-SpkiHash 'cdn-backup.crt'

Write-Host ''
Write-Host '================================================================'
Write-Host '  LOCAL DEV SPKI SHA-256 hashes (base64)'
Write-Host '  !!! LOCAL DEV ONLY — replace for production !!!'
Write-Host '================================================================'
Write-Host ''
Write-Host "API primary : $apiPrimary"
Write-Host "API backup  : $apiBackup"
Write-Host "CDN primary : $cdnPrimary"
Write-Host "CDN backup  : $cdnBackup"
Write-Host ''
Write-Host "Certificates written to: $CertDir"
Write-Host ''
Write-Host 'Update these files with the hashes above:'
Write-Host '  - frontend/plugins/withTrustKit.js'
Write-Host '  - frontend/plugins/withAndroidSecurityXml.js'
Write-Host '  - frontend/src/utils/sslPinning.ts'
Write-Host ''
Write-Host 'TrustKit (iOS) TSKPublicKeyHashes format:'
Write-Host "  'api.thryftverse.com': ['$apiPrimary', '$apiBackup']"
Write-Host "  'cdn.thryftverse.com': ['$cdnPrimary', '$cdnBackup']"
Write-Host ''
Write-Host 'Android network_security_config.xml <pin> format:'
Write-Host "  <pin digest=""SHA-256"">$apiPrimary</pin>"
Write-Host "  <pin digest=""SHA-256"">$apiBackup</pin>"
Write-Host ''
