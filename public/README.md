# Imaanaa Social v3

GitHub -> Render -> Neon PostgreSQL.

Features: signup/login/logout, profile, online/offline users, WebRTC voice/video calls, missed-call notification, local call recording/download, posts held for silent admin moderation, approved media download/share, likes, comments, save, follow/friend request, chat, admin warning/ban, and VIP contact.

## Admin
Default first-run credentials:
- Username: `admin`
- Password: `Admin@12345`

Change `ADMIN_PASSWORD` in Render before production. Admin page: `/admin.html`.

## Render
Set `DATABASE_URL` to the Neon connection string. Deploy from GitHub. Do not delete the existing Neon tables; this app uses safe `ADD COLUMN IF NOT EXISTS` migrations.

## Important
Call recording is browser-side using MediaRecorder and is downloaded to the caller/receiver device; it is not permanently stored in Neon. Approved post media is stored as data URLs in PostgreSQL for this version, which is suitable for testing but object storage is recommended for production and large media.
