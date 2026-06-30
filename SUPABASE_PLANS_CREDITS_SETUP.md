# Supabase Plans & Credits Setup

This guide explains how to set up the foundation for SyncFrame Studio's billing, plans, and credit system.

## 1. What This Setup Adds

Running the SQL schema creates the core foundation for a SaaS billing and credit system:
- **`profiles`**: User metadata.
- **`plans`**: Catalog of available plans (Free Trial, Standard, Pro, Ultra).
- **`user_subscriptions`**: Links users to a specific plan and period.
- **`user_credits`**: Tracks remaining monthly/trial credits.
- **`credit_transactions`**: Ledger for all granted and deducted credits.
- **`usage_events`**: Tracks every generation attempt and its credit cost.

## 2. How to Run the SQL

1. Go to your Supabase project dashboard.
2. Click on the **SQL Editor** tab in the left sidebar.
3. Click **New Query**.
4. Open the `supabase/plans_credits_schema.sql` file in this repository.
5. Copy its entire contents and paste it into the SQL Editor.
6. Click **Run** (or press `Cmd/Ctrl + Enter`).
7. Ensure the result says "Success. No rows returned".

## 3. How to Verify Tables

Once run, go to the **Table Editor** in Supabase:
- You should see the `plans` table containing 4 rows: `free`, `standard`, `pro`, `ultra`.
- Check the `user_subscriptions` and `user_credits` tables to verify they exist.

## 4. How Free Trial is Assigned

The SQL script includes a trigger (`handle_new_user`). Whenever a new user signs up via Auth (Google or Email/Password):
1. A profile is created.
2. They are automatically assigned the `free` plan in `user_subscriptions`.
3. They are granted 30 initial one-time credits in `user_credits`.

*Note: For existing users created before running this script, you will need to manually insert their `id` into `profiles`, `user_subscriptions`, and `user_credits` to prevent crashes, or delete their Auth account and have them log in again to trigger the creation.*

## 5. Manually Upgrading a User (for testing)

Since payments are not yet connected, you can manually upgrade a user to test UI limits:
1. Go to the **Table Editor** -> `user_subscriptions` table.
2. Find the row with the target `user_id`.
3. Change the `plan_id` from `free` to `pro` (or `ultra`).
4. Update their `user_credits` balance to `2000` (for Pro).
5. Refresh the desktop app. The UI will instantly reflect the new plan badge and limits.

## 6. How Credits Work & Cost Estimation

Credits are the currency of SyncFrame Studio.
- **Free Trial**: Starts with 30 one-time credits.
- **Standard**: 500 monthly credits.
- **Pro**: 2000 monthly credits.
- **Ultra**: 10000 monthly credits.

Cost estimation is handled by `backend/credit_estimator.py`. Example logic:
- Script Timestamp: 1 credit per minute
- Video 1080p: 10 credits per minute
- Premium template: +5 credits per export
- Batch Generation: `Single Video Cost × Number of Videos`

## 7. What is Not Implemented Yet

Batch 21F is the **foundation** and **soft-gating** phase. 
- **Stripe / Payment Provider Integration** is pending.
- **Hard backend deduction** is not fully enforced on generation endpoints yet.
- **Admin user management** is not built yet.

These will be added in subsequent batches (Batch 21G+).
