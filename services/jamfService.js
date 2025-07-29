// services/jamfService.js
const axios = require('axios');
const crypto = require('crypto');

class JamfNowService {
  constructor() {
    this.baseURL = process.env.JAMF_NOW_BASE_URL || 'https://api.jamfnow.com/v1';
    this.apiKey = process.env.JAMF_NOW_API_KEY;
    this.organizationId = process.env.JAMF_NOW_ORG_ID;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Create a device enrollment invitation
   */
  async createDeviceInvitation(deviceName, userEmail) {
    try {
      const response = await this.client.post('/device-invitations', {
        name: deviceName,
        email: userEmail,
        organization_id: this.organizationId
      });
      
      return {
        success: true,
        invitationId: response.data.id,
        enrollmentUrl: response.data.enrollment_url,
        invitationCode: response.data.invitation_code
      };
    } catch (error) {
      console.error('Jamf enrollment error:', error.response?.data || error.message);
      throw new Error('Failed to create device enrollment');
    }
  }

  /**
   * Get device information from Jamf
   */
  async getDevice(jamfDeviceId) {
    try {
      const response = await this.client.get(`/devices/${jamfDeviceId}`);
      return {
        success: true,
        device: response.data
      };
    } catch (error) {
      console.error('Jamf get device error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create restriction profile for timer commitment
   */
  async createRestrictionProfile(deviceId, timerCommitment) {
    const profileName = `Altrii Timer Lock - ${timerCommitment.commitment_days} days`;
    
    const restrictionPayload = {
      name: profileName,
      description: `Timer commitment restricting device modifications until ${timerCommitment.commitment_end}`,
      payloads: [
        {
          type: 'com.apple.applicationaccess',
          settings: {
            // Prevent profile removal
            allowUIAppInstallation: false,
            allowUIConfigurationProfileInstallation: false,
            
            // Prevent factory reset
            allowErase: false,
            allowRemoveApps: false,
            
            // Lock system settings
            allowSystemAppRemoval: false,
            allowAppInstallation: false,
            allowAppRemoval: false,
            
            // Prevent bypassing restrictions
            allowAccountModification: false,
            allowPassbookWhileDeviceLocked: false,
            allowAssistant: false,
            allowAssistantWhileDeviceLocked: false,
            allowDiagnosticSubmission: false,
            allowVoiceDialing: false,
            allowScreenShot: false,
            allowVideoConferencing: false,
            allowPasscodeModification: false,
            allowLockScreenControlCenter: false,
            allowLockScreenNotificationsView: false,
            allowLockScreenTodayView: false,
            allowFingerprintForUnlock: true, // Allow for usability
            allowAutoUnlock: false,
            allowCloudBackup: false,
            allowCloudDocumentSync: false,
            allowCloudKeychainSync: false,
            allowCloudPhotoLibrary: false,
            allowSpotlightInternetResults: false,
            allowDefinitionLookup: false,
            allowPredictiveKeyboard: false,
            allowAutoCorrection: true, // Keep for usability
            allowSpellCheck: true, // Keep for usability
            
            // Additional security restrictions
            allowAirDrop: false,
            allowiTunes: false,
            allowNews: false,
            allowPodcasts: false,
            allowRadioService: false,
            allowMusicService: false,
            allowBookstore: false,
            allowiBookstore: false,
            allowGameCenter: false,
            
            // Prevent MDM removal
            allowHostPairing: false,
            allowLockScreenPasscodeModification: false,
            allowDeviceNameModification: false,
            allowWallpaperModification: false
          }
        },
        {
          type: 'com.apple.restrictions.managed',
          settings: {
            // Additional restrictions specific to timer commitment
            restrictionsEnforcedUserName: 'Altrii Recovery Timer',
            forceEncryptedBackup: true,
            allowCloudBackup: false,
            allowUIConfigurationProfileInstallation: false
          }
        }
      ],
      scope: {
        devices: [deviceId]
      }
    };

    try {
      const response = await this.client.post('/profiles', restrictionPayload);
      return {
        success: true,
        profileId: response.data.id,
        profileUuid: response.data.uuid
      };
    } catch (error) {
      console.error('Jamf create profile error:', error.response?.data || error.message);
      throw new Error('Failed to create restriction profile');
    }
  }

  /**
   * Deploy profile to device
   */
  async deployProfile(deviceId, profileId) {
    try {
      const response = await this.client.post(`/devices/${deviceId}/profiles`, {
        profile_id: profileId
      });
      
      return {
        success: true,
        deploymentId: response.data.id
      };
    } catch (error) {
      console.error('Jamf deploy profile error:', error.response?.data || error.message);
      throw new Error('Failed to deploy restriction profile');
    }
  }

  /**
   * Remove restriction profile when timer expires
   */
  async removeProfile(deviceId, profileId) {
    try {
      await this.client.delete(`/devices/${deviceId}/profiles/${profileId}`);
      return { success: true };
    } catch (error) {
      console.error('Jamf remove profile error:', error.response?.data || error.message);
      throw new Error('Failed to remove restriction profile');
    }
  }

  /**
   * Send remote command to device
   */
  async sendCommand(deviceId, command, parameters = {}) {
    try {
      const response = await this.client.post(`/devices/${deviceId}/commands`, {
        command: command,
        parameters: parameters
      });
      
      return {
        success: true,
        commandId: response.data.id
      };
    } catch (error) {
      console.error('Jamf send command error:', error.response?.data || error.message);
      throw new Error(`Failed to send ${command} command`);
    }
  }

  /**
   * Lock device (emergency function)
   */
  async lockDevice(deviceId, message = 'Device locked due to timer commitment violation') {
    return this.sendCommand(deviceId, 'DeviceLock', {
      message: message,
      phone_number: process.env.SUPPORT_PHONE || '+44 20 1234 5678'
    });
  }

  /**
   * Wipe device (extreme emergency function)
   */
  async wipeDevice(deviceId) {
    return this.sendCommand(deviceId, 'EraseDevice', {
      preserve_data_plan: true,
      disallow_proximity_setup: true
    });
  }

  /**
   * Get device status and compliance
   */
  async getDeviceStatus(deviceId) {
    try {
      const [deviceInfo, profiles, commands] = await Promise.all([
        this.client.get(`/devices/${deviceId}`),
        this.client.get(`/devices/${deviceId}/profiles`),
        this.client.get(`/devices/${deviceId}/commands?limit=10`)
      ]);

      return {
        success: true,
        device: deviceInfo.data,
        profiles: profiles.data,
        recentCommands: commands.data,
        isOnline: deviceInfo.data.last_seen_at > Date.now() - (15 * 60 * 1000), // 15 min
        isCompliant: profiles.data.every(p => p.status === 'installed')
      };
    } catch (error) {
      console.error('Jamf get device status error:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Enhanced profile generation with MDM enrollment
   */
  generateEnhancedProfile(device, user, timerCommitment = null) {
    const profileUUID = crypto.randomUUID().toUpperCase();
    const mdmPayloadUUID = crypto.randomUUID().toUpperCase();
    const contentFilterUUID = crypto.randomUUID().toUpperCase();
    
    // Your existing content filter logic here
    const contentFilterPayload = this.generateContentFilterPayload(device);
    
    // MDM enrollment payload
    const mdmEnrollmentPayload = `
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
            <string>Mobile Device Management for timer commitments and unhackable protection</string>
            
            <!-- MDM Server Configuration -->
            <key>ServerURL</key>
            <string>${process.env.JAMF_NOW_SERVER_URL}</string>
            <key>Topic</key>
            <string>${process.env.JAMF_NOW_PUSH_TOPIC}</string>
            <key>ServerCapabilities</key>
            <array>
                <string>com.apple.mdm.per-user-connections</string>
            </array>
            
            <!-- Identity Certificate -->
            <key>IdentityCertificateUUID</key>
            <string>${crypto.randomUUID().toUpperCase()}</string>
            
            <!-- Access Rights -->
            <key>AccessRights</key>
            <integer>8191</integer> <!-- Full MDM rights -->
            
            <!-- Check-in URL -->
            <key>CheckInURL</key>
            <string>${process.env.JAMF_NOW_CHECKIN_URL}</string>
            
            <!-- Additional settings for timer commitment support -->
            ${timerCommitment ? `
            <key>TimerCommitment</key>
            <dict>
                <key>CommitmentID</key>
                <string>${timerCommitment.id}</string>
                <key>EndTime</key>
                <string>${timerCommitment.commitment_end}</string>
                <key>RestrictionsActive</key>
                <true/>
            </dict>` : ''}
        </dict>`;

    const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        ${contentFilterPayload}
        ${mdmEnrollmentPayload}
    </array>
    
    <!-- Profile metadata -->
    <key>PayloadDisplayName</key>
    <string>Altrii Recovery - ${device.device_name}${timerCommitment ? ' (Timer Active)' : ''}</string>
    <key>PayloadIdentifier</key>
    <string>com.altriirecovery.profile.${device.id}</string>
    <key>PayloadDescription</key>
    <string>Recovery protection with${timerCommitment ? ' timer commitment and' : ''} unhackable enforcement</string>
    <key>PayloadOrganization</key>
    <string>Altrii Recovery</string>
    <key>PayloadRemovalDisallowed</key>
    <${timerCommitment ? 'true' : 'false'}/>
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
        <string>This profile enables comprehensive recovery protection${timerCommitment ? ` with a ${timerCommitment.commitment_days}-day timer commitment` : ''}. Profile removal ${timerCommitment ? 'is disabled until your commitment expires' : 'requires administrator privileges'}.</string>
    </dict>
</dict>
</plist>`;

    return profile;
  }

  generateContentFilterPayload(device) {
    // Use your existing content filter logic from profiles.js
    // This is a simplified version - use your actual implementation
    return `
        <dict>
            <key>PayloadType</key>
            <string>com.apple.webcontent-filter</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>PayloadIdentifier</key>
            <string>com.altriirecovery.filter.${device.id}</string>
            <key>PayloadUUID</key>
            <string>${crypto.randomUUID().toUpperCase()}</string>
            <key>PayloadDisplayName</key>
            <string>Altrii Recovery Content Filter</string>
            
            <!-- Your existing content filter settings -->
            <key>AutoFilterEnabled</key>
            <true/>
            <key>FilterType</key>
            <string>BuiltIn</string>
            <key>FilterBrowsers</key>
            <true/>
            <key>FilterSockets</key>
            <true/>
        </dict>`;
  }
}

module.exports = new JamfNowService();