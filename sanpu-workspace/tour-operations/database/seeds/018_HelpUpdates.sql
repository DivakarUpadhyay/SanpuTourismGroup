/* 018_HelpUpdates.sql — help articles for deposits, payment methods, auto-applied coupons and data download.
   New questions are inserted; the old payment answer is replaced only while it still has the original seeded text. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
UPDATE dbo.HelpArticles SET Answer = N'Tour bookings can be paid once our team confirms them; hotel, flight, bus and taxi bookings can be paid straight after booking. Open My bookings and choose Pay in full, or Pay a deposit to pay part now and the rest later.', UpdatedAtUtc = SYSUTCDATETIME()
WHERE Question = N'When do I pay?' AND Answer LIKE N'Tour bookings are paid after our team confirms them.%';
INSERT dbo.HelpArticles(Category, Question, Answer, SortOrder)
SELECT c, q, a, s FROM (VALUES
 (N'Payments', N'Can I pay a deposit and the rest later?', N'Yes. When your trip is more than 14 days away you can pay a 30% deposit now and the balance later. The balance due date is shown in My bookings, and you can pay it there at any time before then. Closer to the travel date, the full amount is due.', 3),
 (N'Payments', N'Which payment methods can I use?', N'Payments go through our secure payment provider, where you can pay by credit card and, where offered, ATM transfer or convenience-store payment. We never see or store your card number.', 4),
 (N'Payments', N'I paid but my booking still shows unpaid. What should I do?', N'Some methods, such as ATM transfers, take a little time to confirm. Refresh My bookings after a few minutes. If it still shows unpaid after one working day, contact us with your booking reference and we will check with the payment provider.', 5),
 (N'Coupons & deals', N'Do I need to type the coupon code at checkout?', N'Not if you chose it on the Deals page. Press Use now and we remember the code; it is filled in and applied at checkout automatically when it fits what you are booking. You can still type or change a code yourself.', 3),
 (N'Account & privacy', N'How do I download a copy of my data?', N'Sign in, open My account and choose Download my data. You get a file with the personal data we hold about your account. To correct or delete data, contact us; see the privacy notice for your rights.', 3),
 (N'Changes & cancellations', N'Is my deposit refunded if I cancel?', N'Hotel, flight, bus and taxi bookings cancelled at least 24 hours before the start are refunded in full, deposit included. Tour cancellations follow the rules shown when you booked and are reviewed by our team.', 4)
) x(c, q, a, s) WHERE NOT EXISTS (SELECT 1 FROM dbo.HelpArticles h WHERE h.Question = x.q);
COMMIT;
PRINT '018_HelpUpdates applied';
