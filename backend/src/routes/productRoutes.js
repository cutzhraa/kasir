const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/', productController.getAll);
router.get('/lookup/:code', productController.lookupBarcode);
router.get('/:code', productController.getByBarcodeOrSku);
router.post('/', productController.create);

module.exports = router;
