import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Email service for sending verification emails and notifications
 */

let transporter: Transporter | null = null;
const CODE_EXPIRY_MINUTES = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '30', 10);

/**
 * Initialize email transporter (SMTP or SendGrid)
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  // Check if email is configured
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.warn('Email not configured - verification emails will not be sent');
    throw new Error('Email service not configured');
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  return transporter;
}

/**
 * Send email verification link
 */
export async function sendVerificationEmail(
  to: string,
  verificationCode: string
): Promise<void> {

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Protest Scraper" <noreply@protest-scraper.com>',
    to,
    subject: 'Verify your email for Protest Listing',
    text: `Welcome to Protest Listing!

Your verification code is: ${verificationCode}

Enter this code in the verification screen to activate your account. The code expires in ${CODE_EXPIRY_MINUTES} minutes.

If you didn't create an account, please ignore this email.

Best regards,
Protest Listing Team`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: #007bff;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 4px;
              margin: 20px 0;
            }
            .footer { margin-top: 40px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to Protest Listing!</h2>
            <p>Thank you for registering. Please verify your email address to activate your account.</p>
            <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #000;">${verificationCode}</p>
            <p>Enter this code on the verification screen. It will expire in ${CODE_EXPIRY_MINUTES} minutes.</p>
            <div class="footer">
              <p>If you didn't create an account, please ignore this email.</p>
              <p>&copy; 2025 Protest Listing Service</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    const transport = getTransporter();
    await transport.sendMail(mailOptions);
    console.log(`Verification email sent to ${to}`);
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }
}

/**
 * Send welcome email after verification (optional)
 */
export async function sendWelcomeEmail(to: string): Promise<void> {
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Protest Listing Service" <noreply@protest-scraper.com>',
    to,
    subject: 'Welcome to Protest Listing Service!',
    text: `Your email has been verified successfully!

You can now:
- Submit new protests for verification
- Export protest data in various formats
- Subscribe to protest calendars

Thank you for joining the Protest Listing Service community.

Best regards,
Protest Listing Service Team`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            h2 { color: #007bff; }
            .footer { margin-top: 40px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Welcome to Protest Listing Service!</h2>
            <p>Your email has been verified successfully! 🎉</p>
            <p>You can now:</p>
            <ul>
              <li>Submit new protests for verification</li>
              <li>Export protest data in various formats (CSV, JSON, ICS)</li>
              <li>Subscribe to protest calendars</li>
            </ul>
            <p>Thank you for joining the Protest Listing Service community.</p>
            <div class="footer">
              <p>&copy; 2025 Protest Listing Service</p>
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    const transport = getTransporter();
    await transport.sendMail(mailOptions);
    console.log(`Welcome email sent to ${to}`);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    // Don't throw - welcome email is optional
  }
}

/**
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
}
