/**
 * Settings Routes
 * Admin endpoints for managing system settings
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const SettingsService = require('../services/settingsService');
const AuditService = require('../services/auditService');

/**
 * GET /admin/settings
 * Get all settings (admin only)
 */
router.get('/admin/settings', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const grouped = await SettingsService.getSettingsByCategory();
    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/settings/flat
 * Get all settings as flat array
 */
router.get('/admin/settings/flat', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const settings = await SettingsService.getAllSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/settings/:key
 * Get a specific setting by key
 */
router.get('/admin/settings/:key', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const setting = await SettingsService.getSetting(req.params.key);
    
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ success: true, data: setting });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /admin/settings/:key
 * Update a single setting
 */
router.put('/admin/settings/:key', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const { value, type = 'percentage', description } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const setting = await SettingsService.updateSetting(
      req.params.key,
      value,
      req.user.id,
      type,
      description
    );

    // Log to audit trail
    await AuditService.logAction({
      user_id: req.user.id,
      action: 'UPDATE_SETTING',
      resource_type: 'settings',
      resource_id: req.params.key,
      details: `Updated setting: ${req.params.key} = ${value}`,
      ip_address: req.ip
    });

    res.json({ success: true, data: setting, message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/settings/bulk
 * Bulk update multiple settings
 */
router.post('/admin/settings/bulk', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const { settings } = req.body;

    if (!Array.isArray(settings) || settings.length === 0) {
      return res.status(400).json({ error: 'Settings array is required' });
    }

    const results = await SettingsService.bulkUpdateSettings(settings, req.user.id);

    // Log to audit trail
    await AuditService.logAction({
      user_id: req.user.id,
      action: 'BULK_UPDATE_SETTINGS',
      resource_type: 'settings',
      details: `Updated ${settings.length} settings`,
      ip_address: req.ip
    });

    res.json({ success: true, data: results, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error bulk updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /admin/settings/calculate-fees
 * Calculate fees based on amount and organizer
 */
router.get('/admin/settings/calculate-fees', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized: Admin only' });
    }

    const { amount, organizer_id } = req.query;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const fees = await SettingsService.calculateFees(parseFloat(amount), organizer_id);
    res.json({ success: true, data: fees });
  } catch (error) {
    console.error('Error calculating fees:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
