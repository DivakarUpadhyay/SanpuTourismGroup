/* 040_notification_templates.sql — customer and staff emails for both apps (data, not a procedure; idempotent: inserts
   missing templates, refreshes the wording of these keys). Lines "Label: value" render as a details table and
   "[Button](https://...)" as a button (see Mailer.Html). */
SET NOCOUNT ON;
DECLARE @C TABLE (K varchar(100), Sub nvarchar(200), B nvarchar(max));
INSERT @C VALUES
 ('email.welcome', N'Welcome to {{brand}}', N'Hello {{displayName}},

Your account is ready. You can now book tours, hotels, flights, buses and taxis, pay a deposit or in full, and manage everything in one place.

[Open {{brand}}]({{link}})

If you did not create this account, reply to this email and we will close it.'),
 ('email.password_reset', N'Reset your {{brand}} password', N'Hello {{displayName}},

We received a request to reset your password. The link works for {{minutes}} minutes and can be used once.

[Set a new password]({{link}})

If you did not ask for this, you can ignore this email; your password stays the same.'),
 ('email.staff_request_received', N'We received your access request', N'Hello {{displayName}},

Thanks for asking for access to the {{brand}} admin panel.

Requested role: {{role}}

An administrator will review it. We will email you as soon as it is approved, then you can sign in with the password you chose.'),
 ('email.staff_approved', N'Your {{brand}} access is approved', N'Hello {{displayName}},

Good news: your access request was approved.

Role: {{role}}

[Sign in to the admin panel]({{link}})'),
 ('email.staff_rejected', N'About your {{brand}} access request', N'Hello {{displayName}},

Your access request was not approved this time. If you think this is a mistake, please contact your manager or an administrator.'),
 ('email.booking_created', N'Booking {{ref}} received', N'Hello {{displayName}},

Thank you for booking with {{brand}}. Your seats are reserved.

Booking: {{ref}}
Tour: {{item}}
Departure: {{date}}
Travelers: {{pax}}
Total: {{total}}
Status: {{status}}

To confirm your place, pay a deposit or the full amount from your booking page.

[View my booking]({{link}})'),
 ('email.service_booked', N'{{kind}} booking {{ref}} received', N'Hello {{displayName}},

Your {{kindLower}} is reserved.

Booking: {{ref}}
Item: {{item}}
Date: {{date}}
Travelers: {{pax}}
Total: {{total}}
Status: {{status}}

[View my bookings]({{link}})'),
 ('email.payment_received', N'Payment received for {{ref}}', N'Hello {{displayName}},

We received your payment. Thank you.

Booking: {{ref}}
Item: {{item}}
Paid now: {{amount}}
Method: {{method}}
Payment reference: {{paymentRef}}
Still to pay: {{balance}}

[View my booking]({{link}})'),
 ('email.payment_failed', N'Payment for {{ref}} did not go through', N'Hello {{displayName}},

Your payment could not be completed, so nothing was charged. Your booking is still held for now.

Booking: {{ref}}
Amount: {{amount}}
Reason: {{reason}}

Please try again, or choose another payment method.

[Try the payment again]({{link}})'),
 ('email.booking_cancel_requested', N'Cancellation request for {{ref}}', N'Hello {{displayName}},

We received your request to cancel booking {{ref}}. Our team will confirm it and process any refund under the cancellation policy.

Reason: {{reason}}

[View my booking]({{link}})'),
 ('email.booking_cancelled', N'Booking {{ref}} cancelled', N'Hello {{displayName}},

Your booking {{ref}} ({{item}}) is cancelled. Any refund due goes back to the original payment method.

[Book something new]({{link}})'),
 ('email.reservation_paid', N'{{status}}: {{item}} ({{ref}})', N'Hello {{displayName}},

Thank you, your payment is in.

Booking: {{ref}}
Item: {{item}}
Date: {{date}}
Travelers: {{pax}}
Paid now: {{amount}}
Total: {{total}}
Still to pay: {{balance}}
Payment reference: {{paymentRef}}

[Open my bookings]({{link}})');

UPDATE t SET Subject = c.Sub, Body = c.B, UpdatedAtUtc = SYSUTCDATETIME()
FROM dbo.ContentTemplates t JOIN @C c ON c.K = t.TemplateKey AND t.Locale = 'en'
WHERE t.Subject <> c.Sub OR CAST(t.Body AS nvarchar(max)) <> c.B;
INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic)
SELECT K, 'en', 'Notification', Sub, B, 0 FROM @C c WHERE NOT EXISTS (SELECT 1 FROM dbo.ContentTemplates x WHERE x.TemplateKey = c.K AND x.Locale = 'en');
GO
