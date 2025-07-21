const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { protect } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Get user's devices
router.get('/', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM device_profiles WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({
      success: true,
      devices: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error fetching devices'
    });
  }
});

// Register new device
router.post('/register', protect, async (req, res) => {
  try {
    const { deviceName, deviceType } = req.body;

    // Check subscription
    const { rows: subRows } = await db.query(
      'SELECT id FROM subscriptions WHERE user_id = $1 AND status IN ($2, $3)',
      [req.user.id, 'active', 'trialing']
    );

    if (subRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Active subscription required'
      });
    }

    // Generate unique profile UUID
    const profileUuid = uuidv4();

    const { rows } = await db.query(
      `INSERT INTO device_profiles (user_id, device_name, device_type, profile_uuid)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user.id, deviceName, deviceType, profileUuid]
    );

    res.json({
      success: true,
      device: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error registering device'
    });
  }
});

// Update device enrollment status
router.put('/:deviceId/enroll', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { deviceIdentifier, isSupervised } = req.body;

    const { rows } = await db.query(
      `UPDATE device_profiles 
       SET device_id = $1, is_supervised = $2, is_enrolled = true, 
           enrollment_date = CURRENT_TIMESTAMP, last_sync = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [deviceIdentifier, isSupervised, deviceId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    res.json({
      success: true,
      device: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error updating device'
    });
  }
});

// Get device blocking settings
router.get('/:deviceId/settings', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const { rows } = await db.query(
      `SELECT bs.* FROM blocking_settings bs
       JOIN device_profiles dp ON bs.device_id = dp.id
       WHERE bs.device_id = $1 AND dp.user_id = $2`,
      [deviceId, req.user.id]
    );

    if (rows.length === 0) {
      // Return default settings
      return res.json({
        success: true,
        settings: {
          block_adult_content: true,
          block_social_media: false,
          block_youtube: false,
          custom_blocked_domains: [],
          custom_allowed_domains: []
        }
      });
    }

    res.json({
      success: true,
      settings: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error fetching settings'
    });
  }
});

// Update device blocking settings
router.put('/:deviceId/settings', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { 
      blockAdultContent, 
      blockSocialMedia, 
      blockYoutube,
      customBlockedDomains,
      customAllowedDomains
    } = req.body;

    // Verify device ownership
    const { rows: deviceRows } = await db.query(
      'SELECT id FROM device_profiles WHERE id = $1 AND user_id = $2',
      [deviceId, req.user.id]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    // Upsert settings
    const { rows } = await db.query(
      `INSERT INTO blocking_settings (
        user_id, device_id, block_adult_content, block_social_media, 
        block_youtube, custom_blocked_domains, custom_allowed_domains
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (device_id) 
      DO UPDATE SET 
        block_adult_content = $3,
        block_social_media = $4,
        block_youtube = $5,
        custom_blocked_domains = $6,
        custom_allowed_domains = $7,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        req.user.id, 
        deviceId, 
        blockAdultContent, 
        blockSocialMedia, 
        blockYoutube,
        customBlockedDomains || [],
        customAllowedDomains || []
      ]
    );

    res.json({
      success: true,
      settings: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error updating settings'
    });
  }
});

// Create timer commitment
router.post('/:deviceId/timer', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { durationDays, emergencyContacts } = req.body;

    // Verify device ownership and no active timer
    const { rows: checkRows } = await db.query(
      `SELECT dp.id, tc.id as timer_id
       FROM device_profiles dp
       LEFT JOIN timer_commitments tc ON dp.id = tc.device_id AND tc.is_active = true
       WHERE dp.id = $1 AND dp.user_id = $2`,
      [deviceId, req.user.id]
    );

    if (checkRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    if (checkRows[0].timer_id) {
      return res.status(400).json({
        success: false,
        error: 'Device already has an active timer'
      });
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + (durationDays * 24 * 60 * 60 * 1000));

    const { rows } = await db.query(
      `INSERT INTO timer_commitments (
        user_id, device_id, duration_days, start_time, end_time, emergency_contacts
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [req.user.id, deviceId, durationDays, startTime, endTime, emergencyContacts || []]
    );

    res.json({
      success: true,
      timer: rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error creating timer'
    });
  }
});

// Get active timer
router.get('/:deviceId/timer', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const { rows } = await db.query(
      `SELECT tc.* FROM timer_commitments tc
       JOIN device_profiles dp ON tc.device_id = dp.id
       WHERE tc.device_id = $1 AND dp.user_id = $2 AND tc.is_active = true`,
      [deviceId, req.user.id]
    );

    res.json({
      success: true,
      timer: rows[0] || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error fetching timer'
    });
  }
});

module.exports = router;