# SyncFrame Studio — Website vs. Desktop Plan

## Objective
To clearly define the boundary between the **SyncFrame Studio Desktop App** (the rendering and execution environment) and the **SyncFrame Studio Website Portal** (the management and account environment).

## Desktop App Responsibilities
The desktop app is designed for maximum performance, local rendering, and execution speed. It handles:
- Core tool UI (Video Generator, Image Timeline, Batch, Audio).
- Communicating with the local Python backend for rendering operations via FFmpeg.
- Reading user plan/credit status (read-only checks).
- Enforcing local tool locks and limits based on plan tier.
- Opening modals when limits are hit to direct users to the website portal.

**The Desktop App WILL NOT contain:**
- Heavy marketing pages or big pricing cards.
- Complex credit card/Stripe input forms.
- Billing history tables.
- Subscription modification endpoints.

## Website Portal Responsibilities
The future web portal (e.g., built with Next.js/Vite) will be hosted at `https://syncframestudio.com` and handles:
- **Marketing & SEO:** Landing pages, features, pricing grids.
- **Onboarding:** Sign up / Login (Google Auth, Magic Links).
- **Billing & Subscriptions:** Checkout flows via Stripe/Paddle/Lemon Squeezy.
- **Account Management:** Viewing billing history, updating payment methods, cancelling subscriptions.
- **Downloads:** Fetching the latest `.dmg` or `.exe` installer.
- **Changelogs:** Release notes and update history.

## Cross-Communication Flow
1. **Desktop App limits hit** -> Opens `AccessLimitModal`.
2. **User clicks "Manage Plan"** -> Desktop app opens default browser to `https://syncframestudio.com/pricing`.
3. **User purchases/upgrades on web** -> Supabase `user_plans` and `user_credits` tables are updated.
4. **Desktop App sync** -> The desktop app automatically syncs the new database values on next focus or interval fetch.

## Future Tech Stack for Web Portal
- Next.js (App Router)
- Tailwind CSS
- Supabase Auth + Database
- Stripe Checkout
