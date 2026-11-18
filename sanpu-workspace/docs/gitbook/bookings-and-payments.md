# Bookings & payments end to end

## Customer
1. Choose a tour departure, hotel, flight, bus or taxi (live prices and availability from SQL).
2. Book: seats/rooms are locked in one transaction (UPDLOCK/HOLDLOCK), coupon re-checked; email *booking received*.
3. Payment summary: total, paid, balance, deposit option (Payment.DepositPercent, default 30%) and balance due date.
4. Pay: deposit, balance or full → payment intent → ECPay sandbox checkout (test card 4311-9522-2222-2222, any future date, CVV 222) → ECPay callback (signature + QueryTradeInfo check) → intent Paid or Failed → email.
5. My bookings: references, payments history, cancel.

## Staff
- **Bookings / Service bookings**: status, payment status, approve or reject (tours), cancel, refund.
- **Payments & transactions**: every intent with result, method, gateway reference; totals; Excel/PDF.
- **Reconciliation**: settlement matching.
