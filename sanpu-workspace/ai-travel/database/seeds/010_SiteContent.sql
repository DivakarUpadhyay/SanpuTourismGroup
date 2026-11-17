/* Site content: footer, newsletter switch and legal pages. Insert-if-missing, so staff edits are kept. Idempotent. */
SET NOCOUNT ON;
INSERT dbo.AppSettings(SettingKey, SettingValue, ValueType, Category, Description, ValidationJson, IsPublic, IsEditable)
SELECT k, v, t, c, d, j, 1, 1 FROM (VALUES
 ('Feature.Newsletter', N'true', 'Bool', 'Features', N'Show the newsletter sign-up in the footer', NULL),
 ('Ui.SupportHours', N'Mon to Fri, 09:00 to 18:00 (Taiwan time)', 'String', 'Content', N'Support hours shown in the footer', N'{"maxLength":120}'),
 ('Ui.FooterAbout', N'Trip plans built from verified places, with recovery plans our team approves when weather or transport changes your day.', 'String', 'Content', N'Short company description in the footer', N'{"maxLength":300}'),
 ('Ui.LegalNotice', N'', 'String', 'Content', N'Optional notice under the footer (for example a test-environment notice)', N'{"maxLength":300}')
) s(k, v, t, c, d, j) WHERE NOT EXISTS (SELECT 1 FROM dbo.AppSettings a WHERE a.SettingKey = s.k);

INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic)
SELECT k, 'en', 'Content', s, REPLACE(b, '\n', CHAR(10)), 1 FROM (VALUES
 ('terms', N'Terms of use', N'1. Bookings. A booking is confirmed only after our team approves it and payment is received. Seats or rooms are held for a short time while you complete your booking; the hold ends automatically if you do not finish.\n2. Prices. Prices are shown in New Taiwan dollars and include tax unless stated otherwise. Coupon codes apply only within their dates and limits and cannot be exchanged for cash.\n3. Changes and cancellations. You can request a cancellation from My bookings. Refunds follow the cancellation rules shown on the tour or service at the time of booking.\n4. Travel documents. You are responsible for valid identity documents and any permits needed for your trip.\n5. Your account. Keep your password private. We may suspend accounts that are used to abuse bookings or coupons.\n6. Contact. Questions about these terms can be sent to our support team using the address in the footer.'),
 ('cookies', N'Cookie policy', N'We use only the cookies needed to keep you signed in safely.\n- A secure sign-in cookie (HttpOnly) that renews your session. It cannot be read by scripts.\n- A request-protection cookie that stops other websites from acting on your account.\nWe do not use advertising or tracking cookies, and we do not sell your data. You can delete cookies in your browser at any time; you will then need to sign in again.')
) s(k, s, b) WHERE NOT EXISTS (SELECT 1 FROM dbo.ContentTemplates c WHERE c.TemplateKey = s.k AND c.Locale = 'en');
UPDATE dbo.ContentTemplates SET IsPublic = 1 WHERE TemplateKey = 'privacy.notice' AND IsPublic = 0;
PRINT 'site content applied';
