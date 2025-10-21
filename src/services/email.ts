import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Email service for sending verification emails and notifications
 */

let transporter: Transporter | null = null;
const CODE_EXPIRY_MINUTES = parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '30', 10);

/**
 * Reusable email template layout
 */
interface EmailTemplateOptions {
  title: string;
  preheader?: string;
  content: string;
}

function getEmailTemplate({ title, preheader, content }: EmailTemplateOptions): string {
  return `
    <!DOCTYPE html>
    <html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
    <head>
      <meta charset="utf-8">
      <meta name="x-apple-disable-message-reformatting">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
      ${preheader ? `<meta name="color-scheme" content="light">
      <meta name="supported-color-schemes" content="light">` : ''}
      <title>${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

        :root {
          color-scheme: light;
          supported-color-schemes: light;
        }

        body,
        table,
        td {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        body {
          margin: 0;
          padding: 0;
          width: 100%;
          word-break: break-word;
          background-color: #f3f4f6;
        }

        a {
          color: #E10600;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }

        @media (max-width: 600px) {
          .sm-w-full {
            width: 100% !important;
          }

          .sm-px-24 {
            padding-left: 24px !important;
            padding-right: 24px !important;
          }

          .sm-py-32 {
            padding-top: 32px !important;
            padding-bottom: 32px !important;
          }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 100%; word-break: break-word; background-color: #f3f4f6;">
      ${preheader ? `
      <div style="display: none; max-height: 0px; overflow: hidden;">
        ${preheader}
      </div>
      <div style="display: none; max-height: 0px; overflow: hidden;">
        &nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌
      </div>
      ` : ''}

      <div role="article" aria-roledescription="email" aria-label="${title}" lang="en">
        <table style="width: 100%; font-family: 'Inter', sans-serif;" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td align="center" style="background-color: #f3f4f6; padding: 48px 24px;">
              <table class="sm-w-full" style="width: 600px; margin: 0 auto;" cellpadding="0" cellspacing="0" role="presentation">

                <!-- Header with Logo -->
                <tr>
                  <td style="padding: 0 0 32px 0;">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="text-align: center;">
                          <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #E10600 0%, #C10500 100%); border-radius: 12px; position: relative;">
                            <svg style="width: 28px; height: 28px; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="white">
                              <path stroke-linecap="round" stroke-linejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 0 1-1.44-4.282m3.102.069a18.03 18.03 0 0 1-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 0 1 8.835 2.535M10.34 6.66a23.847 23.847 0 0 0 8.835-2.535m0 0A23.74 23.74 0 0 0 18.795 3m.38 1.125a23.91 23.91 0 0 1 1.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 0 0 1.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 0 1 0 3.46" />
                            </svg>
                          </div>
                          <h1 style="margin: 16px 0 0 0; font-size: 24px; font-weight: 700; color: #111827;">
                            Protest Listing
                          </h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Main Content Card -->
                <tr>
                  <td style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td class="sm-px-24 sm-py-32" style="padding: 48px;">
                          ${content}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 32px 0 0 0;">
                    <table style="width: 100%;" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="text-align: center; font-size: 14px; color: #6b7280; line-height: 24px;">
                          <p style="margin: 0 0 8px 0;">
                            © ${new Date().getFullYear()} Protest Listing. All rights reserved.
                          </p>
                          <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                            Stay informed, make your voice heard.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
    </html>
  `;
}

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

  const content = `
    <h2 style="margin: 0 0 24px 0; font-size: 28px; font-weight: 700; color: #111827; line-height: 1.2;">
      Welcome to Protest Listing!
    </h2>
    <p style="margin: 0 0 24px 0; font-size: 16px; color: #374151; line-height: 1.6;">
      Thank you for registering. Please verify your email address to activate your account and start participating in the community.
    </p>

    <div style="background-color: #f9fafb; border-radius: 12px; padding: 32px; margin: 32px 0; text-align: center; border: 2px dashed #e5e7eb;">
      <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">
        Your Verification Code
      </p>
      <p style="margin: 0; font-size: 40px; letter-spacing: 12px; font-weight: 700; color: #E10600; font-family: 'Courier New', monospace;">
        ${verificationCode}
      </p>
    </div>

    <p style="margin: 24px 0 0 0; font-size: 16px; color: #374151; line-height: 1.6;">
      Enter this code on the verification screen to complete your registration. This code will expire in <strong>${CODE_EXPIRY_MINUTES} minutes</strong>.
    </p>

    <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        If you didn't create an account, please ignore this email or contact us if you have concerns.
      </p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Protest Listing" <noreply@protest-listing.com>',
    to,
    subject: 'Verify your email for Protest Listing',
    text: `Welcome to Protest Listing!

