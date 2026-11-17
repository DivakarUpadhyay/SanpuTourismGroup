<#
.SYNOPSIS
  Creates/updates an app database: shared admin schema -> app schema -> procedures -> seeds. Idempotent.
.EXAMPLE
  ./scripts/db-setup.ps1 -App erp                       # SanpuErp with demo seeds
  ./scripts/db-setup.ps1 -App ai -Database SanpuAiOps_Test -Reset   # disposable test database
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('erp', 'ai')][string]$App,
  [string]$Database,
  [string]$Server = $(if ($env:SANPU_SQL_SERVER) { $env:SANPU_SQL_SERVER } else { 'localhost' }),
  [switch]$Reset,      # drop and recreate; refused unless the name ends with _Test or _Dev
  [switch]$NoSeeds
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$appDir = if ($App -eq 'erp') { 'tour-operations' } else { 'ai-travel' }
if (-not $Database) { $Database = if ($App -eq 'erp') { 'SanpuErp' } else { 'SanpuAiOps' } }

function Invoke-Sql([string]$db, [string]$file, [string]$query) {
  $args = @('-S', $Server, '-E', '-b', '-I', '-f', '65001', '-d', $db)
  if ($file) { $args += @('-i', $file) } else { $args += @('-Q', $query) }
  $out = & sqlcmd @args 2>&1
  if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed ($file$query):`n$($out -join "`n")" }
  return $out
}

if ($Reset) {
  if ($Database -notmatch '_(Test|Dev|E2E)$') { throw "Refusing to drop '$Database': -Reset only works on *_Test, *_Dev or *_E2E databases." }
  Invoke-Sql 'master' $null "IF DB_ID('$Database') IS NOT NULL BEGIN ALTER DATABASE [$Database] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$Database]; END" | Out-Null
}
Invoke-Sql 'master' $null "IF DB_ID('$Database') IS NULL CREATE DATABASE [$Database]; ALTER DATABASE [$Database] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;" | Out-Null

$steps = @(
  @{ Name = 'shared migrations'; Path = "$root/shared/database/migrations" },
  @{ Name = 'app migrations'; Path = "$root/$appDir/database/migrations" },
  @{ Name = 'shared procedures'; Path = "$root/shared/database/procedures" },
  @{ Name = 'app procedures'; Path = "$root/$appDir/database/procedures" }
)
if (-not $NoSeeds) { $steps += @{ Name = 'seeds'; Path = "$root/$appDir/database/seeds" } }

foreach ($s in $steps) {
  if (-not (Test-Path $s.Path)) { continue }
  Get-ChildItem $s.Path -Filter *.sql | Sort-Object Name | ForEach-Object {
    Write-Host "  [$Database] $($s.Name): $($_.Name)"
    Invoke-Sql $Database $_.FullName $null | Out-Null
  }
}
Write-Host "Database $Database on $Server is ready."
