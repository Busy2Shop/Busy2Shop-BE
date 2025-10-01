# Featured Promotions Feature - Implementation Specification

**Status:** 🚧 **IN PROGRESS**
**Date:** October 1, 2025
**Feature:** Dynamic promotional cards on home page with search integration

---

## Overview

This feature adds a 6-card grid (3 rows × 2 columns) to the home page displaying promotional content that links to specific search results. Each card can be configured by admins to promote markets, products, categories, or special discounts.

---

## Database Schema

### Table: `featured_promotions`

```sql
CREATE TABLE featured_promotions (
    id UUID PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    subtitle VARCHAR(200),
    icon VARCHAR(50),                    -- Lucide icon name or emoji
    iconUrl TEXT,                        -- Custom image URL
    backgroundColor VARCHAR(50),
    backgroundGradient JSONB,            -- {from: "#color", to: "#color", direction: "to-br"}
    searchQuery VARCHAR(200) NOT NULL,
    searchType ENUM('location', 'market', 'product', 'category', 'discount', 'all'),
    searchFilters JSONB,                 -- Additional filters
    displayOrder INTEGER DEFAULT 0,
    isActive BOOLEAN DEFAULT true,
    startDate TIMESTAMP,
    endDate TIMESTAMP,
    clickCount INTEGER DEFAULT 0,
    metadata JSONB,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
```

**Indexes:**
- `(isActive, displayOrder)` - For fetching active promotions
- `(searchType)` - For filtering by type
- `(startDate, endDate)` - For scheduled promotions

---

## Backend Implementation

### ✅ Completed Files

1. **Migration**: `/Backend/src/migrations/20251001000000-create-featured-promotions-table.js`
   - Creates table with default 6 promotional cards:
     - Computer Village (location, blue gradient)
     - Alaba International (location, purple gradient)
     - Balogun Market (location, pink gradient)
     - Trade Fair (location, orange gradient)
     - Laptops (product, green gradient)
     - Food Items (category, red gradient)

2. **Model**: `/Backend/src/models/featuredPromotion.model.ts`
   - Sequelize TypeScript model
   - Helper methods: `isCurrentlyActive()`, `incrementClickCount()`
   - Type interfaces: `IFeaturedPromotion`, `IGradientConfig`, `ISearchFilters`

3. **Service**: `/Backend/src/services/featuredPromotion.service.ts`
   - `getActivePromotions(limit)` - Get active promotions for home page
   - `getAllPromotions(options)` - Admin view with filters
   - `getPromotionById(id)` - Get single promotion
   - `createPromotion(data)` - Create new promotion
   - `updatePromotion(id, data)` - Update promotion
   - `deletePromotion(id)` - Delete promotion
   - `togglePromotionStatus(id)` - Activate/deactivate
   - `reorderPromotions(orders)` - Change display order
   - `trackClick(id)` - Analytics tracking
   - `getPromotionAnalytics(id)` - Click analytics

4. **Routes**:
   - **Home routes** (`/Backend/src/routes/home.routes.ts`):
     ```typescript
     GET  /home/featured-promotions           // Get active promotions
     POST /home/featured-promotions/:id/track-click  // Track clicks
     ```

   - **Admin routes** (`/Backend/src/routes/admin.routes.ts`):
     ```typescript
     GET    /admin/featured-promotions               // List all
     GET    /admin/featured-promotions/:id           // Get one
     GET    /admin/featured-promotions/:id/analytics // Analytics
     POST   /admin/featured-promotions               // Create
     PUT    /admin/featured-promotions/:id           // Update
     DELETE /admin/featured-promotions/:id           // Delete
     PATCH  /admin/featured-promotions/:id/toggle-status  // Toggle active
     POST   /admin/featured-promotions/reorder       // Reorder cards
     ```

5. **Controllers**:
   - **Home controller** (`/Backend/src/controllers/home.controller.ts`):
     - `getFeaturedPromotions()` - Public endpoint
     - `trackPromotionClick()` - Analytics endpoint

### 🚧 TODO: Admin Controller Methods

Add to `/Backend/src/controllers/Admin/admin.controller.ts`:

