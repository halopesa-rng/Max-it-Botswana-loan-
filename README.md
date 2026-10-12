# Orange-inspired Botswana Loan Application Demo

An independent demo with an orange/white visual style. It is **not an official Orange or Max it service** and must not be presented as one. This version deliberately does not collect OTPs, wallet PINs, authentication codes, or pasted SMS verification messages. It collects only a contact phone number, a non-secret application reference, and a requested amount in Botswana pula (BWP).

## Features
- Four-step responsive application experience.
- Application status is shown as pending until an admin actually approves it.
- Telegram notifications with Approve / Reject controls for assigned admins.
- Super Admin can add or revoke admins with `/addadmin CHAT_ID` and `/revokeadmin CHAT_ID`.
- Super Admin receives read-only copies of notifications and cannot approve/reject from those copies.
- Admin decisions are recorded in PostgreSQL; no claim of disbursement is made by default.

## Setup
1. Create a PostgreSQL database (Render PostgreSQL is supported).
2. Create a Telegram bot using BotFather. Start the bot from the Super Admin Telegram account first, then set `SUPER_ADMIN_CHAT_ID`.
3. Set `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `SUPER_ADMIN_CHAT_ID`, and `APP_BASE_URL` as environment variables on Render.
4. Deploy this folder as a separate GitHub repository/service. Render uses `npm install` and `npm start`.
5. To add an admin, the Super Admin sends `/addadmin 123456789` in the bot. The admin must start the bot first so Telegram can deliver messages.

## Telegram commands
- `/start` — show account role and commands.
- `/myinfo` — show current chat ID and role.
- `/pending` — list pending application IDs.
- `/stats` — application counts.
- `/addadmin CHAT_ID` — Super Admin only.
- `/revokeadmin CHAT_ID` — Super Admin only.

## Important
- This is a starter implementation, not a licensed lender's production system. Add legal disclosures, privacy notice, rate/fee disclosures, KYC safeguards, abuse controls, and independent security review before real use.
- Do not ask applicants to share OTPs, wallet PINs, or passwords. Do not promise approval or transfer within 24 hours unless verified by the actual lender.
