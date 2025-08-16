# Payment & Status Flow Documentation
## Single Source of Truth Implementation

### Overview
This document outlines the unified payment confirmation and status management system implemented to ensure consistency across all payment flows and eliminate duplicate logic.

## Status Definitions

### Shopping List Statuses
- `draft` - User creating/editing shopping list ✏️
- `accepted` - Payment confirmed, ready for agent assignment ✅
- `processing` - Agent assigned and actively shopping 🛒
- `completed` - Order delivered successfully 📦
- `cancelled` - Order cancelled ❌

### Order Statuses
- `pending` - Order created, awaiting payment 💳
- `accepted` - Payment confirmed, ready for agent
- `in_progress` - Agent assigned and working
- `shopping` - Agent actively shopping
- `shopping_completed` - Shopping done, preparing delivery
- `delivery` - Out for delivery
- `completed` - Order delivered
- `cancelled` - Order cancelled

### Payment Statuses
- `pending` - Payment not yet completed
- `completed` - Payment successfully processed
- `failed` - Payment failed
- `expired` - Payment window expired

## Frontend Shopping List Visibility

### Before Fix ❌
```javascript
// Only showed draft and pending lists
queryParams.status = ['draft', 'pending'];
// Problem: After payment, lists became 'accepted' and disappeared!
```

### After Fix ✅
```javascript
// Shows draft and accepted lists
queryParams.status = ['draft', 'accepted'];
// Users can see both editable drafts and paid orders waiting for agents
```

## Unified Payment Confirmation Service

### Single Source of Truth
Created `PaymentStatusSyncService` that handles ALL payment confirmations:

```typescript
PaymentStatusSyncService.confirmPayment(
    orderId: string,
    transactionId: string,
    source: 'webhook' | 'api_sync',
    performedBy: string
)
```

### What It Does
1. **Updates Order Payment Status** → `'completed'`
2. **Updates Shopping List Status** → `'accepted'`
3. **Updates Shopping List Payment Info** → `paymentStatus: 'completed'`
4. **Auto-assigns Agent** → First available agent
5. **Updates Order Status** → `'in_progress'` (if agent found)
6. **Updates Shopping List Status** → `'processing'` (if agent assigned)
7. **Logs Trail Entry** → Complete audit trail

## Status Flow Mapping

### Payment Confirmation Flow
```
Order Creation:
├── Order: pending + paymentStatus: pending
└── Shopping List: draft

Payment Confirmation:
├── Order: accepted + paymentStatus: completed
└── Shopping List: accepted + paymentStatus: completed

Agent Assignment:
├── Order: in_progress
└── Shopping List: processing

Order Completion:
├── Order: completed
└── Shopping List: completed
```

### Status Consistency Rules
```typescript
function getShoppingListStatus(orderStatus: string, paymentStatus: string) {
    if (paymentStatus !== 'completed') return 'draft';
    
    switch (orderStatus) {
        case 'pending':
        case 'accepted':
            return 'accepted';    // Payment confirmed, ready for agent
        case 'in_progress':
        case 'shopping':
        case 'shopping_completed':
        case 'delivery':
            return 'processing';  // Agent actively working
        case 'completed':
            return 'completed';   // Order delivered
        case 'cancelled':
            return 'cancelled';   // Order cancelled
        default:
            return 'draft';
    }
}
```

## Implementation Details

### Webhook Processing
**Before**: Complex nested transaction logic
**After**: Single service call
```typescript
// webhook uses unified service
const result = await PaymentStatusSyncService.confirmPayment(
    order.id,
    transactionId,
    'webhook',
    'system'
);
```

### API Sync Processing  
**Before**: Duplicate transaction logic
**After**: Same unified service
```typescript
// alatpay controller uses same service
const result = await PaymentStatusSyncService.confirmPayment(
    existingOrder.id,
    existingOrder.paymentId,
    'api_sync',
    req.user.id
);
```

## Benefits Achieved

### ✅ Single Source of Truth
- All payment confirmations use the same logic
- No more duplicate code between webhook and API sync
- Consistent status updates across all flows

### ✅ Frontend Visibility Fixed
- Users can see their paid shopping lists
- Proper status filtering based on user needs
- Clear separation between draft, paid, and active orders

### ✅ Automatic Agent Assignment
- Every confirmed payment gets an agent assigned
- Order immediately moves to 'in_progress' status
- Shopping list moves to 'processing' status

### ✅ Complete Audit Trail
- All status changes logged with context
- Source tracking (webhook vs api_sync)
- Metadata includes agent assignments and timing

### ✅ Error Recovery
- API sync detects webhook processing failures
- Automatic correction when status mismatches detected
- Graceful fallback handling

## API Response Examples

### Completed Payment Response
```json
{
  "status": "success",
  "message": "Payment already completed for this order",
  "data": {
    "transactionId": "payment-id",
    "orderStatus": "in_progress",
    "paymentStatus": "completed", 
    "paymentCompleted": true,
    "agentId": "agent-uuid",
    "agent": {
      "id": "agent-uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "agent@example.com"
    }
  }
}
```

### Shopping List Status Response
```json
{
  "status": "success",
  "data": {
    "lists": [
      {
        "id": "list-id",
        "name": "Weekly Groceries",
        "status": "accepted",        // Shows in frontend!
        "paymentStatus": "completed",
        "agent": { /* agent info */ }
      }
    ]
  }
}
```

## Status Validation

The service includes consistency validation:
```typescript
const consistency = await PaymentStatusSyncService.validateStatusConsistency(orderId);
if (!consistency.isConsistent) {
    logger.warn('Status issues detected:', consistency.issues);
}
```

## Migration Notes

### Existing Orders
- No database migration needed
- Service handles existing inconsistent states
- Automatic correction on next API call

### Frontend Changes
- Shopping list endpoint now includes 'accepted' status
- Users will see their paid orders immediately
- Better UX with proper status visibility

This implementation ensures your system has a single, reliable source of truth for all payment-related status updates while maintaining backward compatibility and providing automatic error recovery.