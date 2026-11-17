// Generates the legal-page seed (privacy notice, terms of use, cookie policy) for both apps.
// Format: text before the first "## " is the summary ("- " lines = At a glance); "## " = section, "### " = sub-heading, "- " = bullet.
// {brand} and {support} are filled in by the page from settings. Re-run after editing: node tools/legal-content.mjs
import fs from "node:fs";

const privacy = (ai) => `This notice explains what personal data {brand} collects, why, who we share it with, how long we keep it and the rights you have under Taiwan's Personal Data Protection Act (PDPA).
- We only collect what we need to run your ${ai ? "trips" : "bookings"} and your account.
- Phone and passport numbers are encrypted, and staff see them masked.
- We never sell your data or use advertising trackers.
- You can see, correct, export or delete your data at any time.

## Who we are
{brand} is the data controller for the personal data described here. You can reach our privacy team at {support}. We answer privacy requests within 15 working days, as the PDPA requires.

## What we collect
### Account details
- Your name, email address and password. Passwords are stored only as a salted hash; nobody, including our staff, can read them.
- Your preferred language and when you last signed in.
### ${ai ? "Trip details" : "Booking details"}
- The lead traveler's name, mobile phone number and, where a ${ai ? "partner" : "tour"} requires it, passport or ID number.
- Travel dates, the ${ai ? "itinerary, pace and accessibility needs you choose" : "tours, rooms, seats or rides you book"}, and any special requests you write.
${ai ? "- Documents you upload, such as hotel confirmations. Personal details in them are hidden before any automated processing.\n" : ""}### Payment details
- The amount, method and status of each payment. Card numbers are entered on our payment provider's secure page and never reach our systems.
### Technical data
- Security logs of sign-ins and important account changes, kept to protect your account and to investigate misuse.

## Why we use it
- To create and manage your account (performance of a contract).
- To make, change and support your ${ai ? "trips, including re-planning when weather or transport disrupts them" : "bookings with our hotels, transport and guide partners"} (performance of a contract).
- To take payments and handle refunds (performance of a contract and legal obligation).
- To keep the service secure and prevent fraud (legitimate interest).
- To send our newsletter, only if you subscribe; every email has an unsubscribe link (consent).

## Who we share it with
We share only what each partner needs to deliver your service:
- ${ai ? "Hotels, transport companies and guides in your itinerary" : "Hotels, airlines, bus and taxi companies and local guides"}: the lead traveler's name, dates and number of travelers.
- Our payment provider (ECPay, Taiwan): the payment amount and order reference, to process your payment securely.
- Authorities, only when Taiwanese law requires it.
We do not sell personal data, and we do not share it for advertising.

## How long we keep it
- Traveler details on a ${ai ? "trip" : "booking"} (names, phone, passport, special requests): anonymised two years after the travel date.
- Messages from our travel partners' systems: deleted after 180 days.
- Security and audit records: kept for seven years to meet accounting and legal duties.
- Your account: until you ask us to delete it.

## How we protect it
- Phone and passport numbers are encrypted with AES-GCM and shown masked to staff; revealing them is permission-controlled and logged.
- All traffic uses HTTPS. Sign-in sessions use secure, HttpOnly cookies and short-lived access tokens.
- Staff can only see what their role allows, and every sensitive action is recorded in an audit log that cannot be edited.

## Your rights
Under the PDPA you can ask us to:
- Show you the personal data we hold about you.
- Give you a copy of it (use Download my data in My account).
- Add to or correct it.
- Stop collecting, processing or using it.
- Delete it.
Write to {support} from the email on your account. We reply within 15 working days. Some data may have to be kept longer where the law requires it; we will tell you if so.

## Children
Our services are for adults. A child's details may be included in a ${ai ? "trip" : "booking"} only by their parent or guardian.

## Changes to this notice
If we change how we use personal data, we will update this page and the date above, and tell account holders by email about important changes.

## Contact
Questions or concerns: {support}. If you are not satisfied with our answer, you may contact the competent authority in Taiwan.`;

