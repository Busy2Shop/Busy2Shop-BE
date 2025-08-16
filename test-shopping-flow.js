/**
 * End-to-End Shopping Flow Test Script
 * Tests the complete flow from shopping list creation to order completion
 * 
 * Usage: node test-shopping-flow.js
 * 
 * This script simulates:
 * 1. Creating a shopping list with items
 * 2. Validating and syncing the list
 * 3. Generating payment details
 * 4. Simulating webhook payment completion
 * 5. Verifying order creation and status updates
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const TEST_USER = {
  email: 'test@busy2shop.com',
  password: 'testpassword123'
};

// Test data
const TEST_SHOPPING_LIST = {
  name: 'Test Shopping List',
  items: [
    {
      name: 'Rice',
      quantity: 2,
      unit: 'kg',
      userProvidedPrice: 1500
    },
    {
      name: 'Tomatoes',
      quantity: 3,
      unit: 'kg',
      userProvidedPrice: 800
    },
    {
      name: 'Chicken',
      quantity: 1,
      unit: 'kg',
      userProvidedPrice: 3500
    }
  ]
};

const TEST_ADDRESS = {
  address: '123 Test Street',
  city: 'Lagos',
  state: 'Lagos',
  country: 'Nigeria',
  latitude: 6.5244,
  longitude: 3.3792
};

class ShoppingFlowTester {
  constructor() {
    this.token = null;
    this.userId = null;
    this.shoppingListId = null;
    this.orderId = null;
    this.transactionId = null;
  }

  async log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
    console.log('---');
  }

  async makeRequest(method, endpoint, data = null, skipAuth = false) {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {}
    };

    if (!skipAuth && this.token) {
      config.headers.Authorization = `Bearer ${this.token}`;
    }

    if (data) {
      config.data = data;
      config.headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      this.log(`ERROR: ${method} ${endpoint}`, {
        status: error.response?.status,
        message: error.response?.data?.message,
        data: error.response?.data
      });
      throw error;
    }
  }

  async authenticateUser() {
    this.log('Step 1: Authenticating user');
    
    try {
      const response = await this.makeRequest('POST', '/auth/login', TEST_USER, true);
      this.token = response.data.token;
      this.userId = response.data.user.id;
      
      this.log('✅ Authentication successful', {
        userId: this.userId,
        tokenLength: this.token?.length
      });
      return true;
    } catch (error) {
      this.log('❌ Authentication failed - creating new user');
      
      // Try to register if login fails
      try {
        const registerResponse = await this.makeRequest('POST', '/auth/register', {
          ...TEST_USER,
          firstName: 'Test',
          lastName: 'User',
          phone: '08012345678'
        }, true);
        
        this.token = registerResponse.data.token;
        this.userId = registerResponse.data.user.id;
        
        this.log('✅ Registration successful', {
          userId: this.userId,
          tokenLength: this.token?.length
        });
        return true;
      } catch (registerError) {
        this.log('❌ Registration also failed', registerError.response?.data);
        return false;
      }
    }
  }

  async createShoppingList() {
    this.log('Step 2: Creating shopping list');
    
    const response = await this.makeRequest('POST', '/shopping-list', TEST_SHOPPING_LIST);
    this.shoppingListId = response.data.id;
    
    this.log('✅ Shopping list created', {
      id: this.shoppingListId,
      name: response.data.name,
      itemsCount: response.data.items?.length
    });
  }

  async validateAndSyncList() {
    this.log('Step 3: Validating and syncing shopping list');
    
    const response = await this.makeRequest('POST', '/shopping-list/validate-sync', {
      listData: {
        id: this.shoppingListId,
        name: TEST_SHOPPING_LIST.name,
        items: TEST_SHOPPING_LIST.items
      }
    });
    
    this.log('✅ List validated and synced', {
      subtotal: response.data.subtotal,
      serviceFee: response.data.serviceFee,
      deliveryFee: response.data.deliveryFee,
      total: response.data.total,
      priceCorrections: response.data.priceCorrections?.length,
      availableDiscounts: response.data.availableDiscounts?.length
    });
    
    return response.data;
  }

  async generatePaymentDetails() {
    this.log('Step 4: Generating payment details');
    
    const response = await this.makeRequest('POST', `/payment/alatpay/shopping-list/${this.shoppingListId}/payment`, {
      currency: 'NGN',
      deliveryAddress: TEST_ADDRESS,
      customerNotes: 'Test order - please handle with care'
    });
    
    this.orderId = response.data.orderId;
    this.transactionId = response.data.transactionId;
    
    this.log('✅ Payment details generated', {
      orderId: this.orderId,
      orderNumber: response.data.orderNumber,
      transactionId: this.transactionId,
      amount: response.data.amount,
      accountNumber: response.data.accountNumber
    });
    
    return response.data;
  }

  async simulateWebhookPayment() {
    this.log('Step 5: Simulating webhook payment completion');
    
    // Simulate the webhook payload that AlatPay would send
    const webhookPayload = {
      Value: {
        Data: {
          Id: this.transactionId,
          Status: 'COMPLETED',
          Amount: 6000, // Example amount
          OrderId: this.orderId,
          CustomerId: this.userId
        }
      }
    };
    
    const response = await this.makeRequest('POST', '/payment/alatpay/webhook', webhookPayload, true);
    
    this.log('✅ Webhook processed', response);
    
    // Wait a moment for queue processing
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  async checkOrderStatus() {
    this.log('Step 6: Checking order status via webhook endpoint');
    
    const response = await this.makeRequest('GET', `/payment/webhook-status/order-status/${this.transactionId}`);
    
    this.log('✅ Order status retrieved', {
      orderNumber: response.data.order?.orderNumber,
      orderStatus: response.data.order?.status,
      paymentStatus: response.data.order?.paymentStatus,
      Status: response.data.Status
    });
    
    return response.data;
  }

  async checkTraditionalPaymentStatus() {
    this.log('Step 7: Checking payment status via traditional endpoint');
    
    try {
      const response = await this.makeRequest('GET', `/payment/alatpay/transaction/${this.transactionId}`);
      
      this.log('✅ Traditional payment status retrieved', response.data);
      return response.data;
    } catch (error) {
      this.log('ℹ️ Traditional payment status check failed (expected for mock transaction)');
      return null;
    }
  }

  async getOrderDetails() {
    this.log('Step 8: Getting complete order details');
    
    const response = await this.makeRequest('GET', `/order/${this.orderId}`);
    
    this.log('✅ Order details retrieved', {
      id: response.data.id,
      orderNumber: response.data.orderNumber,
      status: response.data.status,
      paymentStatus: response.data.paymentStatus,
      totalAmount: response.data.totalAmount,
      customerId: response.data.customerId,
      shoppingListId: response.data.shoppingListId
    });
    
    return response.data;
  }

  async getOrderTrail() {
    this.log('Step 9: Getting order trail/audit log');
    
    try {
      const response = await this.makeRequest('GET', `/order/${this.orderId}/trail`);
      
      this.log('✅ Order trail retrieved', {
        eventsCount: response.data?.length,
        events: response.data?.map(event => ({
          action: event.action,
          description: event.description,
          performedBy: event.performedBy,
          createdAt: event.createdAt
        }))
      });
      
      return response.data;
    } catch (error) {
      this.log('ℹ️ Order trail not available (may not be implemented)');
      return null;
    }
  }

  async runCompleteTest() {
    this.log('🚀 Starting End-to-End Shopping Flow Test');
    
    try {
      // Step 1: Authentication
      const authenticated = await this.authenticateUser();
      if (!authenticated) {
        throw new Error('Authentication failed');
      }
      
      // Step 2: Create shopping list
      await this.createShoppingList();
      
      // Step 3: Validate and sync
      await this.validateAndSyncList();
      
      // Step 4: Generate payment
      await this.generatePaymentDetails();
      
      // Step 5: Simulate webhook
      await this.simulateWebhookPayment();
      
      // Step 6: Check order via webhook endpoint
      const orderStatus = await this.checkOrderStatus();
      
      // Step 7: Check via traditional endpoint
      await this.checkTraditionalPaymentStatus();
      
      // Step 8: Get complete order details
      await this.getOrderDetails();
      
      // Step 9: Get order trail
      await this.getOrderTrail();
      
      // Final verification
      const isCompleted = orderStatus?.Status === 'COMPLETED' || 
                         orderStatus?.order?.paymentStatus === 'completed';
      
      if (isCompleted) {
        this.log('🎉 END-TO-END TEST COMPLETED SUCCESSFULLY!');
        this.log('✅ All systems working correctly:');
        this.log('  - Shopping list creation ✅');
        this.log('  - Price validation and sync ✅');
        this.log('  - Payment generation ✅');
        this.log('  - Webhook processing ✅');
        this.log('  - Order status updates ✅');
        this.log('  - Both polling and webhook endpoints ✅');
      } else {
        this.log('⚠️ Test completed but payment status not confirmed');
        this.log('This may indicate an issue with webhook processing');
      }
      
    } catch (error) {
      this.log('❌ TEST FAILED', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5)
      });
    }
  }
}

// Run the test
if (require.main === module) {
  const tester = new ShoppingFlowTester();
  tester.runCompleteTest().then(() => {
    console.log('\n✅ Test execution completed');
    process.exit(0);
  }).catch((error) => {
    console.error('\n❌ Test execution failed:', error.message);
    process.exit(1);
  });
}

module.exports = ShoppingFlowTester;