```typescript
import FeaturedPromotionService from '../../services/featuredPromotion.service';

// Add these methods to AdminController class:

static async getAllFeaturedPromotions(req: AuthenticatedRequest, res: Response) {
    const { includeInactive, searchType, limit } = req.query;
    const promotionService = new FeaturedPromotionService();

    const promotions = await promotionService.getAllPromotions({
        includeInactive: includeInactive === 'true',
        searchType: searchType as any,
        limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ status: 'success', data: { promotions, count: promotions.length } });
}

static async getFeaturedPromotion(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const promotionService = new FeaturedPromotionService();
    const promotion = await promotionService.getPromotionById(id);
    res.json({ status: 'success', data: { promotion } });
}

static async getPromotionAnalytics(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const promotionService = new FeaturedPromotionService();
    const analytics = await promotionService.getPromotionAnalytics(id);
    res.json({ status: 'success', data: analytics });
}

static async createFeaturedPromotion(req: AuthenticatedRequest, res: Response) {
    const promotionService = new FeaturedPromotionService();
    const promotion = await promotionService.createPromotion(req.body);
    res.status(201).json({ status: 'success', data: { promotion } });
}

static async updateFeaturedPromotion(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const promotionService = new FeaturedPromotionService();
    const promotion = await promotionService.updatePromotion(id, req.body);
    res.json({ status: 'success', data: { promotion } });
}

static async deleteFeaturedPromotion(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const promotionService = new FeaturedPromotionService();
    await promotionService.deletePromotion(id);
    res.json({ status: 'success', message: 'Promotion deleted successfully' });
}

static async togglePromotionStatus(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const promotionService = new FeaturedPromotionService();
    const promotion = await promotionService.togglePromotionStatus(id);
    res.json({ status: 'success', data: { promotion, isActive: promotion.isActive } });
}

static async reorderPromotions(req: AuthenticatedRequest, res: Response) {
    const { promotionOrders } = req.body; // Array of {id, displayOrder}
    const promotionService = new FeaturedPromotionService();
    await promotionService.reorderPromotions(promotionOrders);
    res.json({ status: 'success', message: 'Promotions reordered successfully' });
}
```

---

## Frontend Implementation

### 🚧 TODO: Featured Promotions Component

Create `/Frontend/components/FeaturedPromotionsGrid.tsx`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import axios from 'axios';

interface FeaturedPromotion {
    id: string;
    title: string;
    subtitle?: string;
    icon?: string;
    iconUrl?: string;
    backgroundColor: string;
    backgroundGradient?: {
        from: string;
        to: string;
        direction: string;
    };
    searchQuery: string;
    searchType: 'location' | 'market' | 'product' | 'category' | 'discount' | 'all';
    searchFilters?: any;
}

