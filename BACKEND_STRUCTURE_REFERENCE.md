# Backend Structure Reference

## Directory Structure

```
Backend/
├── src/
│   ├── app.ts                    # Express app configuration
│   ├── server.ts                 # Server entry point
│   ├── clients/                  # External service clients
│   │   ├── alatpay.client.ts    # AlatPay integration
│   │   ├── cloudinary.config.ts
│   │   ├── oneSignal.config.ts
│   │   └── paystack/
│   ├── config/                   # Configuration files
│   │   ├── config.ts
│   │   └── sequelize.config.js
│   ├── controllers/              # Request handlers
│   │   ├── auth.controller.ts
│   │   ├── order.controller.ts
│   │   ├── shoppingList.controller.ts
│   │   ├── payment/
│   │   │   └── alatpay.controller.ts
│   │   └── agent.controller.ts
│   ├── models/                   # Database models
│   │   ├── order.model.ts
│   │   ├── shoppingList.model.ts
│   │   ├── shoppingListItem.model.ts
│   │   ├── transaction.model.ts
│   │   ├── user.model.ts
│   │   ├── payment/
│   │   │   └── alatPayment.model.ts
│   │   └── index.ts
│   ├── routes/                   # API routes
│   │   ├── order.routes.ts
│   │   ├── shoppingList.routes.ts
│   │   ├── payment/
│   │   │   └── alatpay.routes.ts
│   │   └── index.ts
│   ├── services/                 # Business logic
│   │   ├── order.service.ts
│   │   ├── shoppingList.service.ts
│   │   ├── transaction.service.ts
│   │   ├── payment/
│   │   │   ├── alatpay.service.ts
│   │   │   └── alatPaymentRecord.service.ts
│   │   └── agent.service.ts
│   ├── queues/                   # Background jobs
│   │   ├── payment.queue.ts
│   │   └── index.ts
│   └── middlewares/              # Express middlewares
│       └── authMiddleware.ts
```

## Key Models

### ShoppingList
- Status: draft -> pending -> accepted -> completed
- Relations: User (customer), Agent, ShoppingListItems, Order

### Order
- Status: pending -> accepted -> in_progress -> completed -> cancelled
- PaymentStatus: pending -> completed -> failed -> expired
- Relations: ShoppingList, User (customer), Agent

### Transaction
- Status: PENDING -> COMPLETED -> FAILED -> EXPIRED -> CANCELLED
- Type: shopping_list | order
- Relations: User, reference to ShoppingList/Order

### AlatPayment
- Stores AlatPay specific payment details
- Links to Transaction model

## API Flow

### Shopping List Flow
1. Create/Update shopping list
2. Submit shopping list (status: draft -> pending)
3. Generate payment for shopping list
4. Payment webhook updates status (pending -> accepted)
5. Order automatically created via webhook
6. Agent assignment
7. Order completion

### Payment Flow
1. POST /payment/alatpay/shopping-list/:id/payment - Generate virtual account
2. Webhook receives payment confirmation
3. Queue processes webhook
4. Updates transaction status
5. Updates shopping list status
6. Creates order with payment details