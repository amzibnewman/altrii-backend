// routes/timers.js
const express = require('express');
const { protect } = require('../middleware/auth');
const db = require('../db');
const jamfService = require('../services/jamfService');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Get subscription tier limits
const getSubscriptionLimits = (subscriptionTier) => {
  const limits = {
    '1month': { maxDays: 30, displayName: 'Monthly' },
    '3month': { maxDays: 90, displayName: '3-Month' },
    '1year': { maxDays: 365, displayName: 'Annual' }
  };
  return limits[subscriptionTier] || limits['1month'];
};

// Determine subscription tier from plan type
const getSubscriptionTier = (planType) => {
  const tierMap = {
    'monthly': '1month',
    '3months': '3month', 
    '3month': '3month',
    'yearly': '1year',
    'annual': '1year',
    '1year': '1year'
  };
  return tierMap[planType] || '1month';
};

/**
 * Create timer commitment
 * POST /api/timers/:deviceId/create
 */
router.post('/:deviceId/create', [
  protect,
  body('commitmentDays').isInt({ min: 1, max: 365 }).withMessage('Commitment days must be between 1 and 365'),
  body('confirmUnderstanding').isBoolean().withMessage('Must confirm understanding')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { deviceId } = req.params;
    const { commitmentDays, confirmUnderstanding } = req.body;

    if (!confirmUnderstanding) {
      return res.status(400).json({
        success: false,
        error: 'Must confirm understanding of timer commitment'
      });
    }

    // Get user's current subscription
    const { rows: subRows } = await db.query(
      `SELECT plan_type, status FROM subscriptions 
       WHERE user_id = $1 AND status IN ('active', 'trialing') 
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (subRows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Active subscription required for timer commitments'
      });
    }

    const subscription = subRows[0];
    const subscriptionTier = getSubscriptionTier(subscription.plan_type);
    const limits = getSubscriptionLimits(subscriptionTier);

    // Validate commitment days against subscription tier
    if (commitmentDays > limits.maxDays) {
      return res.status(400).json({
        success: false,
        error: `Your ${limits.displayName} subscription allows maximum ${limits.maxDays} day commitments. Upgrade to commit for ${commitmentDays} days.`,
        maxAllowed: limits.maxDays,
        subscriptionTier: limits.displayName
      });
    }

    // Check if device exists and user owns it
    const { rows: deviceRows } = await db.query(
      `SELECT * FROM device_profiles 
       WHERE id = $1 AND user_id = $2`,
      [deviceId, req.user.id]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }

    const device = deviceRows[0];

    // Check for existing active timer
    const { rows: existingTimer } = await db.query(
      `SELECT id FROM timer_commitments 
       WHERE device_id = $1 AND status = 'active' AND commitment_end > NOW()`,
      [deviceId]
    );

    if (existingTimer.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Device already has an active timer commitment'
      });
    }

    // Ensure device is enrolled in Jamf
    if (!device.jamf_device_id) {
      return res.status(400).json({
        success: false,
        error: 'Device must be enrolled in MDM before creating timer commitments',
        action: 'enroll_device'
      });
    }

    const commitmentStart = new Date();
    const commitmentEnd = new Date(commitmentStart.getTime() + (commitmentDays * 24 * 60 * 60 * 1000));

    // Create timer commitment record
    const { rows: timerRows } = await db.query(
      `INSERT INTO timer_commitments (
        user_id, device_id, subscription_tier, commitment_days,
        commitment_start, commitment_end, status,
        locked_settings, jamf_device_id
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8)
      RETURNING *`,
      [
        req.user.id,
        deviceId,
        subscriptionTier,
        commitmentDays,
        commitmentStart,
        commitmentEnd,
        JSON.stringify({
          profileRemoval: false,
          factoryReset: false,
          appInstallation: false,
          systemSettings: false
        }),
        device.jamf_device_id
      ]
    );

    const timerCommitment = timerRows[0];

    try {
      // Create and deploy restriction profile via Jamf
      const profileResult = await jamfService.createRestrictionProfile(
        device.jamf_device_id,
        timerCommitment
      );

      if (!profileResult.success) {
        throw new Error('Failed to create restriction profile');
      }

      // Deploy the profile to the device
      const deployResult = await jamfService.deployProfile(
        device.jamf_device_id,
        profileResult.profileId
      );

      if (!deployResult.success) {
        throw new Error('Failed to deploy restriction profile');
      }

      // Update timer with Jamf profile ID
      await db.query(
        `UPDATE timer_commitments 
         SET jamf_profile_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [profileResult.profileId, timerCommitment.id]
      );

      // Schedule cleanup job for when timer expires
      // This would typically use a job queue like Bull or agenda
      // For now, we'll rely on a cron job to check expired timers

      res.json({
        success: true,
        timer: {
          ...timerCommitment,
          jamf_profile_id: profileResult.profileId
        },
        message: `Timer commitment activated for ${commitmentDays} days. Your device is now locked until ${commitmentEnd.toLocaleDateString()}.`
      });

    } catch (jamfError) {
      // If Jamf operations fail, clean up the database record
      await db.query('DELETE FROM timer_commitments WHERE id = $1', [timerCommitment.id]);
      
      console.error('Jamf timer setup error:', jamfError);
      res.status(500).json({
        success: false,
        error: 'Failed to activate timer commitment. Please try again or contact support.',
        technical: jamfError.message
      });
    }

  } catch (error) {
    console.error('Timer commitment creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error creating timer commitment'
    });
  }
});

