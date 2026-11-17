<#
.SYNOPSIS
  Generates local development secrets and stores them with `dotnet user-secrets` (outside the repo, per developer).
  Nothing is written to source control. Re-run with -Force to rotate keys (signs everyone out; encrypted demo PII becomes unreadable).
.EXAMPLE
  ./scripts/dev-secrets.ps1 -Server ".\DEVELOPERMSSQL"
#>
param(
  [string]$Server = $(if ($env:SANPU_SQL_SERVER) { $env:SANPU_SQL_SERVER } else { 'localhost' }),
  [string]$ErpDatabase = 'SanpuErp',
  [string]$AiDatabase = 'SanpuAiOps',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
function New-Key([int]$bytes = 32) { $b = New-Object byte[] $bytes; $r = [Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); $r.Dispose(); [Convert]::ToBase64String($b) }

$apps = @(
  @{ Project = "$root/tour-operations/backend/src/Api"; Db = $ErpDatabase; Extra = @('SUPPLIER_HTL01_HMAC', 'SUPPLIER_BUS01_HMAC') },
  @{ Project = "$root/ai-travel/backend/src/Api"; Db = $AiDatabase; Extra = @() }
)
foreach ($a in $apps) {
  $existing = (dotnet user-secrets list --project $a.Project 2>$null) -join "`n"
  function Set-Secret([string]$name, [string]$value) {
    if ($Force -or $existing -notmatch "(?m)^$([regex]::Escape($name)) =") { dotnet user-secrets set $name $value --project $a.Project | Out-Null }
  }
  Set-Secret 'ConnectionStrings:Sanpu' "Server=$Server;Database=$($a.Db);Integrated Security=True;TrustServerCertificate=True;Encrypt=True;Application Name=Sanpu"
  Set-Secret 'SANPU_JWT_SIGNING_KEY' (New-Key 48)
  Set-Secret 'SANPU_PII_KEY' (New-Key 32)
  foreach ($x in $a.Extra) { Set-Secret $x (New-Key 32) }
  Write-Host "Secrets ready for $(Split-Path $a.Project -Leaf) -> $($a.Db) (stored in your user profile, not in the repo)"
}
# Payments: ECPay staging (public test merchant published in ECPay's developer docs; sandbox only, no real money).
# For production, replace with the company's own merchant keys and https://payment.ecpay.com.tw URLs.
$erp = "$root/tour-operations/backend/src/Api"
$ecpay = [ordered]@{ 'Payments:Provider' = 'ECPay'; 'Payments:PublicBaseUrl' = 'http://localhost:3101';
  'Payments:Ecpay:MerchantId' = '3002607'; 'Payments:Ecpay:HashKey' = 'pwFHCqoQZGmho4w6'; 'Payments:Ecpay:HashIv' = 'EkRm7iFT261dpevs' }
$existingErp = (dotnet user-secrets list --project $erp 2>$null) -join "`n"
foreach ($k in $ecpay.Keys) { if ($Force -or $existingErp -notmatch "(?m)^$([regex]::Escape($k)) =") { dotnet user-secrets set $k $ecpay[$k] --project $erp | Out-Null } }
Write-Host "Payments: ECPay staging configured for the ERP API (set Payments:Provider=Simulated to turn the gateway off)"
Write-Host "Optional: set ANTHROPIC_API_KEY for the AI app with: dotnet user-secrets set ANTHROPIC_API_KEY <key> --project ai-travel/backend/src/Api"
