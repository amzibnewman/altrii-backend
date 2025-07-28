const express = require('express');
const { protect } = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// Generate iOS Configuration Profile
router.get('/ios/:deviceId', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;

    // Verify device ownership
    const { rows: deviceRows } = await db.query(
      `SELECT dp.*, bs.* 
       FROM device_profiles dp
       LEFT JOIN blocking_settings bs ON dp.id = bs.device_id
       WHERE dp.id = $1 AND dp.user_id = $2 AND dp.device_type = $3`,
      [deviceId, req.user.id, 'ios']
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const device = deviceRows[0];
    
    // We'll build the profile XML here
    const profile = generateIOSProfile(device);
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/x-apple-asconfig');
    res.setHeader('Content-Disposition', `attachment; filename="altrii-${device.device_name}.mobileconfig"`);
    
    res.send(profile);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error generating profile'
    });
  }
});

module.exports = router;
