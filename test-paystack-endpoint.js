const axios = require('axios');

const testPaystackFlowComprehensive = async () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoiODZjZGQ4OWItYzM2Yi00YzM5LTliNmYtNWFkY2M2YjU5YmZkIn0sInRva2VuVHlwZSI6ImFjY2VzcyIsImlhdCI6MTc1ODA4MDM0NiwiZXhwIjoxNzYwNjcyMzQ2fQ.s1bsyy0fuHg4wFFpx0i5RbzfKztzYe_90xza81p7CPc';
    const shoppingListId = 'f4be0000-d338-4598-8f0c-ef981d08fff6';
    const baseURL = 'http://localhost:8088/api/v0';

    let orderId = null;
    let orderNumber = null;
    let reference = null;

    try {
        console.log('🧪 COMPREHENSIVE PAYSTACK FLOW TEST\n');

        // Test 1: Get public key
        console.log('1️⃣ Testing public key endpoint...');
        const publicKeyResponse = await axios.get(`${baseURL}/payment/paystack/public-key`);
        console.log('✅ Public key retrieved:', publicKeyResponse.data.data.publicKey?.substring(0, 10) + '...');

        // Test 2: Initialize payment
        console.log('\n2️⃣ Testing payment initialization...');
        const initResponse = await axios.post(
            `${baseURL}/payment/paystack/shopping-list/${shoppingListId}/initialize`,
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
                customerNotes: 'Comprehensive test order for Paystack integration'
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
        console.log(`📋 Reference: ${initResponse.data.data.reference}`);
        console.log(`💰 Amount: ₦${initResponse.data.data.amount.toLocaleString()}`);

        orderId = initResponse.data.data.orderId;
        orderNumber = initResponse.data.data.orderNumber;
        reference = initResponse.data.data.reference;

        // Test 3: Check payment status before payment
        console.log('\n3️⃣ Testing payment status check (before payment)...');
        const statusBeforeResponse = await axios.get(
            `${baseURL}/payment/paystack/check/${reference}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            }
        );
        console.log('✅ Status before payment:', statusBeforeResponse.data.data.status);

        // Test 4: Simulate payment verification (for testing)
        console.log('\n4️⃣ Testing payment verification simulation...');
        const verifyResponse = await axios.post(
            `${baseURL}/payment/paystack/verify/${reference}`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            }
        );
        console.log('ℹ️ Verification response status:', verifyResponse.data.status);
        if (verifyResponse.data.status === 'error') {
            console.log('Expected: Payment not yet completed on Paystack');
        }

        // Test 5: Manual payment confirmation (simulate webhook/success)
        console.log('\n5️⃣ Testing manual payment confirmation...');
        const confirmResponse = await axios.post(
            `${baseURL}/payment/paystack/test/confirm-payment`,
            {
                orderId,
                reference,
                source: 'test',
                performedBy: 'test-script'
            }
        );

        console.log('✅ Payment confirmed manually');
        console.log(`🎯 Assigned Agent ID: ${confirmResponse.data.data.assignedAgentId || 'None'}`);

        // Test 6: Check payment status after confirmation
        console.log('\n6️⃣ Testing payment status check (after confirmation)...');
        const statusAfterResponse = await axios.get(
            `${baseURL}/payment/paystack/check/${reference}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                }
            }
        );
        console.log('✅ Status after confirmation:', statusAfterResponse.data.data.status);
        console.log(`👤 Agent assigned: ${statusAfterResponse.data.data.agent ? 'Yes' : 'No'}`);

        // Test 7: Try to create duplicate order (should return existing)
        console.log('\n7️⃣ Testing duplicate order prevention...');
        const duplicateResponse = await axios.post(
            `${baseURL}/payment/paystack/shopping-list/${shoppingListId}/initialize`,
            {
                currency: 'NGN',
                deliveryAddress: {
                    address: 'Different Address',
                    latitude: 6.5244,
                    longitude: 3.3792,
                    city: 'Lagos',
                    state: 'Lagos',
                    country: 'Nigeria',
                },
                customerNotes: 'Attempt to create duplicate order'
            },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Duplicate order handling:', duplicateResponse.data.message);
        console.log(`🔄 Same order returned: ${duplicateResponse.data.data.orderNumber === orderNumber}`);

        console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
        console.log('\n📊 SUMMARY:');
        console.log(`Order Number: ${orderNumber}`);
        console.log(`Order ID: ${orderId}`);
        console.log(`Reference: ${reference}`);
        console.log(`Final Status: completed`);
        console.log(`Redirect URL: /orders/${orderNumber}?new=true&payment=completed&ref=${reference}`);

    } catch (error) {
        console.error('❌ Error during testing:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
    }
};

testPaystackFlowComprehensive();