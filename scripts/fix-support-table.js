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

async function fixTable() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected successfully.');

        // Add all missing columns
        await sequelize.query(`
            DO $$
            BEGIN
                -- Add responses column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'responses'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "responses" JSONB DEFAULT '[]'::jsonb;
                    RAISE NOTICE 'Column responses added';
                END IF;

                -- Add attachments column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'attachments'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;
                    RAISE NOTICE 'Column attachments added';
                END IF;

                -- Add userAgent column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'userAgent'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "userAgent" VARCHAR(500);
                    RAISE NOTICE 'Column userAgent added';
                END IF;

                -- Add ipAddress column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'ipAddress'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "ipAddress" VARCHAR(50);
                    RAISE NOTICE 'Column ipAddress added';
                END IF;

                -- Add lastResponseAt column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'lastResponseAt'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "lastResponseAt" TIMESTAMP;
                    RAISE NOTICE 'Column lastResponseAt added';
                END IF;

                -- Add resolvedAt column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'resolvedAt'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "resolvedAt" TIMESTAMP;
                    RAISE NOTICE 'Column resolvedAt added';
                END IF;

                -- Add resolvedBy column
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'SupportTickets' AND column_name = 'resolvedBy'
                ) THEN
                    ALTER TABLE "SupportTickets" ADD COLUMN "resolvedBy" VARCHAR(255);
                    RAISE NOTICE 'Column resolvedBy added';
                END IF;

                RAISE NOTICE 'All columns checked/added successfully';
            END$$;
        `);

        console.log('✅ Table fix completed successfully');
        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixTable();
