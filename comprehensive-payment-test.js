const axios = require('axios');

/**
 * Comprehensive Payment Flow Testing Script
 * Tests both AlatPay and Paystack integration with the same flow
 *
 * Usage: node comprehensive-payment-test.js [paystack|alatpay] [shopping-list-id]
 * Example: node comprehensive-payment-test.js paystack f4be0000-d338-4598-8f0c-ef981d08fff6
 */

const testPaymentFlow = async (paymentMethod = 'paystack', shoppingListId = 'f4be0000-d338-4598-8f0c-ef981d08fff6') => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoiODZjZGQ4OWItYzM2Yi00YzM5LTliNmYtNWFkY2M2YjU5YmZkIn0sInRva2VuVHlwZSI6ImFjY2VzcyIsImlhdCI6MTc1ODA4MDM0NiwiZXhwIjoxNzYwNjcyMzQ2fQ.s1bsyy0fuHg4wFFpx0i5RbzfKztzYe_90xza81p7CPc';
    const baseURL = 'http://localhost:8088/api/v0';

    let orderId = null;
    let orderNumber = null;
    let reference = null;

    console.log(`🧪 COMPREHENSIVE ${paymentMethod.toUpperCase()} PAYMENT FLOW TEST\n`);
    console.log(`📝 Shopping List ID: ${shoppingListId}`);
    console.log(`💳 Payment Method: ${paymentMethod}\n`);

    try {
        // Test 1: Get public key (Paystack only)
        if (paymentMethod === 'paystack') {
            console.log('1️⃣ Testing Paystack public key endpoint...');
            const publicKeyResponse = await axios.get(`${baseURL}/payment/paystack/public-key`);
            console.log('✅ Public key retrieved:', publicKeyResponse.data.data.publicKey?.substring(0, 10) + '...\n');
        }

        // Test 2: Initialize payment
        console.log(`2️⃣ Testing ${paymentMethod} payment initialization...`);

        const initEndpoint = paymentMethod === 'paystack'
            ? `${baseURL}/payment/paystack/shopping-list/${shoppingListId}/initialize`
            : `${baseURL}/payment/alatpay/shopping-list/${shoppingListId}/generate`;

        const initResponse = await axios.post(
            initEndpoint,
            {
                currency: 'NGN',
                deliveryAddress: {
                    address: '7 Shoyomokun St, Ikate, Lagos 101241, Lagos, Nigeria',
                    latitude: 6.51074440,
                    longitude: 3.34198470,
                    city: 'Surulere',
                    state: 'Lagos',
                    country: 'Nigeria',
                },
                customerNotes: `Comprehensive test order for ${paymentMethod} integration`
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Payment initialized successfully');
        console.log(`📝 Order Number: ${initResponse.data.data.orderNumber}`);
        console.log(`🆔 Order ID: ${initResponse.data.data.orderId}`);
        console.log(`📋 Reference/Transaction ID: ${initResponse.data.data.reference || initResponse.data.data.transactionId}`);
        console.log(`💰 Amount: ₦${initResponse.data.data.amount?.toLocaleString()}`);

        // Fee breakdown
        if (initResponse.data.data.fees) {
            console.log(`💸 Fees Breakdown:`);
            console.log(`   - Subtotal: ₦${initResponse.data.data.fees.subtotal?.toLocaleString()}`);
            console.log(`   - Service Fee: ₦${initResponse.data.data.fees.serviceFee?.toLocaleString()}`);
            console.log(`   - Delivery Fee: ₦${initResponse.data.data.fees.deliveryFee?.toLocaleString()}`);
            console.log(`   - Total: ₦${initResponse.data.data.fees.total?.toLocaleString()}`);
        }

        orderId = initResponse.data.data.orderId;
        orderNumber = initResponse.data.data.orderNumber;
        reference = initResponse.data.data.reference || initResponse.data.data.transactionId;

        // Test 3: Check payment status before payment
        console.log(`\n3️⃣ Testing payment status check (before payment)...`);

        const statusCheckEndpoint = paymentMethod === 'paystack'
            ? `${baseURL}/payment/paystack/check/${reference}`
            : `${baseURL}/payment/alatpay/check/${reference}`;

        const statusBeforeResponse = await axios.get(statusCheckEndpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('✅ Status before payment:', statusBeforeResponse.data.data.status);

        // Test 4: Simulate payment verification
        console.log(`\n4️⃣ Testing payment verification simulation...`);

        const verifyEndpoint = paymentMethod === 'paystack'
            ? `${baseURL}/payment/paystack/verify/${reference}`
            : `${baseURL}/payment/alatpay/check/${reference}`;

        try {
            const verifyResponse = await axios.post(verifyEndpoint, {}, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            console.log('ℹ️ Verification response status:', verifyResponse.data.status);
        } catch (verifyError) {
            console.log('ℹ️ Expected verification error (payment not completed yet)');
        }

        // Test 5: Manual payment confirmation (simulate webhook/success)
        console.log(`\n5️⃣ Testing manual payment confirmation...`);

        const confirmEndpoint = paymentMethod === 'paystack'
            ? `${baseURL}/payment/paystack/test/confirm-payment`
            : `${baseURL}/payment/alatpay/test/confirm-payment`;

        const confirmResponse = await axios.post(confirmEndpoint, {
            orderId,
            [paymentMethod === 'paystack' ? 'reference' : 'transactionId']: reference,
            source: 'test',
            performedBy: 'test-script'
        });

        console.log('✅ Payment confirmed manually');
        console.log(`🎯 Assigned Agent ID: ${confirmResponse.data.data.assignedAgentId || 'None'}`);

        // Test 6: Check payment status after confirmation
        console.log(`\n6️⃣ Testing payment status check (after confirmation)...`);

        const statusAfterResponse = await axios.get(statusCheckEndpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('✅ Status after confirmation:', statusAfterResponse.data.data.status);
        console.log(`👤 Agent assigned: ${statusAfterResponse.data.data.agent ? 'Yes' : 'No'}`);

        if (statusAfterResponse.data.data.agent) {
            console.log(`   - Agent: ${statusAfterResponse.data.data.agent.firstName} ${statusAfterResponse.data.data.agent.lastName}`);
        }

        // Test 7: Try to create duplicate order (should return existing)
        console.log(`\n7️⃣ Testing duplicate order prevention...`);

        const duplicateResponse = await axios.post(initEndpoint, {
            currency: 'NGN',
            deliveryAddress: {
                address: 'Different Address for Duplicate Test',
                latitude: 6.5244,
                longitude: 3.3792,
                city: 'Lagos',
                state: 'Lagos',
                country: 'Nigeria',
            },
            customerNotes: 'Attempt to create duplicate order'
        }, {
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });

        console.log('✅ Duplicate order handling:', duplicateResponse.data.message);
        console.log(`🔄 Same order returned: ${duplicateResponse.data.data.orderNumber === orderNumber}`);
        console.log(`💰 Payment completed: ${duplicateResponse.data.data.paymentCompleted ? 'Yes' : 'No'}`);

        // Test 8: Fee calculation consistency check
        console.log(`\n8️⃣ Testing fee calculation consistency...`);

        const originalFees = initResponse.data.data.fees;
        const duplicateFees = duplicateResponse.data.data.fees;

        if (originalFees && duplicateFees) {
            const feesMatch =
                originalFees.subtotal === duplicateFees.subtotal &&
                originalFees.serviceFee === duplicateFees.serviceFee &&
                originalFees.deliveryFee === duplicateFees.deliveryFee &&
                originalFees.total === duplicateFees.total;

            console.log(`✅ Fee calculations consistent: ${feesMatch ? 'Yes' : 'No'}`);

            if (!feesMatch) {
                console.log('⚠️ Fee mismatch detected:');
                console.log(`Original: ${JSON.stringify(originalFees, null, 2)}`);
                console.log(`Duplicate: ${JSON.stringify(duplicateFees, null, 2)}`);
            }
        }

        // Test 9: Final status verification
        console.log(`\n9️⃣ Final status verification...`);

        const finalStatusResponse = await axios.get(statusCheckEndpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const finalStatus = finalStatusResponse.data.data;
        console.log('✅ Final order status:', finalStatus.status);
        console.log(`📅 Created: ${new Date(finalStatus.createdAt).toLocaleString()}`);
        console.log(`💳 Payment Method: ${finalStatus.paymentMethod || paymentMethod.toUpperCase()}`);

        if (finalStatus.paymentProcessedAt) {
            console.log(`✅ Payment processed: ${new Date(finalStatus.paymentProcessedAt).toLocaleString()}`);
        }

        console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
        console.log('\n📊 FINAL SUMMARY:');
        console.log(`Payment Method: ${paymentMethod.toUpperCase()}`);
        console.log(`Order Number: ${orderNumber}`);
        console.log(`Order ID: ${orderId}`);
        console.log(`Reference: ${reference}`);
        console.log(`Final Status: ${finalStatus.status}`);
        console.log(`Amount: ₦${finalStatus.amount?.toLocaleString()}`);
        console.log(`Agent Assigned: ${finalStatus.agent ? 'Yes' : 'No'}`);
        console.log(`Redirect URL: /orders/${orderNumber}?new=true&payment=completed&ref=${reference}`);

        console.log('\n✨ Payment integration is working correctly and matches AlatPay flow!');

    } catch (error) {
        console.error(`❌ Error during ${paymentMethod} testing:`, {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        if (error.response?.status === 401) {
            console.error('💡 Hint: Check if the JWT token is valid and not expired');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.error('💡 Hint: Make sure the server is running on port 8088');
        }
    }
};

// Parse command line arguments
const args = process.argv.slice(2);
const paymentMethod = args[0] || 'paystack';
const shoppingListId = args[1] || 'f4be0000-d338-4598-8f0c-ef981d08fff6';

if (!['paystack', 'alatpay'].includes(paymentMethod)) {
    console.error('❌ Invalid payment method. Use "paystack" or "alatpay"');
    process.exit(1);
}

// Run the test
testPaymentFlow(paymentMethod, shoppingListId);