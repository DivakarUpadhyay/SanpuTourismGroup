<#  Payment rules check (deposit, balance, full, refusals, refund on cancel) against a second ERP API instance that uses the
    simulated payment provider, so no external gateway is called. Uses the dev database and the demo customer traveler.lee.
    Usage: ./scripts/payment-check.ps1                                                                                #>
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$pw = ((Get-Content tour-operations/LOGINS.local.txt) | Where-Object { $_ -like 'traveler.lee@*' }).Split(',')[1]
$psi = New-Object System.Diagnostics.ProcessStartInfo 'dotnet', 'run --no-build --project tour-operations/backend/src/Api --no-launch-profile'
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
$psi.EnvironmentVariables['ASPNETCORE_ENVIRONMENT'] = 'Development'
$psi.EnvironmentVariables['ASPNETCORE_URLS'] = 'http://localhost:5111'
$psi.EnvironmentVariables['Payments__Provider'] = 'Simulated'
$proc = [System.Diagnostics.Process]::Start($psi)
try {
  $b = 'http://localhost:5111/api/v1'
  for ($i = 0; $i -lt 40; $i++) { try { Invoke-WebRequest "$b/public/settings" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }
  $t = (Invoke-RestMethod "$b/auth/login" -Method Post -ContentType application/json -Body (@{ email = 'traveler.lee@demo.sanpu.test'; password = $pw } | ConvertTo-Json)).accessToken
  $h = @{ Authorization = "Bearer $t" }
  function Book($code, $days, $end, $units, $trav) {
    $body = @{ serviceCode = $code; date = (Get-Date).AddDays($days).ToString('yyyy-MM-dd'); endDate = $(if ($end) { (Get-Date).AddDays($end).ToString('yyyy-MM-dd') } else { $null })
      units = $units; travelers = $trav; leadName = 'Lee Min'; leadPhone = '+886922333444'; acceptTerms = $true; idempotencyKey = [guid]::NewGuid().ToString() } | ConvertTo-Json
    Invoke-RestMethod "$b/travel/bookings" -Method Post -Headers $h -ContentType application/json -Body $body }
  function Pay($id, $mode) { Invoke-RestMethod "$b/payments/checkout" -Method Post -Headers $h -ContentType application/json -Body (@{ orderType = 'Service'; orderId = $id; mode = $mode } | ConvertTo-Json) }
  function Sum($id) { (Invoke-RestMethod "$b/payments/summary?orderType=Service&orderId=$id" -Headers $h).summary }
  function Refused($label, [scriptblock]$call) { try { & $call | Out-Null; "FAIL  $label was allowed" } catch { "PASS  $label refused ($($_.Exception.Response.StatusCode.value__))" } }

  "== Partial payment: deposit, then balance (hotel 40 days out) =="
  $h1 = Book 'H-ALI-CYP-TWN' 40 42 1 2; "booked $($h1.bookingRef) total TWD $($h1.totalAmount)"
  $s = Sum $h1.serviceBookingId; "before: $($s.paymentStatus), deposit offered=$($s.canPayDeposit) (TWD $($s.depositAmount), $($s.depositPercent)%)"
  $r = Pay $h1.serviceBookingId 'Deposit'; "deposit: TWD $($r.amount) via $($r.provider), completed=$($r.completed)"
  $s = Sum $h1.serviceBookingId; "after deposit: $($s.paymentStatus), paid TWD $($s.amountPaid), balance TWD $($s.balance), balance due $($s.balanceDueDate)"
  Refused 'a second deposit' { Pay $h1.serviceBookingId 'Deposit' }
  $r = Pay $h1.serviceBookingId 'Balance'; "balance: TWD $($r.amount)"
  $s = Sum $h1.serviceBookingId; "after balance: $($s.paymentStatus), paid TWD $($s.amountPaid), balance TWD $($s.balance)"
  Refused 'paying a fully paid booking' { Pay $h1.serviceBookingId 'Full' }

  "== Full payment (flight 40 days out, 2 seats) =="
  $f1 = Book 'F-FS301' 40 $null 2 2; "booked $($f1.bookingRef) total TWD $($f1.totalAmount)"
  $r = Pay $f1.serviceBookingId 'Full'; $s = Sum $f1.serviceBookingId; "full: TWD $($r.amount) -> $($s.paymentStatus), balance TWD $($s.balance)"

  "== Deposit too close to travel (bus 5 days out) =="
  $b1 = Book 'B-C1-TPE-TNN' 5 $null 1 1; $s = Sum $b1.serviceBookingId; "deposit offered=$($s.canPayDeposit)"
  Refused 'a deposit 5 days before travel' { Pay $b1.serviceBookingId 'Deposit' }

  "== Cancelling a paid booking refunds it =="
  Invoke-RestMethod "$b/travel/my/bookings/$($f1.serviceBookingId)/cancel" -Method Post -Headers $h | Out-Null
  (Invoke-RestMethod "$b/travel/my/bookings" -Headers $h) | Where-Object { $_.bookingRef -eq $f1.bookingRef } | ForEach-Object { "after cancel: $($_.status) / $($_.paymentStatus)" }
  Refused 'paying a cancelled booking' { Pay $f1.serviceBookingId 'Full' }
}
finally { if (-not $proc.HasExited) { $proc.Kill() } }
