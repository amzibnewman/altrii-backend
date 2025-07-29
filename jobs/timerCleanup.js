// jobs/timerCleanup.js
const cron = require('node-cron');
const db = require('../db');
const jamfService = require('../services/jamfService');
const { sendEmail } = require('../utils/email');

class TimerCleanupService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Send timer completion email
   */
  async sendTimerCompletionEmail(timer) {
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
          <p style="color: #6b7280; font-size: 16px;">Timer Commitment Complete</p>
        </div>
        
        <div style="background: #f0fdf4; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #10b981;">
          <h2 style="color: #374151; margin-bottom: 20px;">🎉 Congratulations, ${timer.first_name}!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            You've successfully completed your ${timer.commitment_days}-day timer commitment for <strong>${timer.device_name}</strong>!
          </p>
          
          <div style="background: #ffffff; padding: 20px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #374151; margin-bottom: 15px;">📊 Commitment Summary</h3>
            <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
              <li><strong>Duration:</strong> ${timer.commitment_days} days</li>
              <li><strong>Started:</strong> ${new Date(timer.commitment_start).toLocaleDateString()}</li>
              <li><strong>Completed:</strong> ${new Date(timer.commitment_end).toLocaleDateString()}</li>
              <li><strong>Device:</strong> ${timer.device_name}</li>
            </ul>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 15px;">
            Your device restrictions have been automatically removed. You can now:
          </p>
          
          <ul style="color: #4b5563; line-height: 1.8; margin-bottom: 25px;">
            <li>✅ Modify your device settings freely</li>
            <li>✅ Remove or update the Altrii Recovery profile if desired</li>
            <li>✅ Create a new timer commitment anytime</li>
            <li>✅ Factory reset your device (no longer restricted)</li>
          </ul>
        </div>
        
        <div style="background: #f9fafb; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
          <h3 style="color: #374151; margin-bottom: 15px;">🚀 What's Next?</h3>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
            Keep building on your success! Consider:
          </p>
          
          <div style="display: flex; gap: 15px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 200px;">
              <h4 style="color: #6366f1; margin-bottom: 10px;">Continue Protection</h4>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Keep your content filter active for ongoing support
              </p>
            </div>
            <div style="flex: 1; min-width: 200px;">
              <h4 style="color: #6366f1; margin-bottom: 10px;">New Commitment</h4>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Start another timer for continued accountability
              </p>
            </div>
          </div>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
            Go to Dashboard
          </a>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>You're doing amazing work on your recovery journey!</p>
          <p>If you need support, we're here to help.</p>
        </div>
      </div>
    `;

    return sendEmail({
      to: timer.email,
      subject: `🎉 Timer Commitment Complete - ${timer.device_name}`,
      html: emailContent
    });
  }

  /**
   * Send expiration warning email
   */
  async sendExpirationWarningEmail(timer) {
    const hoursRemaining = Math.ceil((new Date(timer.commitment_end) - new Date()) / (1000 * 60 * 60));
    
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
          <p style="color: #6b7280; font-size: 16px;">Timer Commitment Update</p>
        </div>
        
        <div style="background: #fef3c7; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #f59e0b;">
          <h2 style="color: #374151; margin-bottom: 20px;">⏰ Almost There, ${timer.first_name}!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            Your ${timer.commitment_days}-day timer commitment for <strong>${timer.device_name}</strong> is almost complete!
          </p>
          
          <div style="background: #ffffff; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <h3 style="color: #f59e0b; margin-bottom: 10px; font-size: 24px;">${hoursRemaining} Hours Remaining</h3>
            <p style="color: #6b7280; margin: 0;">
              Expires: <strong>${new Date(timer.commitment_end).toLocaleDateString()} at ${new Date(timer.commitment_end).toLocaleTimeString()}</strong>
            </p>
          </div>
          
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 15px;">
            You're so close to completing this commitment! When the timer expires:
          </p>
          
          <ul style="color: #4b5563; line-height: 1.8; margin-bottom: 25px;">
            <li>🔓 Device restrictions will be automatically removed</li>
            <li>⚙️ You'll regain full control of your device settings</li>
            <li>📱 Profile removal restrictions will be lifted</li>
            <li>🔄 You can create new timer commitments</li>
          </ul>
        </div>
        
        <div style="background: #f0fdf4; padding: 25px; border-radius: 8px; margin-bottom: 30px;">
          <h3 style="color: #374151; margin-bottom: 15px;">💪 Stay Strong!</h3>
          <p style="color: #4b5563; line-height: 1.6; margin: 0;">
            You've made it this far - that's incredible! These final hours are just as important as the first. 
            Keep focusing on your recovery goals and remember why you started this journey.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL}/dashboard" 
             style="background-color: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
            View Timer Status
          </a>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>We're proud of your commitment to recovery!</p>
        </div>
      </div>
    `;

    return sendEmail({
      to: timer.email,
      subject: `⏰ Timer Expiring Soon - ${hoursRemaining} hours left`,
      html: emailContent
    });
  }

  /**
   * Manually process a specific timer (for emergency situations)
   */
  async processSpecificTimer(timerId) {
    try {
      const { rows } = await db.query(`
        SELECT tc.*, dp.device_name, u.email, u.first_name
        FROM timer_commitments tc
        JOIN device_profiles dp ON tc.device_id = dp.id
        JOIN users u ON tc.user_id = u.id
        WHERE tc.id = $1
      `, [timerId]);

      if (rows.length === 0) {
        throw new Error('Timer not found');
      }

      const timer = rows[0];

      // Remove Jamf restrictions
      if (timer.jamf_device_id && timer.jamf_profile_id) {
        await jamfService.removeProfile(timer.jamf_device_id, timer.jamf_profile_id);
      }

      // Update status
      await db.query(
        'UPDATE timer_commitments SET status = $1, updated_at = NOW() WHERE id = $2',
        ['manually_expired', timerId]
      );

      // Send notification
      await this.sendTimerCompletionEmail(timer);

      return { success: true, message: 'Timer processed successfully' };

    } catch (error) {
      console.error(`Error processing timer ${timerId}:`, error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStats() {
    try {
      const { rows } = await db.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(commitment_days) as avg_days
        FROM timer_commitments 
        GROUP BY status
      `);

      return {
        success: true,
        stats: rows,
        lastRun: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error getting cleanup stats:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TimerCleanupService();
   * Start the timer cleanup cron job
   * Runs every 5 minutes to check for expired timers
   */
  start() {
    console.log('Starting timer cleanup service...');
    
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        console.log('Timer cleanup already running, skipping...');
        return;
      }

      this.isRunning = true;
      try {
        await this.cleanupExpiredTimers();
        await this.sendExpirationWarnings();
      } catch (error) {
        console.error('Timer cleanup error:', error);
      } finally {
        this.isRunning = false;
      }
    });

    // Also run on startup
    setTimeout(() => this.cleanupExpiredTimers().catch(console.error), 5000);
  }

  /**
   * Clean up expired timer commitments
   */
  async cleanupExpiredTimers() {
    try {
      console.log('Checking for expired timer commitments...');

      // Find expired active timer commitments
      const { rows: expiredTimers } = await db.query(`
        SELECT tc.*, dp.device_name, u.email, u.first_name
        FROM timer_commitments tc
        JOIN device_profiles dp ON tc.device_id = dp.id
        JOIN users u ON tc.user_id = u.id
        WHERE tc.status = 'active' AND tc.commitment_end <= NOW()
      `);

      if (expiredTimers.length === 0) {
        console.log('No expired timers found');
        return;
      }

      console.log(`Found ${expiredTimers.length} expired timer commitments`);

      for (const timer of expiredTimers) {
        try {
          console.log(`Processing expired timer ${timer.id} for device ${timer.device_name}`);

          // Remove Jamf restriction profile if it exists
          if (timer.jamf_device_id && timer.jamf_profile_id) {
            try {
              await jamfService.removeProfile(timer.jamf_device_id, timer.jamf_profile_id);
              console.log(`Removed Jamf profile ${timer.jamf_profile_id} from device ${timer.jamf_device_id}`);
            } catch (jamfError) {
              console.error(`Failed to remove Jamf profile for timer ${timer.id}:`, jamfError.message);
              // Continue with database cleanup even if Jamf fails
            }
          }

          // Update timer status to expired
          await db.query(
            'UPDATE timer_commitments SET status = $1, updated_at = NOW() WHERE id = $2',
            ['expired', timer.id]
          );

          // Send completion email to user
          await this.sendTimerCompletionEmail(timer);

          console.log(`Successfully processed expired timer ${timer.id}`);

        } catch (timerError) {
          console.error(`Error processing timer ${timer.id}:`, timerError);
          
          // Mark as failed for manual review
          await db.query(
            'UPDATE timer_commitments SET status = $1, updated_at = NOW() WHERE id = $2',
            ['failed', timer.id]
          ).catch(console.error);
        }
      }

    } catch (error) {
      console.error('Error in cleanupExpiredTimers:', error);
    }
  }

  /**
   * Send warnings to users whose timers are about to expire
   */
  async sendExpirationWarnings() {
    try {
      console.log('Checking for timers needing expiration warnings...');

      // Find timers expiring in 24 hours that haven't been warned
      const { rows: soonToExpire } = await db.query(`
        SELECT tc.*, dp.device_name, u.email, u.first_name
        FROM timer_commitments tc
        JOIN device_profiles dp ON tc.device_id = dp.id
        JOIN users u ON tc.user_id = u.id
        WHERE tc.status = 'active' 
          AND tc.commitment_end BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
          AND tc.expiration_warning_sent = false
      `);

      if (soonToExpire.length === 0) {
        console.log('No timers need expiration warnings');
        return;
      }

      console.log(`Sending expiration warnings for ${soonToExpire.length} timers`);

      for (const timer of soonToExpire) {
        try {
          await this.sendExpirationWarningEmail(timer);
          
          // Mark warning as sent
          await db.query(
            'UPDATE timer_commitments SET expiration_warning_sent = true WHERE id = $1',
            [timer.id]
          );

          console.log(`Sent expiration warning for timer ${timer.id}`);

        } catch (warningError) {
          console.error(`Failed to send warning for timer ${timer.id}:`, warningError);
        }
      }

    } catch (error) {
      console.error('Error in sendExpirationWarnings:', error);
    }
  }

  /**