import express, { Router } from 'express';
import ReferralController from '../controllers/referral.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

router
    .get('/', ReferralController.getAllReferrals)
    .get('/:id', ReferralController.getReferralById)
    .post('/', basicAuth('access'), AuthenticatedController(ReferralController.createReferral))
    .patch('/:id', basicAuth('access'), AuthenticatedController(ReferralController.updateReferral))
    .delete('/:id', basicAuth('access'), AuthenticatedController(ReferralController.deleteReferral));

export default router;