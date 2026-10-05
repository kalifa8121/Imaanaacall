# Imaanaa Social Suite

Facebook + Telegram + TikTok style social platform.

## Included

- Signup/login/logout
- Password hashing
- Full profile fields
- Avatar and cover
- Neon PostgreSQL persistence
- Admin post moderation
- Approve/delete posts
- Silent post review
- Warning
- Temporary ban
- Online/offline users
- Voice calling
- Video calling
- Missed-call storage
- Direct chat
- Comments
- Likes
- Follow
- Friend request
- Confirm/reject friend request
- Save posts
- Download approved media
- VIP contact
- Render deployment

## Render + Neon

1. Create a Neon PostgreSQL database.
2. Copy the Neon connection string.
3. Put it into Render as DATABASE_URL.
4. Set ADMIN_USERNAME.
5. Set a strong ADMIN_PASSWORD.
6. Deploy from GitHub.
7. Open /admin.html for the admin console.

## Important

The current version stores uploaded media as data URLs in PostgreSQL for simplicity.

For a large production application, media should eventually be moved to object storage and only the media URLs should be stored in Neon.

Camera and microphone calling requires HTTPS in production.

The application uses Neon PostgreSQL for persistent database storage.
