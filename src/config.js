// src/config.js
require('dotenv').config();

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'chicago_safety',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  },
  
  // Email configuration
  email: {
    host: process.env.EMAIL_HOST || 'smtp.example.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    user: process.env.EMAIL_USER || 'user@example.com',
    password: process.env.EMAIL_PASSWORD || 'password',
    from: process.env.EMAIL_FROM || 'Chicago Traffic Safety <noreply@example.com>'
  },
  
  // JWT configuration for authentication
  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  
  // Public site URL for links in emails
  siteUrl: process.env.SITE_URL || 'http://localhost:3000',
  
  // Chicago Data Portal API configuration
  dataPortal: {
    appToken: process.env.DATA_PORTAL_APP_TOKEN || null
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIR || 'logs'
  }
};

// src/utils/logger.js
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Create logs directory if it doesn't exist
const logDir = config.logging.directory;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'chicago-safety' },
  transports: [
    // Write logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          info => `${info.timestamp} ${info.level}: ${info.message}`
        )
      )
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Write error logs to error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

module.exports = logger;

// src/utils/database.js
const { Pool } = require('pg');
const config = require('../config');
const logger = require('./logger');

// Create a connection pool
const pool = new Pool(config.db);

// Test database connection
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

/**
 * Execute a database query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  
  logger.debug('Executed query', { 
    text, 
    duration, 
    rows: result.rowCount 
  });
  
  return result;
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  const client = await pool.connect();
  const originalQuery = client.query;
  
  // Monkey patch the query method to log queries
  client.query = async (text, params) => {
    const start = Date.now();
    const result = await originalQuery.call(client, text, params);
    const duration = Date.now() - start;
    
    logger.debug('Executed query in transaction', { 
      text, 
      duration, 
      rows: result.rowCount 
    });
    
    return result;
  };
  
  return client;
}

module.exports = {
  query,
  getClient,
  pool
};

// .env
`# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chicago_safety
DB_USER=postgres
DB_PASSWORD=postgres
DB_SSL=false

# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=user@example.com
EMAIL_PASSWORD=password
EMAIL_FROM=Chicago Traffic Safety <noreply@example.com>

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=8h

# Site URL (for links in emails)
SITE_URL=http://localhost:3000

# Chicago Data Portal
DATA_PORTAL_APP_TOKEN=your-app-token-here

# Logging
LOG_LEVEL=info
LOG_DIR=logs
`

// .gitignore
`# Dependencies
/node_modules
/.pnp
.pnp.js

# Testing
/coverage

# Production build
/build
/client/build
/admin/build

# Misc
.DS_Store
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Uploaded files
/uploads/*
!/uploads/.gitkeep

# Database backups
/backups/*
!/backups/.gitkeep
`