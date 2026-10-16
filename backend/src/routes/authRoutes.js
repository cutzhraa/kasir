const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const requireAuth = require('../middlewares/requireAuth');

router.post('/login', authController.login);
router.get('/users', requireAuth, authController.getUsers);

module.exports = router;