const terms = (ai) => `These terms apply when you use the {brand} website and book with us. Please read them before you book.
- Tours are confirmed after our team reviews them; ${ai ? "trip changes are approved by our team before they take effect" : "hotels, flights, buses and taxis are confirmed instantly"}.
- You can pay in full, or pay a deposit and the balance later.
- Free cancellation rules are shown on each option before you book.
- Prices are in New Taiwan dollars (TWD) and include tax.

## About these terms
By creating an account or making a booking you agree to these terms and to our privacy notice. If you book for other travelers, you confirm they agree too.

## Your account
- Give accurate details and keep your password private. You are responsible for bookings made with your account.
- We may suspend accounts used for fraud, abuse of coupons or attempts to break the service.

## Bookings
### Tours
- Your seats are held for a short time while you complete the booking. A tour booking is confirmed only when our team approves it; you will see the status change in My bookings.
### ${ai ? "Trip plans and changes" : "Hotels, flights, buses and taxis"}
${ai ? "- Itineraries are built from verified places. When weather or transport disrupts a trip, we propose a recovery plan, and a member of our team approves it before anything changes.\n- Suggestions written with the help of AI are checked against our rules and data; they are never booked without a person approving them." : "- These bookings are confirmed instantly because the room, seat or car is reserved for you at that moment.\n- Taxi transfers are booked for the pickup time and address you give; drivers wait for the free waiting time shown on the booking."}

## Prices and payment
- Prices are shown in New Taiwan dollars (TWD) and include tax unless stated otherwise.
- You may pay in full, or where offered pay a deposit now and the balance by the due date shown in My bookings. If the balance is not paid in time we may cancel the booking under the cancellation rules.
- Payments are processed securely by our payment provider. We never see or store your card number.

## Coupon codes
- Each code has its own dates, minimum order, booking types and usage limits, shown when you apply it.
- One code per booking. Codes cannot be exchanged for cash. If a booking is cancelled or rejected, the code can be used again within its limits.

## Changes and cancellations
- Cancel from My bookings. Hotels, flights, buses and taxis can usually be cancelled free of charge up to 24 hours before the start; the exact rule is shown on each option.
- Tour cancellations are reviewed by our team, and refunds follow the rules shown when you booked.
- Approved refunds go back to the original payment method; banks usually show them within 5 to 10 working days.

## When we change or cancel
If weather, safety or a partner problem affects your trip, we will contact you with options: another date, a changed plan or a full refund of the affected part.

## Travel documents and conduct
- Bring valid photo ID and any permits your trip needs. Follow the instructions of guides, drivers and staff for everyone's safety.

## Liability
We plan and deliver your services with reasonable care. We are not responsible for losses caused by events outside our reasonable control, such as typhoons, earthquakes or government action. Nothing in these terms limits rights you have under Taiwan's Consumer Protection Act.

## Governing law
These terms are governed by the laws of Taiwan (Republic of China).

## Contact
Questions about these terms: {support}.`;

const cookies = () => `We use only the cookies needed to keep you signed in safely. We do not use advertising or tracking cookies, so there is nothing to opt out of.
- Two essential cookies, both set by us.
- No advertising, analytics or social media trackers.
- Deleting cookies simply signs you out.

## What cookies are
Cookies are small text files a website stores in your browser. They let the site remember things between pages, such as that you are signed in.

## Cookies we use
### Sign-in cookie
- Purpose: keeps you signed in by renewing your session securely.
- Type: essential, set by {brand}.
- Protection: HttpOnly (scripts cannot read it), Secure (sent only over HTTPS) and SameSite=Strict (never sent by other websites).
- Lifetime: until you sign out, or about two weeks of inactivity.
### Request-protection cookie
- Purpose: proves that requests to change your account really come from this site, which stops other websites from acting on your behalf.
- Type: essential, set by {brand}.
- Lifetime: the same as your sign-in.

## Other storage
Your browser may keep small, harmless preferences on your device, such as a filter you chose. They never leave your device and contain no personal data.

## Third parties
When you pay, you are taken to our payment provider's secure page. That page is run by the provider and follows its own cookie policy.

## Managing cookies
You can delete cookies in your browser settings at any time. Because ours are essential, blocking them means you cannot stay signed in.

## Contact
Questions about cookies: {support}.`;

const sql = (docs) => `/* Legal pages (privacy notice, terms of use, cookie policy). Generated by tools/legal-content.mjs.
   Replaces the seeded text only while staff have not edited it (UpdatedBy IS NULL); inserts it when missing. Idempotent. */
SET NOCOUNT ON; SET XACT_ABORT ON;
BEGIN TRAN;
DECLARE @L TABLE (K varchar(100), S nvarchar(200), B nvarchar(max));
INSERT @L VALUES
${docs.map(([k, s, b]) => ` ('${k}', N'${s}', N'${b.replace(/'/g, "''")}')`).join(",\n")};
UPDATE c SET Subject = l.S, Body = l.B, IsPublic = 1, UpdatedAtUtc = SYSUTCDATETIME()
FROM dbo.ContentTemplates c JOIN @L l ON l.K = c.TemplateKey AND c.Locale = 'en' WHERE c.UpdatedBy IS NULL AND c.Body <> l.B;
INSERT dbo.ContentTemplates(TemplateKey, Locale, Kind, Subject, Body, IsPublic)
SELECT K, 'en', 'Content', S, B, 1 FROM @L l WHERE NOT EXISTS (SELECT 1 FROM dbo.ContentTemplates c WHERE c.TemplateKey = l.K AND c.Locale = 'en');
COMMIT;
PRINT 'legal pages applied';
`;
for (const [app, file, ai] of [["tour-operations", "017_LegalPages.sql", false], ["ai-travel", "012_LegalPages.sql", true]]) {
  fs.writeFileSync(`${app}/database/seeds/${file}`, sql([["privacy.notice", "Privacy notice", privacy(ai)], ["terms", "Terms of use", terms(ai)], ["cookies", "Cookie policy", cookies()]]));
}
console.log("legal seeds written");
