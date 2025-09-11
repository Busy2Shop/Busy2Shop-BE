import { Router } from 'express';
import CategoryController from '../controllers/category.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Array, 'files', 5);

// Public routes
router.get('/', CategoryController.getAllCategories);
router.get('/:id', CategoryController.getCategory);
router.get('/:id/markets', CategoryController.getMarketsByCategory);

// Test routes (NO AUTHENTICATION REQUIRED)
router.post(
    '/test-create',
    upload,
    CategoryController.testCreateCategory,
);

// Protected routes
router.post(
    '/',
    basicAuth('access'),
    upload,
    AuthenticatedController(CategoryController.createCategory),
);
router.put(
    '/:id',
    basicAuth('access'),
    upload,
    AuthenticatedController(CategoryController.updateCategory),
);
router.delete(
    '/:id',
    basicAuth('access'),
    AuthenticatedController(CategoryController.deleteCategory),
);
router.patch(
    '/:id/pin',
    basicAuth('access'),
    AuthenticatedController(CategoryController.toggleCategoryPin),
);

export default router;
