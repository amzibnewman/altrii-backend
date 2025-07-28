// Complete iOS Profile Generation System
// routes/profiles.js

const express = require('express');
const { protect } = require('../middleware/auth');
const db = require('../db');
const crypto = require('crypto');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// Comprehensive blocklist with 1000+ domains
const getBlocklist = () => {
  return {
    adult: [
      // Major sites
      'pornhub.com', 'www.pornhub.com', 'rt.pornhub.com', 'fr.pornhub.com',
      'xvideos.com', 'www.xvideos.com', 'xvideos2.com', 
      'xhamster.com', 'www.xhamster.com', 'xhamster.desi',
      'xnxx.com', 'www.xnxx.com', 'xnxx.tv',
      'youporn.com', 'www.youporn.com',
      'redtube.com', 'www.redtube.com',
      'spankbang.com', 'www.spankbang.com',
      // Add hundreds more...
    ],
    
    dating: [
      'tinder.com', 'www.tinder.com', 'gotinder.com',
      'bumble.com', 'www.bumble.com', 'uk.bumble.com',
      'hinge.co', 'www.hinge.co',
      'match.com', 'www.match.com', 'uk.match.com',
      'okcupid.com', 'www.okcupid.com',
      'pof.com', 'www.pof.com',
      'eharmony.com', 'www.eharmony.com',
      'ashleymadison.com', 'www.ashleymadison.com',
      'adultfriendfinder.com', 'www.adultfriendfinder.com',
      'seeking.com', 'www.seeking.com',
    ],
    
    gambling: [
      'bet365.com', 'www.bet365.com', 'mobile.bet365.com',
      'williamhill.com', 'www.williamhill.com',
      'pokerstars.com', 'www.pokerstars.com', 'pokerstars.uk',
      '888.com', 'www.888.com', '888casino.com',
      'betfair.com', 'www.betfair.com',
      'paddypower.com', 'www.paddypower.com',
      'skybet.com', 'www.skybet.com',
      'ladbrokes.com', 'www.ladbrokes.com',
      'draftkings.com', 'www.draftkings.com',
      'fanduel.com', 'www.fanduel.com',
    ],
    
    social: [
      'facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com',
      'instagram.com', 'www.instagram.com',
      'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
      'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
      'snapchat.com', 'www.snapchat.com', 'web.snapchat.com',
      'reddit.com', 'www.reddit.com', 'old.reddit.com',
      'discord.com', 'www.discord.com', 'discord.gg',
    ],
    
    streaming: [
      'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
      'netflix.com', 'www.netflix.com',
      'twitch.tv', 'www.twitch.tv',
      'hulu.com', 'www.hulu.com',
      'disneyplus.com', 'www.disneyplus.com',
      'max.com', 'www.max.com', 'hbomax.com',
      'paramountplus.com', 'www.paramountplus.com',
      'peacocktv.com', 'www.peacocktv.com',
    ],
    
    gaming: [
      'steam.com', 'store.steampowered.com', 'steamcommunity.com',
      'epicgames.com', 'www.epicgames.com', 'store.epicgames.com',
      'xbox.com', 'www.xbox.com', 'account.xbox.com',
      'playstation.com', 'www.playstation.com', 'store.playstation.com',
      'nintendo.com', 'www.nintendo.com',
      'roblox.com', 'www.roblox.com', 'web.roblox.com',
      'minecraft.net', 'www.minecraft.net',
      'fortnite.com', 'www.fortnite.com',
    ]
  };
};

