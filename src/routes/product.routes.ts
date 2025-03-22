import { Router } from 'express';
import ProductController from '../controllers/product.controller';
/*
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';
*/

const router = Router();

/*
const upload = uploadMiddleware(UploadType.Array, 'files', 5);
*/

// Public routes
router.get('/', ProductController.getAllProducts);
router.get('/:id', ProductController.getProduct);

// Market products route
router.get('/market/:marketId', ProductController.getMarketProducts);

// Protected routes
/*
router.post('/',  basicAuth('access'), upload, AuthenticatedController(ProductController.createProduct));
router.put('/:id',  basicAuth('access'), upload, AuthenticatedController(ProductController.updateProduct));
router.delete('/:id',  basicAuth('access'), AuthenticatedController(ProductController.deleteProduct));
router.patch('/:id/toggle',  basicAuth('access'), AuthenticatedController(ProductController.toggleProductAvailability));
router.post('/bulk',  basicAuth('access'), AuthenticatedController(ProductController.bulkCreateProducts)); 
*/

export default router;
