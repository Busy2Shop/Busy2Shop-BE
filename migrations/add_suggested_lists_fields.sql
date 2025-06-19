-- Migration: Add suggested lists fields to shopping_lists table
-- Run this on your database to add the new fields for suggested lists functionality

-- Add enum types first
DO $$ BEGIN
    CREATE TYPE creator_type AS ENUM ('user', 'admin', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE list_type AS ENUM ('personal', 'suggested', 'template');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to shopping_lists table
ALTER TABLE "ShoppingLists" 
ADD COLUMN IF NOT EXISTS "creatorType" creator_type DEFAULT 'user',
ADD COLUMN IF NOT EXISTS "listType" list_type DEFAULT 'personal',
ADD COLUMN IF NOT EXISTS "category" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "tags" TEXT[],
ADD COLUMN IF NOT EXISTS "estimatedTime" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "estimatedCost" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "minPrice" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "maxPrice" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "marketType" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "image" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "isPopular" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "createdBy" UUID REFERENCES "Users"(id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_list_type" ON "ShoppingLists" ("listType");
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_creator_type" ON "ShoppingLists" ("creatorType");
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_category" ON "ShoppingLists" ("category");
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_is_active" ON "ShoppingLists" ("isActive");
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_is_popular" ON "ShoppingLists" ("isPopular");
CREATE INDEX IF NOT EXISTS "idx_shopping_lists_sort_order" ON "ShoppingLists" ("sortOrder");

-- Optional: Insert some sample suggested lists
-- Uncomment the following lines if you want to add sample data

/*
INSERT INTO "ShoppingLists" 
(id, name, notes, "creatorType", "listType", category, tags, "estimatedTime", "estimatedCost", "marketType", image, "isPopular", "isActive", "sortOrder", "customerId", status, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    'Weekly Grocery Essentials',
    'Everything you need for a week of home cooking',
    'system',
    'suggested',
    'grocery',
    ARRAY['essential', 'weekly', 'family'],
    '2-3 hours',
    '₦8,500 - ₦12,000',
    'Supermarket',
    '/images/weekly-groceries.jpg',
    true,
    true,
    1,
    (SELECT id FROM "Users" WHERE "userType" = 'admin' LIMIT 1),
    'draft',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "ShoppingLists" 
    WHERE name = 'Weekly Grocery Essentials' AND "listType" = 'suggested'
);

INSERT INTO "ShoppingLists" 
(id, name, notes, "creatorType", "listType", category, tags, "estimatedTime", "estimatedCost", "marketType", image, "isPopular", "isActive", "sortOrder", "customerId", status, "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    'Healthy Living Basket',
    'Fresh ingredients for nutritious meals',
    'system',
    'suggested',
    'health',
    ARRAY['healthy', 'fresh', 'organic'],
    '1-2 hours',
    '₦6,000 - ₦10,000',
    'Fresh Market',
    '/images/healthy-basket.jpg',
    false,
    true,
    2,
    (SELECT id FROM "Users" WHERE "userType" = 'admin' LIMIT 1),
    'draft',
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM "ShoppingLists" 
    WHERE name = 'Healthy Living Basket' AND "listType" = 'suggested'
);
*/ 