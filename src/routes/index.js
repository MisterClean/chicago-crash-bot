// src/routes/index.js
const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const subscriptionController = require('../controllers/subscriptionController');
const adminController = require('../controllers/adminController');
const { authenticateJWT } = require('../middleware/auth');

const router = express.Router();

// Public dashboard routes
router.get('/api/dashboard', dashboardController.getDashboardData);
router.get('/api/boundaries/:type', dashboardController.getGeoBoundaries);

// Subscription routes
router.post('/api/subscriptions', subscriptionController.createSubscription);
router.delete('/api/subscriptions/:id', subscriptionController.unsubscribe);
router.get('/api/verify/:token', subscriptionController.verifyEmail);

// Admin routes
router.post('/api/admin/login', adminController.login);

// Protected admin routes
router.get('/api/admin/data-logs', authenticateJWT, adminController.getDataLogs);
router.get('/api/admin/report-logs', authenticateJWT, adminController.getReportLogs);
router.get('/api/admin/subscription-stats', authenticateJWT, adminController.getSubscriptionStats);
router.post('/api/admin/trigger-data-update', authenticateJWT, adminController.triggerDataUpdate);
router.post('/api/admin/trigger-report', authenticateJWT, adminController.triggerReportGeneration);
router.post('/api/admin/upload-shapefile', authenticateJWT, adminController.uploadShapefile);

module.exports = router;
