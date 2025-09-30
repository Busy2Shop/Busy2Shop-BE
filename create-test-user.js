// create-test-user.js
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Database configuration
const sequelize = new Sequelize({
    host: process.env.DB_HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: false,
});

// Simple User model definition
const User = sequelize.define('User', {
    id: {
        type: DataTypes.STRING,
        primaryKey: true,
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    lastName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    phone: {
        type: DataTypes.JSON,
        allowNull: true,
    },
    role: {
        type: DataTypes.ENUM('customer', 'agent', 'admin'),
        defaultValue: 'customer',
    },
}, {
    tableName: 'Users',
    timestamps: true,
});

async function createTestUser() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connection established successfully');

        // Check if test user already exists
        const existingUser = await User.findByPk('test-user-12345');
        if (existingUser) {
            console.log('✅ Test user already exists:', existingUser.toJSON());
            return existingUser;
        }

        // Create test user
        const testUser = await User.create({
            id: 'test-user-12345',
            firstName: 'Test',
            lastName: 'User',
            email: 'test.user@busy2shop.com',
            phone: {
                number: '+1234567890',
                countryCode: '+1',
                verified: true
            },
            role: 'customer'
        });

        console.log('✅ Test user created successfully:', testUser.toJSON());
        return testUser;

    } catch (error) {
        console.error('❌ Error creating test user:', error);
        throw error;
    } finally {
        await sequelize.close();
    }
}

// Run the function
createTestUser()
    .then(() => {
        console.log('✅ Test user setup completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Test user setup failed:', error);
        process.exit(1);
    });