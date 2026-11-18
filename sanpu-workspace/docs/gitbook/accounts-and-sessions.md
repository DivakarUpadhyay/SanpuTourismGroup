# Accounts, sessions & sign-up

## Two separate sessions
| | Customer site | Admin panel |
|---|---|---|
| Sign-in page | `/login` | `/admin/login` |
| Who can sign in | Customer accounts | Staff accounts |
| Cookies | `{app}_site_rt`, `{app}_site_csrf` | `{app}_admin_rt`, `{app}_admin_csrf` |
| Header sent by the web app | `X-Session-Realm: site` | `X-Session-Realm: admin` |

The API keeps one refresh-token cookie per realm and refuses a refresh whose user type does not match the realm, so the two sessions can never mix.

## Customer sign-up
`/register` → name, email, password (8+ with upper, lower, digit) → signed in at once, welcome email.

## Staff sign-up with approval
1. `/admin/register`: name, work email, role needed, note, own password → request saved as **Pending** (inactive user), confirmation email.
2. Signing in before approval shows "waiting for an administrator".
3. An administrator opens **People** → *Access requests* → **Approve** (optionally another role) or **Reject** → email to the person.
4. After approval the person signs in at `/admin/login`.

## Password reset
`/forgot-password` → email with a one-time link valid 30 minutes → `/reset-password` → new password → sign in.
