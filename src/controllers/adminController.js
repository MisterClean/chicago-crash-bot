// src/controllers/adminController.js
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const shapefile = require('shapefile');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');
const logger = require('../utils/logger');
const dataPipeline = require('../services/dataPipeline');
const reportGenerator = require('../services/reportGenerator');

// Database connection
const pool = new Pool(config.db);

// Set up multer for file uploads
const upload = multer({
  dest: path.join(__dirname, '../uploads'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * Admin login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }
    
    // Get admin user
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM admin_users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }
    
    const user = result.rows[0];
    
    // Check password
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) {
      return res.status(401).json({
        error: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: '8h' }
    );
    
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    logger.error('Error in admin login:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Get data ingestion logs
 */
exports.getDataLogs = async (req, res) => {
  try {
    const query = `
      SELECT 
        id, start_time, end_time, status, 
        records_fetched, records_inserted, records_updated, 
        error_message, created_at
      FROM data_ingestion_logs
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    const result = await pool.query(query);
    
    return res.json(result.rows);
  } catch (err) {
    logger.error('Error in getDataLogs:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Get report generation logs
 */
exports.getReportLogs = async (req, res) => {
  try {
    const query = `
      SELECT 
        id, report_type, start_time, end_time, 
        emails_sent, status, error_message, created_at
      FROM report_generation_logs
      ORDER BY created_at DESC
      LIMIT 100
    `;
    
    const result = await pool.query(query);
    
    return res.json(result.rows);
  } catch (err) {
    logger.error('Error in getReportLogs:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Get subscription statistics
 */
exports.getSubscriptionStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN verified THEN 1 ELSE 0 END) as verified_users,
        (SELECT COUNT(*) FROM subscriptions WHERE active = true) as active_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE report_type = 'weekly' AND active = true) as weekly_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE report_type = 'monthly' AND active = true) as monthly_subscriptions
      FROM users
    `;
    
    const result = await pool.query(query);
    
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('Error in getSubscriptionStats:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Trigger data update manually
 */
exports.triggerDataUpdate = async (req, res) => {
  try {
    // Start the data update in a separate process to avoid timeout
    const updateProcess = new Promise(async (resolve, reject) => {
      try {
        await dataPipeline.initialize();
        const result = await dataPipeline.incrementalUpdate();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    
    // Respond immediately
    res.json({
      message: 'Data update initiated. Check logs for progress.'
    });
    
    // Let the update process continue in the background
    updateProcess
      .then(result => {
        logger.info('Manual data update completed:', result);
      })
      .catch(err => {
        logger.error('Error in manual data update:', err);
      });
  } catch (err) {
    logger.error('Error triggering data update:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Trigger report generation manually
 */
exports.triggerReportGeneration = async (req, res) => {
  try {
    const { reportType } = req.body;
    
    if (!reportType || !['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({
        error: 'Valid reportType is required (weekly or monthly)'
      });
    }
    
    // Start the report generation in a separate process to avoid timeout
    const reportProcess = new Promise(async (resolve, reject) => {
      try {
        let result;
        
        if (reportType === 'weekly') {
          result = await reportGenerator.generateWeeklyReports();
        } else {
          result = await reportGenerator.generateMonthlyReports();
        }
        
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
    
    // Respond immediately
    res.json({
      message: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report generation initiated. Check logs for progress.`
    });
    
    // Let the report process continue in the background
    reportProcess
      .then(count => {
        logger.info(`Manual ${reportType} report generation completed. Sent ${count} emails.`);
      })
      .catch(err => {
        logger.error(`Error in manual ${reportType} report generation:`, err);
      });
  } catch (err) {
    logger.error('Error triggering report generation:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Upload and process shapefile
 */
exports.uploadShapefile = [
  upload.single('shapefile'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }
      
      const { boundaryType } = req.body;
      
      if (!boundaryType || !['ward', 'police_district', 'senate', 'house'].includes(boundaryType)) {
        return res.status(400).json({
          error: 'Valid boundaryType is required (ward, police_district, senate, house)'
        });
      }
      
      // Extract the zip file
      const uploadDir = path.dirname(req.file.path);
      const extractDir = path.join(uploadDir, `extract_${Date.now()}`);
      
      fs.mkdirSync(extractDir, { recursive: true });
      
      try {
        execSync(`unzip -o "${req.file.path}" -d "${extractDir}"`);
      } catch (err) {
        return res.status(400).json({
          error: 'Failed to extract shapefile. Make sure the uploaded file is a valid zip containing shapefiles.'
        });
      }
      
      // Find the .shp file
      const files = fs.readdirSync(extractDir);
      const shpFile = files.find(file => file.toLowerCase().endsWith('.shp'));
      
      if (!shpFile) {
        return res.status(400).json({
          error: 'No .shp file found in the uploaded zip'
        });
      }
      
      // Read the shapefile
      const shpPath = path.join(extractDir, shpFile);
      
      const source = await shapefile.open(shpPath);
      let feature;
      let features = [];
      
      while ((feature = await source.read()) !== null) {
        features.push(feature);
      }
      
      // Start a transaction to replace all boundaries of this type
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');
        
        // Delete existing boundaries of this type
        await client.query('DELETE FROM boundaries WHERE type = $1', [boundaryType]);
        
        // Insert new boundaries
        let insertCount = 0;
        
        for (const feature of features) {
          const properties = feature.properties;
          
          // Determine district ID based on boundary type
          let districtId;
          let name;
          
          switch (boundaryType) {
            case 'ward':
              districtId = properties.ward?.toString() || properties.WARD?.toString();
              name = `Ward ${districtId}`;
              break;
            case 'police_district':
              districtId = properties.dist_num?.toString() || properties.DIST_NUM?.toString();
              name = `Police District ${districtId}`;
              break;
            case 'senate':
              districtId = properties.district?.toString() || properties.DISTRICT?.toString();
              name = `Senate District ${districtId}`;
              break;
            case 'house':
              districtId = properties.district?.toString() || properties.DISTRICT?.toString();
              name = `House District ${districtId}`;
              break;
          }
          
          if (!districtId) {
            logger.warn(`Skipping feature without district ID:`, properties);
            continue;
          }
          
          // Convert GeoJSON to PostGIS geometry
          const geometry = JSON.stringify(feature.geometry);
          
          await client.query(`
            INSERT INTO boundaries (
              name, type, district_id, geometry
            ) VALUES (
              $1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)
            )
          `, [name, boundaryType, districtId, geometry]);
          
          insertCount++;
        }
        
        await client.query('COMMIT');
        
        // Clean up
        fs.rmSync(extractDir, { recursive: true, force: true });
        fs.unlinkSync(req.file.path);
        
        return res.json({
          message: `Successfully processed ${insertCount} boundaries for ${boundaryType}`,
          count: insertCount
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      logger.error('Error processing shapefile:', err);
      
      // Clean up on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      return res.status(500).json({
        error: 'Failed to process shapefile'
      });
    }
  }
];