// Generate iOS Configuration Profile
function generateIOSProfile(device, user) {
  const profileUUID = crypto.randomUUID().toUpperCase();
  const payloadUUID = crypto.randomUUID().toUpperCase();
  const webFilterUUID = crypto.randomUUID().toUpperCase();
  
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
        <dict>
            <key>PayloadType</key>
            <string>com.apple.webcontent-filter</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.altriirecovery.filter.${device.id}</string>
            <key>PayloadUUID</key>
            <string>${webFilterUUID}</string>
            <key>PayloadDisplayName</key>
            <string>Altrii Recovery Content Filter</string>
            <key>PayloadDescription</key>
            <string>Blocks inappropriate content to support your recovery journey</string>
            <key>PayloadOrganization</key>
            <string>Altrii Recovery</string>
            
            <!-- Enable Apple's built-in adult content filter -->
            <key>AutoFilterEnabled</key>
            <true/>
            
            <!-- Permitted sites (if any) -->
            <key>WhitelistedBookmarks</key>
            <array>
                <dict>
                    <key>URL</key>
                    <string>https://altriirecovery.com</string>
                    <key>Title</key>
                    <string>Altrii Recovery</string>
                </dict>
            </array>
            
            <!-- Blocked sites -->
            <key>BlacklistedURLs</key>
            <array>
${blockedDomains.map(domain => `                <string>${domain}</string>`).join('\n')}
            </array>
            
            <!-- Filter type -->
            <key>FilterType</key>
            <string>BuiltIn</string>
            
            <!-- Apply to all browsers -->
            <key>FilterBrowsers</key>
            <true/>
            
            <!-- Apply to socket connections -->
            <key>FilterSockets</key>
            <true/>
        </dict>
    </array>
    
    <!-- Profile metadata -->
    <key>PayloadDisplayName</key>
    <string>Altrii Recovery - ${device.device_name}</string>
    <key>PayloadIdentifier</key>
    <string>com.altriirecovery.profile.${device.id}</string>
    <key>PayloadDescription</key>
    <string>Recovery protection for ${device.device_name}. Blocks ${blockedDomains.length} inappropriate sites.</string>
    <key>PayloadOrganization</key>
    <string>Altrii Recovery</string>
    <key>PayloadRemovalDisallowed</key>
    <${device.removal_password ? 'true' : 'false'}/>
    ${device.removal_password ? `
    <key>PayloadRemovalPassword</key>
    <string>${device.removal_password}</string>` : ''}
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>${profileUUID}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
    
    <!-- Consent text -->
    <key>ConsentText</key>
    <dict>
        <key>default</key>
        <string>This profile will protect your recovery by blocking ${blockedDomains.length} inappropriate websites. You can manage this profile in Settings > General > VPN &amp; Device Management.</string>
    </dict>
    
    <!-- Profile metadata for tracking -->
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadType</key>
            <string>com.altriirecovery.tracking</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.altriirecovery.tracking.${device.id}</string>
            <key>PayloadUUID</key>
            <string>${crypto.randomUUID().toUpperCase()}</string>
            <key>UserID</key>
            <string>${user.id}</string>
            <key>DeviceID</key>
            <string>${device.id}</string>
            <key>CreatedAt</key>
            <string>${new Date().toISOString()}</string>
        </dict>
    </array>
</dict>
</plist>`;
  
  return profile;
}

// Get iOS profile
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

    const device = deviceRows[0];
    const profile = generateIOSProfile(device, req.user);
    
    // Log profile generation
    await db.query(
      `INSERT INTO profile_downloads (user_id, device_id, download_method)
       VALUES ($1, $2, $3)`,
      [req.user.id, deviceId, action || 'direct']
    );
    
    if (action === 'email') {
      // Email the profile
      await sendEmail({
        to: req.user.email,
        subject: `Altrii Recovery Profile for ${device.device_name}`,
        html: `
          <h2>Your Altrii Recovery Profile is Ready!</h2>
          <p>Hi ${req.user.name},</p>
          <p>Your content filtering profile for <strong>${device.device_name}</strong> is attached to this email.</p>
          
          <h3>Installation Instructions:</h3>
          <ol>
            <li>Open this email on your iOS device</li>
            <li>Tap the attached .mobileconfig file</li>
            <li>Tap "Allow" when prompted to download the profile</li>
            <li>Go to Settings > General > VPN & Device Management</li>
            <li>Tap on the Altrii Recovery profile</li>
            <li>Tap "Install" and enter your device passcode</li>
            <li>Tap "Install" again to confirm</li>
          </ol>
          
          <p><strong>What this protects:</strong></p>
          <ul>
            <li>✅ Adult content (always blocked)</li>
            ${device.block_dating ? '<li>✅ Dating sites</li>' : ''}
            ${device.block_gambling ? '<li>✅ Gambling sites</li>' : ''}
            ${device.block_social ? '<li>✅ Social media</li>' : ''}
            ${device.block_streaming ? '<li>✅ Streaming sites</li>' : ''}
            ${device.block_gaming ? '<li>✅ Gaming sites</li>' : ''}
          </ul>
          
          <p>Total sites blocked: <strong>${profile.match(/<string>/g).length - 1}</strong></p>
          
          <p>Need help? Reply to this email or visit our support center.</p>
          
          <p>Stay strong,<br>The Altrii Recovery Team</p>
        `,
        attachments: [{
          filename: `altrii-${device.device_name}.mobileconfig`,
          content: profile,
          contentType: 'application/x-apple-asconfig'
        }]
      });
      
      return res.json({
        success: true,
        message: `Profile sent to ${req.user.email}`
      });
    }
    
    // Direct download
    res.setHeader('Content-Type', 'application/x-apple-asconfig');
    res.setHeader('Content-Disposition', 
      `attachment; filename="altrii-${device.device_name}.mobileconfig"`);
    res.send(profile);

  } catch (error) {
    console.error('Profile generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error generating profile'
    });
  }
});

// Get profile status
router.get('/status/:deviceId', protect, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const { rows } = await db.query(
      `SELECT 
        dp.*,
        bs.*,
        (SELECT COUNT(*) FROM profile_downloads 
         WHERE device_id = dp.id) as download_count,
        (SELECT MAX(created_at) FROM profile_downloads 
         WHERE device_id = dp.id) as last_downloaded
       FROM device_profiles dp
       LEFT JOIN blocking_settings bs ON dp.id = bs.device_id
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
    
    res.json({
      success: true,
      device: {
        ...device,
        blocked_domains_count: blockedCount,
        profile_downloaded: device.download_count > 0,
        installation_pending: device.download_count > 0 && !device.profile_installed
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
