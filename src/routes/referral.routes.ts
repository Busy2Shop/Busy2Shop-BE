import express, { Router } from 'express';
import ReferralController from '../controllers/referral.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

// Public routes
router.get('/', ReferralController.getAllReferrals);
router.get('/:id', ReferralController.getReferralById);

// Protected routes
router.use(basicAuth('access'));
router.post('/', AuthenticatedController(ReferralController.createReferral));
router.patch('/:id', AuthenticatedController(ReferralController.updateReferral));
router.delete('/:id', AuthenticatedController(ReferralController.deleteReferral));

export default router;