# Emails & notifications

All emails are branded HTML built from templates in the database (`ContentTemplates`), rendered by `Mailer`. Sending is best effort: an email problem never blocks the booking, payment or sign-up. Every email is also stored in the outbox table.

| Event | Template |
|---|---|
| Customer signs up | `email.welcome` |
| Forgot password | `email.password_reset` |
| Staff request received / approved / declined | `email.staff_request_received`, `email.staff_approved`, `email.staff_rejected` |
| Tour booking received | `email.booking_created` |
| Hotel / flight / bus / taxi booked | `email.service_booked` |
| Payment received / failed (gateway or sandbox) | `email.payment_received`, `email.payment_failed` |
| Cancellation requested / done | `email.booking_cancel_requested`, `email.booking_cancelled` |
| AI Travel booking paid | `email.reservation_paid` |

## Delivery
SMTP secrets per API (user-secrets or environment): `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. With Gmail use an *App Password* (Google Account → Security → 2-Step Verification → App passwords). Without `SMTP_PASSWORD` mail stays in the outbox.
