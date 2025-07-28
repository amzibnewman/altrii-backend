const nodemailer = require('nodemailer');

// Create transporter with correct environment variable names
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Send verification email
const sendVerificationEmail = async (email, token) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${token}`;
  
  const mailOptions = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Verify Your Altrii Recovery Account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
          <p style="color: #6b7280; font-size: 16px;">Digital Wellness Protection</p>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="color: #374151; margin-bottom: 20px;">Welcome to Altrii Recovery!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            Thank you for signing up. To get started with your digital wellness journey, 
            please verify your email address by clicking the button below:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 25px;">
            Or copy and paste this link in your browser:
          </p>
          <p style="word-break: break-all; color: #6366f1; font-size: 14px; background: #f3f4f6; padding: 10px; border-radius: 4px;">
            ${verificationUrl}
          </p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>This verification link will expire in 24 hours.</p>
          <p>If you didn't create an account with Altrii Recovery, please ignore this email.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw error;
  }
};

// Send welcome email after verification
const sendWelcomeEmail = async (email, firstName) => {
  const mailOptions = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Welcome to Altrii Recovery - Account Verified!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
          <p style="color: #6b7280; font-size: 16px;">Digital Wellness Protection</p>
        </div>
        
        <div style="background: #f0f9ff; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #06b6d4;">
          <h2 style="color: #374151; margin-bottom: 20px;">Welcome, ${firstName}! 🎉</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            Your account has been successfully verified! You're now ready to take control of your digital wellness.
          </p>
          
          <h3 style="color: #374151; margin-bottom: 15px;">What you can do now:</h3>
          <ul style="color: #4b5563; line-height: 1.8; margin-bottom: 25px;">
            <li>Choose a subscription plan that fits your needs</li>
            <li>Add and configure your devices</li>
            <li>Download content blocking profiles</li>
            <li>Set timer commitments for enhanced accountability</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="background-color: #06b6d4; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Go to Dashboard
            </a>
          </div>
        </div>
        
        <div style="background: #fef7cd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #92400e; margin-bottom: 10px;">Need Help?</h3>
          <p style="color: #92400e; margin-bottom: 0;">
            Reply to this email if you have any questions. We're here to support your digital wellness journey!
          </p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>Thank you for choosing Altrii Recovery</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: email,
    subject: 'Reset Your Altrii Recovery Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6366f1; margin-bottom: 10px;">Altrii Recovery</h1>
          <p style="color: #6b7280; font-size: 16px;">Password Reset Request</p>
        </div>
        
        <div style="background: #fef2f2; padding: 30px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #ef4444;">
          <h2 style="color: #374151; margin-bottom: 20px;">Reset Your Password</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #ef4444; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 25px;">
            Or copy and paste this link in your browser:
          </p>
          <p style="word-break: break-all; color: #ef4444; font-size: 14px; background: #f3f4f6; padding: 10px; border-radius: 4px;">
            ${resetUrl}
          </p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>This reset link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, please ignore this email.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail
};
