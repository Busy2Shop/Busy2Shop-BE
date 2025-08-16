# Busy2Shop API Endpoints Summary

## Shopping Flow Endpoints

### Shopping Lists
- `POST /api/shopping-list` - Create shopping list
- `GET /api/shopping-list/organized` - Get organized shopping lists
- `PUT /api/shopping-list/:id` - Update shopping list
- `DELETE /api/shopping-list/:id` - Delete shopping list
- `POST /api/shopping-list/:id/items` - Add item to list
- `PUT /api/shopping-list/:id/items/:itemId` - Update item
- `DELETE /api/shopping-list/:id/items/:itemId` - Remove item
- `POST /api/shopping-list/validate-sync` - **Validate and sync list (KEY ENDPOINT)**

### Payment Processing
- `POST /api/payment/alatpay/shopping-list/:shoppingListId/payment` - **Generate payment details**
- `GET /api/payment/alatpay/transaction/:transactionId` - Check traditional payment status
- `POST /api/payment/alatpay/webhook` - Handle AlatPay webhooks
- `GET /api/payment/webhook-status/order-status/:transactionId` - **NEW: Enhanced status check**

### Orders
- `GET /api/order` - Get user orders
- `GET /api/order/:id` - Get order by ID/orderNumber
- `GET /api/order/:id/trail` - Get order audit trail
- `PUT /api/order/:id/status` - Update order status

### User Management
- `GET /api/user-addresses` - Get user addresses
- `POST /api/user-addresses/mark-used/:id` - Mark address as used

## Flow Process

### 1. Shopping List Creation
```
Frontend: /app/shopping-list/page.tsx
Endpoints: POST /api/shopping-list, POST /api/shopping-list/:id/items
```

### 2. Price Validation & Sync
```
Frontend: "Send to Market Agent" button
Endpoint: POST /api/shopping-list/validate-sync
- Validates item prices
- Applies discounts
- Returns corrected totals
```

### 3. Checkout Process
```
Frontend: /app/checkout/page.tsx
Endpoints: 
- POST /api/payment/alatpay/shopping-list/:id/payment (generates virtual account)
- Creates Order with 'pending' status
- Schedules payment expiry check
```

### 4. Payment Status Monitoring
```
Primary: GET /api/payment/webhook-status/order-status/:transactionId (webhook-style)
Fallback: GET /api/payment/alatpay/transaction/:transactionId (traditional polling)

Frontend Hook: useEnhancedPaymentStatus
- Uses webhook endpoint as primary
- Falls back to polling if needed
- Progressive polling intervals (10s → 30s → 60s)
```

### 5. Webhook Processing
```
Endpoint: POST /api/payment/alatpay/webhook
Queue: paymentWebhookQueue
- Processes payment completion
- Updates order payment status
- Updates shopping list status
- Logs order trail events
```

### 6. Order Tracking
```
Frontend: /app/orders/page.tsx, /app/orders/[id]/page.tsx
Endpoints: GET /api/order, GET /api/order/:id, GET /api/order/:id/trail
```

## Queue System

### Payment Webhook Queue
- **Queue Name**: `payment-webhook`
- **Job Type**: `process-webhook`
- **Worker**: Processes payment status updates
- **Auto-triggers**: Order status updates, shopping list acceptance

### Payment Expiry Queue  
- **Queue Name**: `payment-expiry-check`
- **Job Type**: `check-expiry`  
- **Worker**: Handles payment timeouts
- **Auto-scheduled**: 30 minutes after payment generation

## Status Flow

### Shopping List Status
`draft` → `pending` (validation) → `accepted` (payment complete)

### Order Status  
`pending` (awaiting payment) → `accepted` (payment complete) → `in_progress` → `completed`

### Payment Status
`pending` → `completed` | `failed` | `expired`

## Key Improvements Made

1. **Dual Payment Monitoring**: Webhook + polling approach
2. **Queue Automation**: Background processing of payment updates  
3. **Enhanced Error Handling**: Proper TypeScript types and error recovery
4. **Progressive Polling**: Smart interval adjustments
5. **Order Trail**: Complete audit logging
6. **Status Synchronization**: Automatic status updates across shopping list → order → payment

## Testing

Run end-to-end test:
```bash
cd Backend
npm install axios  # if not already installed
node test-shopping-flow.js
```

This tests the complete flow from list creation to order completion.