Your verification code is: ${verificationCode}

Enter this code in the verification screen to activate your account. The code expires in ${CODE_EXPIRY_MINUTES} minutes.

If you didn't create an account, please ignore this email.

Best regards,
Protest Listing Team`,
    html: getEmailTemplate({
      title: 'Verify your email',
      preheader: `Your verification code is ${verificationCode}. Enter it to activate your account.`,
      content
    }),
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
  const content = `
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background-color: #dcfce7; color: #166534; padding: 8px 16px; border-radius: 9999px; font-size: 14px; font-weight: 600; margin-bottom: 24px;">
        ✓ Email Verified
      </div>
    </div>

    <h2 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 700; color: #111827; line-height: 1.2; text-align: center;">
      Welcome to Protest Listing!
    </h2>
    <p style="margin: 0 0 32px 0; font-size: 16px; color: #6b7280; line-height: 1.6; text-align: center;">
      Your email has been verified successfully. You're now part of our community.
    </p>

    <div style="background-color: #fef3f2; border-left: 4px solid #E10600; border-radius: 8px; padding: 24px; margin: 32px 0;">
      <h3 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #1f2937;">
        What you can do now:
      </h3>

      <table style="width: 100%; border-spacing: 0;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-bottom: 16px;">
            <table style="width: 100%; border-spacing: 0;" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                  <span style="display: inline-block; width: 24px; height: 24px; background-color: #E10600; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-size: 14px; font-weight: bold;">✓</span>
                </td>
                <td style="padding-left: 8px; vertical-align: top;">
                  <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
                    <strong style="color: #111827;">Submit new protests</strong><br>
                    Share events with the community and help keep everyone informed
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom: 16px;">
            <table style="width: 100%; border-spacing: 0;" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                  <span style="display: inline-block; width: 24px; height: 24px; background-color: #E10600; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-size: 14px; font-weight: bold;">✓</span>
                </td>
                <td style="padding-left: 8px; vertical-align: top;">
                  <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
                    <strong style="color: #111827;">Edit and manage events</strong><br>
                    Update protest details and keep information accurate
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table style="width: 100%; border-spacing: 0;" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                  <span style="display: inline-block; width: 24px; height: 24px; background-color: #E10600; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-size: 14px; font-weight: bold;">✓</span>
                </td>
                <td style="padding-left: 8px; vertical-align: top;">
                  <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.6;">
                    <strong style="color: #111827;">Build your profile</strong><br>
                    Contribute to the movement and connect with others
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 40px; text-align: center;">
      <p style="margin: 0; font-size: 16px; color: #374151; line-height: 1.6;">
        Thank you for joining our community. Together, we amplify voices and organize for change.
      </p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Protest Listing" <noreply@protest-listing.com>',
    to,
    subject: 'Welcome to Protest Listing!',
    text: `Your email has been verified successfully!

You can now:
- Submit new protests for verification
- Export protest data in various formats
- Subscribe to protest calendars

Thank you for joining the Protest Listing Service community.

Best regards,
Protest Listing Service Team`,
    html: getEmailTemplate({
      title: 'Welcome to Protest Listing',
      preheader: 'Your email has been verified. Start exploring and participating in our community.',
      content
    }),
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
