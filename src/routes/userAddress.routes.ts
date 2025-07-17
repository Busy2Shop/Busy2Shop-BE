import express, { Router } from 'express';
import UserAddressController from '../controllers/userAddress.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

// All routes require authentication
router.use(basicAuth('access'));

// User address management routes
router.get('/', AuthenticatedController(UserAddressController.getUserAddresses));
router.get('/default', AuthenticatedController(UserAddressController.getDefaultAddress));
router.get('/:id', AuthenticatedController(UserAddressController.getAddressById));
router.post('/', AuthenticatedController(UserAddressController.createAddress));
router.patch('/:id', AuthenticatedController(UserAddressController.updateAddress));
router.delete('/:id', AuthenticatedController(UserAddressController.deleteAddress));
router.patch('/:id/set-default', AuthenticatedController(UserAddressController.setDefaultAddress));

// Address validation
router.post('/validate', AuthenticatedController(UserAddressController.validateAddress));

// Google Places integration
router.post('/from-google-place', AuthenticatedController(UserAddressController.createFromGooglePlace));
router.patch('/:id/mark-used', AuthenticatedController(UserAddressController.markAsUsed));

export default router;