-- Manual SQL script to create PushSubscriptions table
-- This script creates the table with the correct data types to match the Users table

-- First, create the enum type for device types if it doesn't exist
DO $$ BEGIN
    CREATE TYPE enum_PushSubscriptions_deviceType AS ENUM ('web', 'mobile');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the PushSubscriptions table
CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" VARCHAR(255) NOT NULL REFERENCES "Users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "playerId" VARCHAR(255) NOT NULL,
    "deviceType" enum_PushSubscriptions_deviceType DEFAULT 'web',
    "isActive" BOOLEAN DEFAULT true,
    "lastUsed" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add comments to columns
COMMENT ON COLUMN "PushSubscriptions"."playerId" IS 'OneSignal player ID for push notifications';
COMMENT ON COLUMN "PushSubscriptions"."userAgent" IS 'Browser user agent for web subscriptions';
COMMENT ON COLUMN "PushSubscriptions"."ipAddress" IS 'IP address when subscription was created';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id" ON "PushSubscriptions" ("userId");
CREATE INDEX IF NOT EXISTS "push_subscriptions_player_id" ON "PushSubscriptions" ("playerId");
CREATE INDEX IF NOT EXISTS "push_subscriptions_is_active" ON "PushSubscriptions" ("isActive");
CREATE INDEX IF NOT EXISTS "push_subscriptions_last_used" ON "PushSubscriptions" ("lastUsed");

-- Create unique constraint to prevent duplicate player IDs per user
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_user_player_unique"
ON "PushSubscriptions" ("userId", "playerId");

-- Create a trigger to automatically update the updatedAt timestamp
CREATE OR REPLACE FUNCTION update_push_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_push_subscriptions_updated_at ON "PushSubscriptions";
CREATE TRIGGER trigger_push_subscriptions_updated_at
    BEFORE UPDATE ON "PushSubscriptions"
    FOR EACH ROW
    EXECUTE FUNCTION update_push_subscriptions_updated_at();

-- Verify the table was created successfully
SELECT
    'PushSubscriptions table created successfully!' as message,
    COUNT(*) as row_count
FROM "PushSubscriptions";