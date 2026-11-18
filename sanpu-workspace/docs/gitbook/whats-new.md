# What's new

**November 2026**

- **Separate sessions:** the admin panel (`/admin/login`) and the customer site (`/login`) sign in independently; staff and customers can be signed in at the same time in one browser, and each side refuses the other kind of account.
- **Self sign-up:** customers create an account with their own email and password; staff request access with a role and an administrator approves it. Passwords: at least 8 characters with upper and lower case letters and a digit. Forgotten passwords are reset by email.
- **Emails:** welcome, staff request received / approved / declined, password reset, booking received, payment received or failed, cancellations (HTML, branded).
- **Sanpu AI Travel** (renamed from Trip Copilot): an AI assistant that plans, compares and prepares bookings with live prices; travelers confirm and pay.
- **News & blog** with an AI writer bot that publishes original articles with real photos.
- **Payments & transactions** page; **Excel and PDF** download on every admin table; clickable dashboard numbers.
- **Business-only admin menus**: technical pages (system, integrations, permissions, menus, raw settings, workflows, content templates, retention, audit, AI model settings) are hidden from the menu.
- **Online**: the Vercel sites use the live API when this computer is running (`scripts/go-live.ps1`) and fall back to a preview automatically when it is not.
