// src/app.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');
const routes = require('./routes');
const logger = require('./utils/logger');
const dataPipeline = require('./services/dataPipeline');
const reportGenerator = require('./services/reportGenerator');

// Initialize express app
const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // Disable CSP for development
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// API routes
app.use(routes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Serve the React app for any requests not matching an API route
  app.get('*', (req, res) => {
    if (req.path.startsWith('/admin') && req.hostname.startsWith('admin.')) {
      res.sendFile(path.join(__dirname, '../admin/build', 'index.html'));
    } else {
      res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
    }
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Error processing request: ${err.message}`);
  logger.error(err.stack);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred'
      : err.message
  });
});

// Schedule tasks for data updates and report generation
// Update crash data daily at 3:00 AM
cron.schedule('0 3 * * *', async () => {
  logger.info('Running scheduled data update...');
  
  try {
    await dataPipeline.initialize();
    const result = await dataPipeline.incrementalUpdate();
    logger.info(`Scheduled data update completed: ${result.inserted} inserted, ${result.updated} updated`);
  } catch (err) {
    logger.error('Error in scheduled data update:', err);
  }
});

// Generate weekly reports every Monday at 5:00 AM
cron.schedule('0 5 * * 1', async () => {
  logger.info('Generating weekly reports...');
  
  try {
    const emailsSent = await reportGenerator.generateWeeklyReports();
    logger.info(`Weekly report generation completed. Sent ${emailsSent} emails.`);
  } catch (err) {
    logger.error('Error generating weekly reports:', err);
  }
});

// Generate monthly reports on the 1st of every month at 5:00 AM
cron.schedule('0 5 1 * *', async () => {
  logger.info('Generating monthly reports...');
  
  try {
    const emailsSent = await reportGenerator.generateMonthlyReports();
    logger.info(`Monthly report generation completed. Sent ${emailsSent} emails.`);
  } catch (err) {
    logger.error('Error generating monthly reports:', err);
  }
});

module.exports = app;

// src/server.js
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const dataPipeline = require('./services/dataPipeline');

const PORT = config.port || 3000;

// Start the server
const server = app.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Initialize data pipeline on server start
  try {
    logger.info('Initializing data pipeline...');
    await dataPipeline.initialize();
    logger.info('Data pipeline initialized successfully');
  } catch (err) {
    logger.error('Failed to initialize data pipeline:', err);
  }
});

// Handle unexpected errors and graceful shutdown
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Gracefully shut down
  server.close(() => {
    logger.info('Server closed due to uncaught exception');
    process.exit(1);
  });
  
  // If graceful shutdown fails, force exit after 10 seconds
  setTimeout(() => {
    logger.error('Forcing server shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
