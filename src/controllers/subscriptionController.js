// src/controllers/subscriptionController.js
const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');
const { generateToken, sendVerificationEmail } = require('../services/emailService');

// Database connection
const pool = new Pool(config.db);

/**
 * Create a new subscription
 */
exports.createSubscription = async (req, res) => {
  try {
    const { email, name, reportType, geoType, geoId } = req.body;
    
    // Validate inputs
    if (!email) {
      return res.status(400).json({
        error: 'Email is required'
      });
    }
    
    if (!reportType || !['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({
        error: 'Valid reportType is required (weekly or monthly)'
      });
    }
    
    if (!geoType || !['citywide', 'ward', 'senate', 'house'].includes(geoType)) {
      return res.status(400).json({
        error: 'Valid geoType is required (citywide, ward, senate, house)'
      });
    }
    
    // Check if geoId is required
    if (geoType !== 'citywide' && !geoId) {
      return res.status(400).json({
        error: 'Geographic ID is required for the selected geographic type'
      });
    }
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if user already exists
      const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      
      let userId;
      
      if (userResult.rows.length > 0) {
        // User already exists
        userId = userResult.rows[0].id;
        
        // Update name if provided
        if (name) {
          await client.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);
        }
      } else {
        // Create new user
        const newUserResult = await client.query(
          'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
          [email, name || null]
        );
        
        userId = newUserResult.rows[0].id;
        
        // Generate verification token and send email
        const token = generateToken();
        
        await client.query(
          'INSERT INTO verification_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'3 days\')',
          [userId, token]
        );
        
        await sendVerificationEmail(email, token);
      }
      
      // Check if subscription already exists
      const subQuery = `
        SELECT id FROM subscriptions 
        WHERE user_id = $1 
        AND report_type = $2 
        AND geographic_type = $3
        AND (geographic_id = $4 OR (geographic_id IS NULL AND $4 IS NULL))
      `;
      
      const subResult = await client.query(subQuery, [userId, reportType, geoType, geoId]);
      
      if (subResult.rows.length > 0) {
        // Subscription already exists, reactivate if needed
        await client.query(
          'UPDATE subscriptions SET active = true WHERE id = $1',
          [subResult.rows[0].id]
        );
        
        await client.query('COMMIT');
        
        return res.json({
          message: 'Subscription updated',
          id: subResult.rows[0].id
        });
      } else {
        // Create new subscription
        const newSubResult = await client.query(
          `INSERT INTO subscriptions (
            user_id, report_type, geographic_type, geographic_id, active
          ) VALUES ($1, $2, $3, $4, true) RETURNING id`,
          [userId, reportType, geoType, geoId]
        );
        
        await client.query('COMMIT');
        
        return res.status(201).json({
          message: 'Subscription created',
          id: newSubResult.rows[0].id
        });
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error('Error in createSubscription:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Unsubscribe from reports
 */
exports.unsubscribe = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        error: 'Subscription ID is required'
      });
    }
    
    const result = await pool.query(
      'UPDATE subscriptions SET active = false WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Subscription not found'
      });
    }
    
    return res.json({
      message: 'Unsubscribed successfully'
    });
  } catch (err) {
    logger.error('Error in unsubscribe:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Verify email subscription
 */
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        error: 'Verification token is required'
      });
    }
    
    // Get token record
    const tokenResult = await pool.query(
      'SELECT user_id, expires_at FROM verification_tokens WHERE token = $1',
      [token]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Invalid or expired verification token'
      });
    }
    
    const { user_id, expires_at } = tokenResult.rows[0];
    
    // Check if token is expired
    if (new Date() > new Date(expires_at)) {
      return res.status(400).json({
        error: 'Verification token has expired'
      });
    }
    
    // Mark user as verified
    await pool.query(
      'UPDATE users SET verified = true WHERE id = $1',
      [user_id]
    );
    
    // Delete used token
    await pool.query(
      'DELETE FROM verification_tokens WHERE token = $1',
      [token]
    );
    
    return res.json({
      message: 'Email verified successfully'
    });
  } catch (err) {
    logger.error('Error in verifyEmail:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
