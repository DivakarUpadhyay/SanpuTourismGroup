<#  End-to-end coupon check against the running dev ERP API (http://localhost:5101):
    public list, preview rules, redemption in a service booking and a tour booking, per-customer limit, release on cancel,
    and the staff view (usage counters + redemptions). Registers a fresh customer each run.
    Usage: ./scripts/coupon-check.ps1                                                                                      #>
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$b = 'http://localhost:5101/api/v1'
$pass = 0; $fail = 0
function Ok($cond, $label) { if ($cond) { $script:pass++; "PASS  $label" } else { $script:fail++; "FAIL  $label" } }
function Status([scriptblock]$call) { try { & $call | Out-Null; 200 } catch { [int]$_.Exception.Response.StatusCode } }
function Day($n) { (Get-Date).AddDays($n).ToString('yyyy-MM-dd') }

# fresh customer
$email = "coupon.$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$t = (Invoke-RestMethod "$b/auth/register" -Method Post -ContentType application/json -Body (@{ email = $email; displayName = 'Coupon Tester'; password = 'Coupon-Test-2026!' } | ConvertTo-Json)).accessToken
$h = @{ Authorization = "Bearer $t" }
"customer: $email"
function Check($code, $kind, $amount) { Invoke-RestMethod "$b/marketing/coupons/check" -Method Post -Headers $h -ContentType application/json -Body (@{ code = $code; kind = $kind; amount = $amount } | ConvertTo-Json) }

"== public list and preview rules =="
$list = Invoke-RestMethod "$b/marketing/coupons"
Ok ($list.code -contains 'WELCOME10' -and $list.code -contains 'HOTEL15') "public coupon list shows WELCOME10 and HOTEL15 ($($list.Count) codes)"
Ok (-not ($list.code -contains 'PARTNER2026')) "private code PARTNER2026 is not listed"
$c = Check 'welcome10' 'Hotel' 5000
Ok ($c.discountAmount -eq 500 -and $c.totalAfter -eq 4500) "WELCOME10 (typed lower case) gives 10%: TWD 5000 -> $($c.totalAfter)"
$c = Check 'WELCOME10' 'Hotel' 50000
Ok ($c.discountAmount -eq 1000) "WELCOME10 is capped at TWD 1000 on a TWD 50000 order (got $($c.discountAmount))"
Ok ((Status { Check 'HOTEL15' 'Flight' 5000 }) -eq 422) "HOTEL15 refused for a flight (hotel-only code)"
Ok ((Status { Check 'HOTEL15' 'Hotel' 3000 }) -eq 422) "HOTEL15 refused below its TWD 4000 minimum"
Ok ((Status { Check 'NOPE-123' 'Hotel' 5000 }) -eq 422) "unknown code refused"
Ok ((Status { Check 'bad code!' 'Hotel' 5000 }) -eq 422) "malformed code refused"

"== redeem in a hotel booking =="
$d1 = Day 45; $d2 = Day 47
$sr = (Invoke-RestMethod "$b/travel/search?kind=Hotel&date=$d1&endDate=$d2&travelers=2") | Where-Object { $_.totalPrice -ge 4000 } | Select-Object -First 1
$body = @{ serviceCode = $sr.code; date = $d1; endDate = $d2; units = 1; travelers = 2; leadName = 'Coupon Tester'; leadPhone = '+886933111222'; couponCode = 'WELCOME10'
           acceptTerms = $true; idempotencyKey = [guid]::NewGuid().ToString() } | ConvertTo-Json
try { $bk = Invoke-RestMethod "$b/travel/bookings" -Method Post -Headers $h -ContentType application/json -Body $body } catch { "REQUEST: $body"; "RESPONSE: " + (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd(); exit 1 }
$expected = $sr.totalPrice - [math]::Min([math]::Round($sr.totalPrice * 0.10), 1000)
Ok ($bk.totalAmount -eq $expected) "hotel booked with WELCOME10: TWD $($sr.totalPrice) -> $($bk.totalAmount) ($($bk.bookingRef))"
$mine = (Invoke-RestMethod "$b/travel/my/bookings" -Headers $h) | Where-Object { $_.bookingRef -eq $bk.bookingRef }
Ok ($mine.discountAmount -gt 0) "My bookings shows the saving (TWD $($mine.discountAmount))"
Ok ((Status { Check 'WELCOME10' 'Hotel' 5000 }) -eq 409) "WELCOME10 (one use per customer) cannot be used again (409)"

"== cancel gives the coupon back =="
Invoke-RestMethod "$b/travel/my/bookings/$($bk.serviceBookingId)/cancel" -Method Post -Headers $h | Out-Null
$c = Check 'WELCOME10' 'Hotel' 5000
Ok ($c.discountAmount -eq 500) "after cancelling, WELCOME10 (one use per customer) works again for this customer"

"== redeem in a tour booking =="
$tour = Invoke-RestMethod "$b/catalog/tours/TW-ERV-3D"
$dep = $tour.departures | Where-Object { $_.status -eq 'Open' -and $_.seatsLeft -ge 1 } | Select-Object -First 1
$hold = Invoke-RestMethod "$b/bookings/holds" -Method Post -Headers $h -ContentType application/json -Body (@{ departureId = $dep.departureId; pax = 1; idempotencyKey = [guid]::NewGuid().ToString() } | ConvertTo-Json)
$tb = Invoke-RestMethod "$b/bookings" -Method Post -Headers $h -ContentType application/json -Body (@{ holdId = $hold.holdId; leadName = 'Coupon Tester'; leadPhone = '+886933111222'; acceptTerms = $true; couponCode = 'tour500' } | ConvertTo-Json)
$detail = Invoke-RestMethod "$b/my/bookings/$($tb.bookingId)" -Headers $h
Ok ($detail.booking.totalAmount -eq ($hold.totalAmount - 500)) "tour booked with TOUR500: TWD $($hold.totalAmount) -> $($detail.booking.totalAmount) ($($tb.bookingRef))"

"== staff view =="
$apw = ((Get-Content tour-operations/LOGINS.local.txt) | Where-Object { $_ -like 'admin@*' }).Split(',')[1]
$at = (Invoke-RestMethod "$b/auth/login" -Method Post -ContentType application/json -Body (@{ email = 'admin@demo.sanpu.test'; password = $apw } | ConvertTo-Json)).accessToken
$coupons = Invoke-RestMethod "$b/ops/marketing/coupons" -Headers @{ Authorization = "Bearer $at" }
$tour500 = $coupons | Where-Object { $_.code -eq 'TOUR500' }
$red = Invoke-RestMethod "$b/ops/marketing/coupons/$($tour500.couponId)/redemptions" -Headers @{ Authorization = "Bearer $at" }
Ok ($red.orderRef -contains $tb.bookingRef) "admin sees $($tb.bookingRef) in TOUR500 redemptions (used $($tour500.timesUsed) times, TWD $($tour500.totalDiscount) given)"
$hotel15 = $coupons | Where-Object { $_.code -eq 'WELCOME10' }
$red15 = Invoke-RestMethod "$b/ops/marketing/coupons/$($hotel15.couponId)/redemptions" -Headers @{ Authorization = "Bearer $at" }
Ok (-not ($red15.orderRef -contains $bk.bookingRef)) "the cancelled hotel booking is no longer counted under WELCOME10"
""
"coupon check: $pass passed, $fail failed"
if ($fail -gt 0) { exit 1 }




