import express, { Router } from 'express';
import DiscountCampaignController from '../controllers/discountCampaign.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

// All routes require authentication
router.use(basicAuth('access'));

// User routes for discount functionality
router.post('/validate-code', AuthenticatedController(DiscountCampaignController.validateDiscountCode));
router.get('/available', AuthenticatedController(DiscountCampaignController.getAvailableDiscounts));
router.post('/apply', AuthenticatedController(DiscountCampaignController.applyDiscount));
router.post('/preview', AuthenticatedController(DiscountCampaignController.calculateDiscountPreview));
router.get('/history', AuthenticatedController(DiscountCampaignController.getUserDiscountHistory));

// Admin routes for campaign management (require admin privileges - checked in controller)
router.get('/admin/campaigns', AuthenticatedController(DiscountCampaignController.getAllCampaigns));
router.get('/admin/campaigns/:id', AuthenticatedController(DiscountCampaignController.getCampaignById));
router.post('/admin/campaigns', AuthenticatedController(DiscountCampaignController.createCampaign));
router.patch('/admin/campaigns/:id', AuthenticatedController(DiscountCampaignController.updateCampaign));
router.delete('/admin/campaigns/:id', AuthenticatedController(DiscountCampaignController.deleteCampaign));
router.patch('/admin/campaigns/:id/status', AuthenticatedController(DiscountCampaignController.toggleCampaignStatus));
router.get('/admin/campaigns/:id/statistics', AuthenticatedController(DiscountCampaignController.getCampaignStatistics));

export default router;