// routes/profiles.js (Enhanced version)
const express = require('express');
const { protect } = require('../middleware/auth');
const db = require('../db');
const crypto = require('crypto');
const jamfService = require('../services/jamfService');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// Your existing getBlocklist function here...
const getBlocklist = () => {
  return {
    adult: [
      'pornhub.com', 'www.pornhub.com', 'rt.pornhub.com', 'fr.pornhub.com',
      'xvideos.com', 'www.xvideos.com', 'xvideos2.com', 
      'xhamster.com', 'www.xhamster.com', 'xhamster.desi',
      'xnxx.com', 'www.xnxx.com', 'xnxx.tv',
      // ... rest of your blocklist
    ],
    dating: [
      'tinder.com', 'www.tinder.com', 'gotinder.com',
      'bumble.com', 'www.bumble.com', 'uk.bumble.com',
      // ... rest of dating sites
    ],
    // ... other categories
  };
};

/**
 * Enhanced profile generation with MDM enrollment
 */
function generateEnhancedProfile(device, user, timerCommitment = null) {
  const profileUUID = crypto.randomUUID().toUpperCase();
  const mdmPayloadUUID = crypto.randomUUID().toUpperCase();
  const contentFilterUUID = crypto.randomUUID().toUpperCase();
  
  // Build blocklist based on settings
  const blocklists = getBlocklist();
  let blockedDomains = [...blocklists.adult]; // Always block adult content
  
  if (device.block_dating) blockedDomains.push(...blocklists.dating);
  if (device.block_gambling) blockedDomains.push(...blocklists.gambling);
  if (device.block_social) blockedDomains.push(...blocklists.social);
  if (device.block_streaming) blockedDomains.push(...blocklists.streaming);
  if (device.block_gaming) blockedDomains.push(...blocklists.gaming);
  
  // Add custom blocked sites
  if (device.custom_blocked_sites) {
    const customSites = device.custom_blocked_sites
      .split(',')
      .map(site => site.trim())
      .filter(site => site.length > 0);
    blockedDomains.push(...customSites);
  }
  
  // Remove duplicates
  blockedDomains = [...new Set(blockedDomains)];

  const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <!-- Content Filter Payload -->
        <dict>
            <key>PayloadType</key>
            <string>com.apple.webcontent-filter</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.altriirecovery.filter.${device.id}</string>
            <key>PayloadUUID</key>
            <string>${contentFilterUUID}</string>
            <key>PayloadDisplayName</key>
            <string>Altrii Recovery Content Filter</string>
            <key>PayloadDescription</key>
            <string>Blocks inappropriate content to support your recovery journey</string>
            <key>PayloadOrganization</key>
            <string>Altrii Recovery</string>
            
            <key>AutoFilterEnabled</key>
            <true/>
            
            <key>WhitelistedBookmarks</key>
            <array>
                <dict>
                    <key>URL</key>
                    <string>https://altriirecovery.com</string>
                    <key>Title</key>
                    <string>Altrii Recovery</string>
                </dict>
            </array>
            
            <key>BlacklistedURLs</key>
            <array>
${blockedDomains.map(domain => `                <string>${domain}</string>`).join('\n')}
            </array>
            
            <key>FilterType</key>
            <string>BuiltIn</string>
            <key>FilterBrowsers</key>
            <true/>
            <key>FilterSockets</key>
            <true/>
        </dict>
        
        <!-- MDM Enrollment Payload -->
        <dict>
            <key>PayloadType</key>
            <string>com.apple.mdm</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.altriirecovery.mdm.${device.id}</string>
            <key>PayloadUUID</key>
            <string>${mdmPayloadUUID}</string>
            <key>PayloadDisplayName</key>
            <string>Altrii Recovery MDM</string>
            <key>PayloadDescription</key>
            <string>Mobile Device Management for timer commitments and factory reset protection</string>
            
            <!-- Jamf Now Server Configuration -->
            <key>ServerURL</key>
            <string>${process.env.JAMF_NOW_SERVER_URL || 'https://your-instance.jamfnow.com/mdm'}</string>
            <key>Topic</key>
            <string>${process.env.JAMF_NOW_PUSH_TOPIC || 'com.jamfnow.push'}</string>
            <key>ServerCapabilities</key>
            <array>
                <string>com.apple.mdm.per-user-connections</string>
            </array>
            
            <!-- Identity Configuration -->
            <key>IdentityCertificateUUID</key>
            <string>${crypto.randomUUID().toUpperCase()}</string>
            
            <!-- Full MDM Access Rights -->
            <key>AccessRights</key>
            <integer>8191</integer>
            
            <!-- Check-in Configuration -->
            <key>CheckInURL</key>
            <string>${process.env.JAMF_NOW_CHECKIN_URL || 'https://your-instance.jamfnow.com/checkin'}</string>
            <key>CheckOutWhenRemoved</key>
            <true/>
            
            <!-- Device Information -->
            <key>DeviceInformation</key>
            <dict>
                <key>DeviceName</key>
                <string>${device.device_name}</string>
                <key>UserID</key>
                <string>${user.id}</string>
                <key>UserEmail</key>
                <string>${user.email}</string>
            </dict>
            
            ${timerCommitment ? `
            <!-- Timer Commitment Information -->
            <key>TimerCommitment</key>
            <dict>
                <key>CommitmentID</key>
                <string>${timerCommitment.id}</string>
                <key>StartTime</key>
                <string>${timerCommitment.commitment_start}</string>
                <key>EndTime</key>
                <string>${timerCommitment.commitment_end}</string>
                <key>DurationDays</key>
                <integer>${timerCommitment.commitment_days}</integer>
                <key>SubscriptionTier</key>
                <string>${timerCommitment.subscription_tier}</string>
                <key>RestrictionsActive</key>
                <true/>
            </dict>` : ''}
        </dict>
    </array>
    
    <!-- Profile Metadata -->
    <key>PayloadDisplayName</key>
    <string>Altrii Recovery - ${device.device_name}${timerCommitment ? ' (Timer Active)' : ''}</string>
    <key>PayloadIdentifier</key>
    <string>com.altriirecovery.profile.${device.id}</string>
    <key>PayloadDescription</key>
    <string>Comprehensive recovery protection with content filtering${timerCommitment ? ', timer commitment, and factory reset prevention' : ' and device management'}</string>
    <key>PayloadOrganization</key>
    <string>Altrii Recovery</string>
    
    <!-- Profile Removal Settings -->
    <key>PayloadRemovalDisallowed</key>
    <${timerCommitment ? 'true' : 'false'}/>
    ${device.removal_password && !timerCommitment ? `
    <key>PayloadRemovalPassword</key>
    <string>${device.removal_password}</string>` : ''}
    
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUUID}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    
    <!-- User Consent -->
    <key>ConsentText</key>
    <dict>
        <key>default</key>
        <string>This profile provides comprehensive digital wellness protection including:

• Content filtering (${blockedDomains.length} sites blocked)
• Mobile Device Management enrollment
${timerCommitment ? `• ${timerCommitment.commitment_days}-day timer commitment (expires ${new Date(timerCommitment.commitment_end).toLocaleDateString()})
• Factory reset prevention during commitment` : '• Enhanced security features'}

${timerCommitment ? 'Profile removal is disabled until your timer commitment expires.' : 'You can manage this profile in Settings > General > VPN & Device Management.'}

By proceeding, you consent to device management for your recovery journey.</string>
    </dict>
    
    <!-- Tracking Metadata -->
    <key>CreationMetadata</key>
    <dict>
        <key>UserID</key>
        <string>${user.id}</string>
        <key>DeviceID</key>
        <string>${device.id}</string>
        <key>CreatedAt</key>
        <string>${new Date().toISOString()}</string>
        <key>ProfileVersion</key>
        <string>2.0-mdm</string>
        ${timerCommitment ? `
        <key>TimerCommitmentID</key>
        <string>${timerCommitment.id}</string>` : ''}
    </dict>
</dict>
</plist>`;

  return profile;
}

/**
 * Get iOS profile with enhanced MDM support
 * GET /api/profiles/ios/:deviceId
 */
router.get('/ios/:deviceId', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { action } = req.query; // 'download' or 'email'

    // Get device with settings
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

    // Check for active timer commitment
    const { rows: timerRows } = await db.query(
      `SELECT * FROM timer_commitments 
       WHERE device_id = $1 AND status = 'active' AND commitment_end > NOW()`,
      [deviceId]
    );

    const device = deviceRows[0];
    const activeTimer = timerRows[0] || null;
    
    // Generate enhanced profile with MDM enrollment
    const profile = generateEnhancedProfile(device, req.user, activeTimer);
    
    // If device isn't enrolled in Jamf yet, create enrollment invitation
    if (!device.jamf_device_id) {
      try {
        const invitationResult = await jamfService.createDeviceInvitation(
          device.device_name,
          req.user.email
        );

        if (invitationResult.success) {
          // Update device with Jamf invitation info
          await db.query(
            `UPDATE device_profiles 
             SET jamf_invitation_id = $1, jamf_enrollment_url = $2
             WHERE id = $3`,
            [invitationResult.invitationId, invitationResult.enrollmentUrl, deviceId]
          );
        }
      } catch (jamfError) {
        console.error('Jamf invitation error:', jamfError);
        // Continue with profile generation even if Jamf fails
      }
    }
    
    // Log profile generation
    await db.query(
      `INSERT INTO profile_downloads (user_id, device_id, download_method, has_timer_commitment)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, deviceId, action || 'direct', activeTimer !== null]
    );
    
    if (action === 'email') {
      // Enhanced email with MDM information
      const emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
            <p style="color: #6b7280; font-size: 16px;">Enhanced Protection Profile Ready</p>
          </div>
          
          <div style="background: #f0f9ff; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #06b6d4;">
            <h2 style="color: #374151; margin-bottom: 20px;">Your Enhanced Profile is Ready! 🛡️</h2>
            <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
              Hi ${req.user.first_name}, your advanced protection profile for <strong>${device.device_name}</strong> includes:
            </p>
            
            <ul style="color: #4b5563; line-height: 1.8; margin-bottom: 25px;">
              <li>✅ Content filtrativen (${profile.match(/<string>/g).length - 5} sites blocked)</li>
              <li>🔐 Mobile Device Management enrollment</li>
              ${activeTimer ? `<li>⏰ ${activeTimer.commitment_days}-day timer commitment (until ${new Date(activeTimer.commitment_end).toLocaleDateString()})</li>` : ''}
              <li>🚫 Factory reset protection${activeTimer ? ' (active during commitment)' : ''}</li>
              <li>📱 Device supervision and compliance monitoring</li>
            </ul>
            
            ${activeTimer ? `
            <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <h4 style="color: #92400e; margin: 0 0 10px 0;">⚠️ Timer Commitment Active</h4>
              <p style="color: #92400e; margin: 0; font-size: 14px;">
                This profile cannot be removed until ${new Date(activeTimer.commitment_end).toLocaleDateString()} at ${new Date(activeTimer.commitment_end).toLocaleTimeString()}. 
                Factory reset prevention is enabled for your protection.
              </p>
            </div>` : ''}
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
            <h3 style="color: #374151; margin-bottom: 20px;">📱 Installation Instructions</h3>
            <ol style="color: #4b5563; line-height: 1.8;">
              <li><strong>Open this email on your iOS device</strong></li>
              <li>Tap the attached .mobileconfig file</li>
              <li>Tap "Allow" when prompted to download</li>
              <li>Go to Settings > General > VPN & Device Management</li>
              <li>Tap "Altrii Recovery" profile</li>
              <li>Tap "Install" and enter your device passcode</li>
              <li><strong>Tap "Install" again when prompted about management</strong></li>
              <li>Complete the installation process</li>
            </ol>
            
            <div style="background: #fef2f2; padding: 15px; border-radius: 6px; margin-top: 20px;">
              <p style="color: #dc2626; margin: 0; font-size: 14px;">
                <strong>Important:</strong> This profile includes device management capabilities. 
                You'll see additional prompts about allowing Altrii Recovery to manage your device - 
                this is required for timer commitments and factory reset protection.
              </p>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <p style="color: #6b7280; font-size: 14px;">
              Need help? Reply to this email or visit our support center.<br>
              <strong>Stay strong on your recovery journey!</strong>
            </p>
          </div>
        </div>
      `;

      await sendEmail({
        to: req.user.email,
        subject: `Altrii Recovery Profile - ${device.device_name}${activeTimer ? ' (Timer Active)' : ''}`,
        html: emailContent,
        attachments: [{
          filename: `altrii-${device.device_name}-enhanced.mobileconfig`,
          content: profile,
          contentType: 'application/x-apple-asconfig'
        }]
      });
      
      return res.json({
        success: true,
        message: `Enhanced profile sent to ${req.user.email}`,
        features: {
          contentFilter: true,
          mdmEnrollment: true,
          timerCommitment: activeTimer !== null,
          factoryResetProtection: activeTimer !== null
        }
      });
    }
    
    // Direct download
    res.setHeader('Content-Type', 'application/x-apple-asconfig');
    res.setHeader('Content-Disposition', 
      `attachment; filename="altrii-${device.device_name}-enhanced.mobileconfig"`);
    res.send(profile);

  } catch (error) {
    console.error('Enhanced profile generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating enhanced profile'
    });
  }
});

// Keep your existing /status/:deviceId route but enhance it
router.get('/status/:deviceId', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const { rows } = await db.query(
      `SELECT 
        dp.*,
        bs.*,
        tc.id as timer_id,
        tc.commitment_end,
        tc.status as timer_status,
        (SELECT COUNT(*) FROM profile_downloads 
         WHERE device_id = dp.id) as download_count,
        (SELECT MAX(created_at) FROM profile_downloads 
         WHERE device_id = dp.id) as last_downloaded
       FROM device_profiles dp
       LEFT JOIN blocking_settings bs ON dp.id = bs.device_id
       LEFT JOIN timer_commitments tc ON dp.id = tc.device_id AND tc.status = 'active'
       WHERE dp.id = $1 AND dp.user_id = $2`,
      [deviceId, req.user.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Device not found'
      });
    }
    
    const device = rows[0];
    const blocklists = getBlocklist();
    
    // Calculate blocked domains count
    let blockedCount = blocklists.adult.length;
    if (device.block_dating) blockedCount += blocklists.dating.length;
    if (device.block_gambling) blockedCount += blocklists.gambling.length;
    if (device.block_social) blockedCount += blocklists.social.length;
    if (device.block_streaming) blockedCount += blocklists.streaming.length;
    if (device.block_gaming) blockedCount += blocklists.gaming.length;
    
    // Get Jamf status if enrolled
    let jamfStatus = null;
    if (device.jamf_device_id) {
      const statusResult = await jamfService.getDeviceStatus(device.jamf_device_id);
      if (statusResult.success) {
        jamfStatus = statusResult;
      }
    }
    
    res.json({
      success: true,
      device: {
        ...device,
        blocked_domains_count: blockedCount,
        profile_downloaded: device.download_count > 0,
        has_active_timer: device.timer_id !== null,
        timer_expires: device.commitment_end,
        mdm_enrolled: device.jamf_device_id !== null,
        mdm_status: jamfStatus,
        enhanced_protection: {
          contentFilter: true,
          mdmManagement: device.jamf_device_id !== null,
          timerCommitment: device.timer_id !== null,
          factoryResetProtection: device.timer_id !== null
        }
      }
    });
    
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Error fetching device status'
    });
  }
});

module.exports = router;