/**
 * Get active timer commitment for device
 * GET /api/timers/:deviceId
 */
router.get('/:deviceId', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const { rows } = await db.query(
      `SELECT tc.*, dp.device_name, dp.jamf_device_id,
              EXTRACT(EPOCH FROM (tc.commitment_end - NOW())) as seconds_remaining
       FROM timer_commitments tc
       JOIN device_profiles dp ON tc.device_id = dp.id
       WHERE tc.device_id = $1 AND dp.user_id = $2 AND tc.status = 'active'
       ORDER BY tc.created_at DESC LIMIT 1`,
      [deviceId, req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        timer: null
      });
    }

    const timer = rows[0];
    const now = new Date();
    const isExpired = new Date(timer.commitment_end) <= now;

    if (isExpired && timer.status === 'active') {
      // Mark as expired and trigger cleanup
      await db.query(
        `UPDATE timer_commitments SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [timer.id]
      );
      
      // Trigger async cleanup of Jamf restrictions
      if (timer.jamf_profile_id) {
        jamfService.removeProfile(timer.jamf_device_id, timer.jamf_profile_id)
          .catch(err => console.error('Failed to remove expired profile:', err));
      }

      return res.json({
        success: true,
        timer: null,
        message: 'Timer commitment has expired'
      });
    }

    // Get current device status from Jamf
    let jamfStatus = null;
    if (timer.jamf_device_id) {
      const statusResult = await jamfService.getDeviceStatus(timer.jamf_device_id);
      if (statusResult.success) {
        jamfStatus = {
          isOnline: statusResult.isOnline,
          isCompliant: statusResult.isCompliant,
          lastSeen: statusResult.device.last_seen_at
        };
      }
    }

    res.json({
      success: true,
      timer: {
        ...timer,
        seconds_remaining: Math.max(0, timer.seconds_remaining),
        is_active: !isExpired,
        jamf_status: jamfStatus
      }
    });

  } catch (error) {
    console.error('Get timer error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching timer commitment'
    });
  }
});

/**
 * Get timer commitment limits for user's subscription
 * GET /api/timers/limits
 */
router.get('/limits', protect, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT plan_type, status FROM subscriptions 
       WHERE user_id = $1 AND status IN ('active', 'trialing') 
       ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        limits: {
          maxDays: 0,
          subscriptionTier: 'none',
          hasSubscription: false
        }
      });
    }

    const subscription = rows[0];
    const subscriptionTier = getSubscriptionTier(subscription.plan_type);
    const limits = getSubscriptionLimits(subscriptionTier);

    res.json({
      success: true,
      limits: {
        maxDays: limits.maxDays,
        subscriptionTier: limits.displayName,
        hasSubscription: true,
        planType: subscription.plan_type
      }
    });

  } catch (error) {
    console.error('Get limits error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching subscription limits'
    });
  }
});

/**
 * Emergency timer cancellation (requires special authorization)
 * POST /api/timers/:deviceId/emergency-cancel
 */
router.post('/:deviceId/emergency-cancel', [
  protect,
  body('reason').isLength({ min: 10 }).withMessage('Detailed reason required'),
  body('confirmEmergency').isBoolean().withMessage('Must confirm emergency')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { deviceId } = req.params;
    const { reason, confirmEmergency } = req.body;

    if (!confirmEmergency) {
      return res.status(400).json({
        success: false,
        error: 'Must confirm this is a genuine emergency'
      });
    }

    // Get active timer
    const { rows } = await db.query(
      `SELECT tc.*, dp.jamf_device_id FROM timer_commitments tc
       JOIN device_profiles dp ON tc.device_id = dp.id
       WHERE tc.device_id = $1 AND dp.user_id = $2 AND tc.status = 'active'`,
      [deviceId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active timer commitment found'
      });
    }

    const timer = rows[0];

    // Log emergency cancellation attempt
    await db.query(
      `INSERT INTO emergency_cancellations (
        user_id, timer_commitment_id, reason, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        timer.id,
        reason,
        req.ip,
        req.headers['user-agent'] || 'unknown'
      ]
    );

    // For now, we'll require manual review for emergency cancellations
    // In production, you might want to implement additional verification
    res.json({
      success: false,
      error: 'Emergency cancellation requests require manual review. Support has been notified.',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@altriirecovery.com',
      ticketId: `EMG-${timer.id}-${Date.now()}`
    });

  } catch (error) {
    console.error('Emergency cancellation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error processing emergency cancellation'
    });
  }
});

/**
 * Get timer commitment history
 * GET /api/timers/history
 */
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT tc.*, dp.device_name,
              CASE 
                WHEN tc.status = 'active' AND tc.commitment_end > NOW() THEN 'active'
                WHEN tc.status = 'active' AND tc.commitment_end <= NOW() THEN 'expired'
                ELSE tc.status
              END as computed_status
       FROM timer_commitments tc
       JOIN device_profiles dp ON tc.device_id = dp.id
       WHERE tc.user_id = $1
       ORDER BY tc.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) FROM timer_commitments WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      success: true,
      timers: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countRows[0].count),
        totalPages: Math.ceil(countRows[0].count / limit)
      }
    });

  } catch (error) {
    console.error('Timer history error:', error);
    res.status(500).json({
      success: false,
      error: 'Error fetching timer history'
    });
  }
});

module.exports = router;