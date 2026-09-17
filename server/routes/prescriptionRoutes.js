'use strict';

const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const { create, list } = require('../controllers/prescriptionController');

const router = express.Router();
router.use(authenticate);
router.get('/', asyncHandler(list));
router.post('/', requireRole('doctor'), asyncHandler(create));

module.exports = router;
