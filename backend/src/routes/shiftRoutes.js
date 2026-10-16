const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shiftController');

// Endpoint sesi shift
router.get('/active', shiftController.getActiveShift);
router.post('/mulai', shiftController.startShift); // POST /api/shift/mulai
router.post('/start', shiftController.startShift); // Alias bahasa inggris
router.post('/:id/tutup', shiftController.closeShift); // POST /api/shift/:id/tutup
router.post('/:id/close', shiftController.closeShift); // Alias bahasa inggris
router.get('/:id/summary', shiftController.getShiftSummary);

module.exports = router;