export default function FeaturedPromotionsGrid() {
    const router = useRouter();
    const [clickedId, setClickedId] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['featured-promotions'],
        queryFn: async () => {
            const response = await axios.get('/api/home/featured-promotions');
            return response.data.data.promotions as FeaturedPromotion[];
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const handleCardClick = async (promotion: FeaturedPromotion) => {
        setClickedId(promotion.id);

        // Track click (fire and forget)
        try {
            await axios.post(`/api/home/featured-promotions/${promotion.id}/track-click`);
        } catch (error) {
            console.error('Failed to track click:', error);
        }

        // Navigate to search page with appropriate params
        const params = new URLSearchParams({
            q: promotion.searchQuery,
            type: promotion.searchType,
        });

        if (promotion.searchFilters) {
            Object.entries(promotion.searchFilters).forEach(([key, value]) => {
                params.append(key, String(value));
            });
        }

        router.push(`/search?${params.toString()}`);
    };

    const renderIcon = (promotion: FeaturedPromotion) => {
        if (promotion.iconUrl) {
            return <img src={promotion.iconUrl} alt={promotion.title} className="w-8 h-8 object-contain" />;
        }

        if (promotion.icon) {
            // Try to get Lucide icon
            const IconComponent = (LucideIcons as any)[promotion.icon];
            if (IconComponent) {
                return <IconComponent className="w-8 h-8 text-white" />;
            }
            // Fallback to emoji
            return <span className="text-3xl">{promotion.icon}</span>;
        }

        return <LucideIcons.ShoppingBag className="w-8 h-8 text-white" />;
    };

    const getBackgroundStyle = (promotion: FeaturedPromotion) => {
        if (promotion.backgroundGradient) {
            const { from, to, direction } = promotion.backgroundGradient;
            return {
                background: `linear-gradient(${direction}, ${from}, ${to})`,
            };
        }
        return {
            backgroundColor: promotion.backgroundColor,
        };
    };

    if (isLoading) {
        return (
            <div className="w-full py-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore Popular Sections</h2>
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return null; // Don't show section if no promotions
    }

    return (
        <div className="w-full py-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Explore Popular Sections</h2>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.map((promotion) => (
                    <Card
                        key={promotion.id}
                        className={`
                            relative overflow-hidden cursor-pointer
                            transform transition-all duration-300
                            hover:scale-105 hover:shadow-2xl
                            active:scale-95
                            ${clickedId === promotion.id ? 'animate-pulse' : ''}
                        `}
                        style={getBackgroundStyle(promotion)}
                        onClick={() => handleCardClick(promotion)}
                    >
                        <div className="relative h-32 p-4 flex flex-col justify-between">
                            {/* Glossy overlay effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent pointer-events-none" />

                            {/* Icon */}
                            <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm">
                                {renderIcon(promotion)}
                            </div>

                            {/* Text content */}
                            <div className="relative z-10">
                                <h3 className="text-lg font-bold text-white mb-1 drop-shadow-lg">
                                    {promotion.title}
                                </h3>
                                {promotion.subtitle && (
                                    <p className="text-xs text-white/90 drop-shadow">
                                        {promotion.subtitle}
                                    </p>
                                )}
                            </div>

                            {/* Animated shimmer effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 transform translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                        </div>
                    </Card>
                ))}
            </div>
        </div>
    );
}
```

### 🚧 TODO: Integrate into Home Page

Update `/Frontend/app/page.tsx`:

```typescript
import FeaturedPromotionsGrid from '@/components/FeaturedPromotionsGrid';

// Inside the HomePage component, add after HotDealsBanner:
<div className="w-full mb-6 sm:mb-8">
    <FeaturedPromotionsGrid />
</div>
```

---

## Admin UI Implementation

### 🚧 TODO: Featured Promotions Management Page

Create `/Admin/app/home/featured-promotions/page.tsx`:

This page should include:
1. **List view** with all promotions (active + inactive)
2. **Create button** to add new promotions
3. **Edit modal** for updating promotions
4. **Toggle active/inactive** button
5. **Drag-and-drop reordering** of cards
6. **Analytics dashboard** showing click counts
7. **Preview** of how cards will appear
8. **Color picker** for background colors/gradients
9. **Icon selector** (Lucide icons + emoji + custom image upload)
10. **Search type selector** (location, market, product, category, discount)
11. **Filters configuration** (JSON editor)
12. **Schedule** for time-limited promotions (startDate, endDate)

Key fields to include:
- Title (required)
- Subtitle (optional)
- Icon selector (Lucide icon name, emoji, or image upload)
- Background color/gradient picker
- Search query (required)
- Search type dropdown (required)
- Advanced filters (JSON editor)
- Display order (number)
- Active toggle
- Start/End dates (optional)

---

## Search Page Enhancement

### 🚧 TODO: Update Search Result Prioritization

Update `/Frontend/app/(customer)/search/page.tsx`:

The search page already supports the `type` parameter. When clicking a featured promotion card, it will navigate with:
- `q` = searchQuery
- `type` = searchType
- Additional filter params from searchFilters

The existing search logic should handle this correctly, but you may want to add special handling to show a banner like:
```typescript
{searchParams.get('featured') && (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
        <p className="text-sm text-blue-700">
            🎯 Showing results for: <strong>{searchParams.get('q')}</strong>
        </p>
    </div>
)}
```

---

## Database Migration Instructions

1. **Run the migration:**
   ```bash
   cd Backend
   NODE_ENV=development npx sequelize-cli db:migrate --name 20251001000000-create-featured-promotions-table.js
   ```

2. **Verify default data:**
   ```sql
   SELECT id, title, searchType, isActive, displayOrder
   FROM featured_promotions
   ORDER BY displayOrder;
   ```

3. **Rollback if needed:**
   ```bash
   NODE_ENV=development npx sequelize-cli db:migrate:undo
   ```

---

## Testing Checklist

- [ ] Run database migration successfully
- [ ] Verify 6 default promotions created
- [ ] Test GET /home/featured-promotions endpoint
- [ ] Test click tracking endpoint
- [ ] Add admin controller methods
- [ ] Test admin CRUD endpoints
- [ ] Create FeaturedPromotionsGrid component
- [ ] Integrate component into home page
- [ ] Test card clicks navigate to search correctly
- [ ] Test search type prioritization
- [ ] Create admin management UI
- [ ] Test admin create/edit/delete
- [ ] Test card reordering
- [ ] Test active/inactive toggle
- [ ] Test scheduled promotions (start/end dates)
- [ ] Test analytics tracking
- [ ] Test gradient backgrounds render correctly
- [ ] Test Lucide icons render
- [ ] Test custom image icons
- [ ] Test responsive layout (mobile, tablet, desktop)

---

## API Usage Examples

### Get Featured Promotions (Public)
```bash
GET /api/home/featured-promotions?limit=6
```

### Track Click (Public)
```bash
POST /api/home/featured-promotions/{id}/track-click
```

### Admin - List All Promotions
```bash
GET /api/admin/featured-promotions?includeInactive=true
Authorization: Bearer {admin_token}
```

### Admin - Create Promotion
```bash
POST /api/admin/featured-promotions
Authorization: Bearer {admin_token}
Content-Type: application/json

{
    "title": "Friday Flash Sale",
    "subtitle": "20% off all electronics",
    "icon": "Zap",
    "backgroundColor": "#F59E0B",
    "backgroundGradient": {
        "from": "#F59E0B",
        "to": "#D97706",
        "direction": "to-br"
    },
    "searchQuery": "electronics sale",
    "searchType": "discount",
    "searchFilters": {
        "hasDiscount": true,
        "minDiscount": 20
    },
    "displayOrder": 1,
    "isActive": true,
    "startDate": "2025-10-04T00:00:00Z",
    "endDate": "2025-10-05T23:59:59Z"
}
```

### Admin - Reorder Promotions
```bash
POST /api/admin/featured-promotions/reorder
Authorization: Bearer {admin_token}
Content-Type: application/json

{
    "promotionOrders": [
        { "id": "uuid-1", "displayOrder": 1 },
        { "id": "uuid-2", "displayOrder": 2 },
        { "id": "uuid-3", "displayOrder": 3 }
    ]
}
```

---

## Production Considerations

1. **Image Hosting**: If using custom icons, ensure images are hosted on CDN
2. **Caching**: Frontend caches promotions for 5 minutes
3. **Analytics**: Click tracking is fire-and-forget (doesn't block navigation)
4. **Scheduled Promotions**: Consider adding a cron job to auto-activate/deactivate based on dates
5. **A/B Testing**: Future enhancement to test different card designs
6. **Click-through Rate**: Track CTR in analytics dashboard
7. **Mobile Optimization**: Ensure cards work well on small screens
8. **Accessibility**: Add proper ARIA labels and keyboard navigation
9. **SEO**: Cards are client-side, won't affect SEO directly
10. **Performance**: Lazy load card images if using custom icons

---

## Summary

**✅ Completed:**
- Database schema and migration
- Sequelize model
- Service layer with all business logic
- Home API endpoints (get + track)
- Admin API routes defined
- Home controller methods

**🚧 Remaining:**
- Admin controller method implementation (copy code from spec above)
- Frontend FeaturedPromotionsGrid component
- Integration into home page
- Admin management UI
- Search page enhancements (optional)
- Run migration
- End-to-end testing

**Estimated Remaining Time:** 4-6 hours for a complete implementation with admin UI.

---

**Last Updated:** October 1, 2025
