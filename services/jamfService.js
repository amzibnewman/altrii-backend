// services/jamfService.js - Updated for Enrollment URL approach
const crypto = require('crypto');

class JamfNowService {
  constructor() {
    this.enrollmentUrl = process.env.JAMF_NOW_ENROLLMENT_URL;
    this.orgName = process.env.JAMF_NOW_ORG_NAME || 'Altrii Recovery';
  }

  /**
   * Get enrollment URL for device setup
   */
  getEnrollmentUrl() {
    return this.enrollmentUrl;
  }

  /**
   * Generate enrollment instructions for users
   */
  generateEnrollmentInstructions(deviceName, userEmail) {
    return {
      success: true,
      enrollmentUrl: this.enrollmentUrl,
      instructions: [
        `Open Safari on your ${deviceName}`,
        `Go to: ${this.enrollmentUrl}`,
        'Tap "Allow" to download the enrollment profile',
        'Go to Settings > General > VPN & Device Management',
        `Tap "${this.orgName}" profile`,
        'Tap "Install" and enter your device passcode',
        'Complete the enrollment process'
      ],
      deviceName,
      userEmail
    };
  }

  /**
   * Enhanced profile generation with MDM enrollment
   */
  generateEnhancedProfile(device, user, timerCommitment = null) {
    const profileUUID = crypto.randomUUID().toUpperCase();
    const mdmPayloadUUID = crypto.randomUUID().toUpperCase();
    const contentFilterUUID = crypto.randomUUID().toUpperCase();
    
    // Build blocklist based on settings (use your existing logic)
    const blockedDomains = this.buildBlockedDomains(device);

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
                <dict>
                    <key>URL</key>
                    <string>${this.enrollmentUrl}</string>
                    <key>Title</key>
                    <string>Device Enrollment</string>
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
    </array>
    
    <!-- Profile Metadata -->
    <key>PayloadDisplayName</key>
    <string>Altrii Recovery - ${device.device_name}${timerCommitment ? ' (Timer Active)' : ''}</string>
    <key>PayloadIdentifier</key>
    <string>com.altriirecovery.profile.${device.id}</string>
    <key>PayloadDescription</key>
    <string>Recovery protection with content filtering${timerCommitment ? ' and timer commitment' : ''}</string>
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
        <string>This profile provides digital wellness protection including:

• Content filtering (${blockedDomains.length} sites blocked)
${timerCommitment ? `• ${timerCommitment.commitment_days}-day timer commitment (expires ${new Date(timerCommitment.commitment_end).toLocaleDateString()})` : '• Enhanced recovery support'}

${timerCommitment ? 'Profile removal is disabled until your timer commitment expires.' : 'You can manage this profile in Settings > General > VPN & Device Management.'}

For maximum protection, also enroll in device management at: ${this.enrollmentUrl}

By proceeding, you consent to content filtering for your recovery journey.</string>
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
        <string>2.0-jamf-enrollment</string>
        <key>EnrollmentURL</key>
        <string>${this.enrollmentUrl}</string>
        ${timerCommitment ? `
        <key>TimerCommitmentID</key>
        <string>${timerCommitment.id}</string>` : ''}
    </dict>
</dict>
</plist>`;

    return profile;
  }

  /**
   * Build blocked domains list (use your existing logic)
   */
  buildBlockedDomains(device) {
    // This should use your existing blocklist logic from profiles.js
    const blocklists = {
      adult: [
        'pornhub.com', 'www.pornhub.com', 'rt.pornhub.com', 'fr.pornhub.com',
        'xvideos.com', 'www.xvideos.com', 'xvideos2.com', 
        'xhamster.com', 'www.xhamster.com', 'xhamster.desi',
        'xnxx.com', 'www.xnxx.com', 'xnxx.tv',
        'youporn.com', 'www.youporn.com',
        'redtube.com', 'www.redtube.com',
        'spankbang.com', 'www.spankbang.com',
        // Add your full adult content list here
      ],
      dating: [
        'tinder.com', 'www.tinder.com', 'gotinder.com',
        'bumble.com', 'www.bumble.com', 'uk.bumble.com',
        'hinge.co', 'www.hinge.co',
        // Add your full dating list here
      ],
      gambling: [
        'bet365.com', 'www.bet365.com', 'mobile.bet365.com',
        'williamhill.com', 'www.williamhill.com',
        // Add your full gambling list here
      ],
      social: [
        'facebook.com', 'www.facebook.com', 'm.facebook.com',
        'instagram.com', 'www.instagram.com',
        'twitter.com', 'www.twitter.com', 'x.com',
        // Add your full social list here
      ],
      streaming: [
        'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be',
        'netflix.com', 'www.netflix.com',
        'twitch.tv', 'www.twitch.tv',
        // Add your full streaming list here
      ],
      gaming: [
        'steam.com', 'store.steampowered.com', 'steamcommunity.com',
        'epicgames.com', 'www.epicgames.com',
        // Add your full gaming list here
      ]
    };

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
    return [...new Set(blockedDomains)];
  }

  /**
   * Simplified device status (since we can't query Jamf API)
   */
  async getDeviceStatus(deviceId) {
    return {
      success: true,
      message: 'Device status checking requires manual verification in Jamf Now dashboard',
      enrollmentUrl: this.enrollmentUrl,
      requiresManualCheck: true
    };
  }

  /**
   * Manual device enrollment instructions
   */
  getManualEnrollmentInstructions() {
    return {
      step1: 'User installs content filter profile from your app',
      step2: `User visits ${this.enrollmentUrl} to enroll in MDM`,
      step3: 'User completes MDM enrollment on their device',
      step4: 'Admin manually applies restriction profiles in Jamf Now dashboard',
      step5: 'Timer commitment becomes truly "unhackable"'
    };
  }

  // Mock functions for compatibility (since we can't use API)
  async createDeviceInvitation(deviceName, userEmail) {
    return this.generateEnrollmentInstructions(deviceName, userEmail);
  }

  async createRestrictionProfile(deviceId, timerCommitment) {
    return {
      success: false,
      message: 'Restriction profiles must be created manually in Jamf Now dashboard',
      instructions: [
        'Log into your Jamf Now dashboard',
        'Go to Blueprints section',
        'Create a new restriction blueprint',
        'Apply restrictions for timer commitment',
        'Deploy to enrolled devices'
      ]
    };
  }

  async removeProfile(deviceId, profileId) {
    return {
      success: false,
      message: 'Profile removal must be done manually in Jamf Now dashboard'
    };
  }

  async getDevice(jamfDeviceId) {
    return {
      success: false,
      message: 'Device information must be checked manually in Jamf Now dashboard'
    };
  }
}

module.exports = new JamfNowService();
