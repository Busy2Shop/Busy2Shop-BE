const { Sequelize } = require('sequelize');
require('dotenv').config();

const dbUrl = process.env.PG_URL || process.env.DATABASE_URL;

if (!dbUrl) {
    console.error('❌ Database URL not found in environment variables');
    process.exit(1);
}

const sequelize = new Sequelize(dbUrl, {
    dialect: 'postgres',
    logging: console.log,
});

async function recreateTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected successfully.');

        // Drop and recreate the entire table with all columns
        await sequelize.query(`
            DROP TABLE IF EXISTS "SupportTickets" CASCADE;

            CREATE TABLE "SupportTickets" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "email" VARCHAR(255) NOT NULL,
                "name" VARCHAR(255) NOT NULL,
                "message" TEXT NOT NULL,
                "subject" VARCHAR(255) NOT NULL,
                "type" VARCHAR(50) NOT NULL CHECK ("type" IN ('Support-Request', 'Bug-Report')),
                "state" VARCHAR(50) DEFAULT 'Pending' CHECK ("state" IN ('Pending', 'In Progress', 'Resolved', 'Closed')),
                "adminKey" VARCHAR(255),
                "phone" VARCHAR(255),
                "priority" VARCHAR(50) DEFAULT 'medium' CHECK ("priority" IN ('low', 'medium', 'high', 'urgent')),
                "category" VARCHAR(50) NOT NULL DEFAULT 'general' CHECK ("category" IN ('technical', 'billing', 'general', 'partnership', 'feedback', 'other')),
                "assignedAdminId" VARCHAR(255),
                "responses" JSONB DEFAULT '[]'::jsonb,
                "lastResponseAt" TIMESTAMP,
                "resolvedAt" TIMESTAMP,
                "resolvedBy" VARCHAR(255),
                "attachments" JSONB DEFAULT '[]'::jsonb,
                "userAgent" VARCHAR(500),
                "ipAddress" VARCHAR(50),
                "userId" VARCHAR(255),
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );

            -- Create indexes for better performance
            CREATE INDEX "idx_support_tickets_email" ON "SupportTickets"("email");
            CREATE INDEX "idx_support_tickets_state" ON "SupportTickets"("state");
            CREATE INDEX "idx_support_tickets_priority" ON "SupportTickets"("priority");
            CREATE INDEX "idx_support_tickets_category" ON "SupportTickets"("category");
            CREATE INDEX "idx_support_tickets_assignedAdminId" ON "SupportTickets"("assignedAdminId");
            CREATE INDEX "idx_support_tickets_userId" ON "SupportTickets"("userId");
            CREATE INDEX "idx_support_tickets_createdAt" ON "SupportTickets"("createdAt");
        `);

        console.log('✅ SupportTickets table recreated successfully with all columns and indexes');
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

recreateTable();
