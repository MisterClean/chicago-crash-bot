// src/services/emailService.js
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const mjml2html = require('mjml');
const config = require('../config');
const logger = require('../utils/logger');

// Email transport configuration
const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.secure,
  auth: {
    user: config.email.user,
    pass: config.email.password
  }
});

/**
 * Generate a random token for email verification
 */
exports.generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Send verification email to a new subscriber
 */
exports.sendVerificationEmail = async (email, token) => {
  try {
    // Load email template
    const templatePath = path.join(__dirname, '../templates/email/verification-template.mjml');
    const template = await fs.readFile(templatePath, 'utf8');
    
    // Replace template variables
    const verifyUrl = `${config.siteUrl}/verify/${token}`;
    
    const compiledTemplate = template
      .replace('{{verifyUrl}}', verifyUrl)
      .replace('{{siteUrl}}', config.siteUrl)
      .replace('{{currentYear}}', new Date().getFullYear());
    
    // Convert MJML to HTML
    const htmlOutput = mjml2html(compiledTemplate);
    
    if (htmlOutput.errors && htmlOutput.errors.length > 0) {
      logger.error('MJML template errors:', htmlOutput.errors);
      throw new Error('Error in email template');
    }
    
    // Send the email
    const mailOptions = {
      from: `"Chicago Traffic Safety" <${config.email.from}>`,
      to: email,
      subject: 'Verify Your Chicago Traffic Safety Report Subscription',
      html: htmlOutput.html
    };
    
    await transporter.sendMail(mailOptions);
    logger.info(`Sent verification email to ${email}`);
  } catch (error) {
    logger.error(`Error sending verification email to ${email}:`, error);
    throw error;
  }
};

/**
 * Send a test email to check configuration
 */
exports.sendTestEmail = async (email) => {
  try {
    // Simple test email
    const mailOptions = {
      from: `"Chicago Traffic Safety" <${config.email.from}>`,
      to: email,
      subject: 'Test Email from Chicago Traffic Safety Dashboard',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2563EB;">Chicago Traffic Safety Dashboard</h1>
          <p>This is a test email to verify that the email service is working correctly.</p>
          <p>If you're receiving this, your email configuration is properly set up!</p>
          <p style="margin-top: 30px; font-size: 12px; color: #6B7280;">
            This is an automated message, please do not reply.
          </p>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    logger.info(`Sent test email to ${email}`);
    return true;
  } catch (error) {
    logger.error(`Error sending test email to ${email}:`, error);
    throw error;
  }
};
