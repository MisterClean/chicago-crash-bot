// src/services/reportGenerator.js
const { Pool } = require('pg');
const mjml2html = require('mjml');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const { DateTime } = require('luxon');
const d3 = require('d3');
const { createCanvas } = require('canvas');
const config = require('../config');
const logger = require('../utils/logger');

// Database connection
const pool = new Pool(config.db);

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

class ReportGenerator {
  constructor() {
    this.templateDir = path.join(__dirname, '../templates/email');
  }

  async generateWeeklyReports() {
    const logId = await this.startReportGenerationLog('weekly');
    
    try {
      logger.info('Starting weekly report generation...');
      
      // Get the date range for this week's report
      const endDate = DateTime.now().endOf('day');
      const startDate = endDate.minus({ days: 7 }).startOf('day');
      
      // Get all active weekly subscriptions
      const subscriptions = await this.getActiveSubscriptions('weekly');
      logger.info(`Found ${subscriptions.length} active weekly subscriptions`);
      
      // Group subscriptions by geographic area to minimize database queries
      const groupedSubscriptions = this.groupSubscriptionsByGeo(subscriptions);
      
      // Generate and send reports for each geographic area
      let totalSent = 0;
      
      for (const [geoKey, subs] of Object.entries(groupedSubscriptions)) {
        const [geoType, geoId] = geoKey.split(':');
        
        // Get data for this geographic area
        const reportData = await this.getReportData(geoType, geoId, startDate, endDate);
        
        // Generate charts as base64 images
        const charts = await this.generateCharts(reportData);
        
        // Generate and send email for each subscription in this geographic area
        for (const subscription of subs) {
          await this.sendEmailReport(
            subscription,
            reportData,
            charts,
            startDate,
            endDate,
            'weekly'
          );
          totalSent++;
        }
      }
      
      // Complete the log entry
      await this.completeReportGenerationLog(logId, totalSent);
      
      logger.info(`Weekly report generation completed. Sent ${totalSent} emails.`);
      return totalSent;
    } catch (error) {
      logger.error('Error generating weekly reports:', error);
      await this.failReportGenerationLog(logId, error.message);
      throw error;
    }
  }

  async generateMonthlyReports() {
    const logId = await this.startReportGenerationLog('monthly');
    
    try {
      logger.info('Starting monthly report generation...');
      
      // Get the date range for this month's report
      const endDate = DateTime.now().endOf('day');
      const startDate = endDate.minus({ days: 30 }).startOf('day');
      
      // Get all active monthly subscriptions
      const subscriptions = await this.getActiveSubscriptions('monthly');
      logger.info(`Found ${subscriptions.length} active monthly subscriptions`);
      
      // Group subscriptions by geographic area to minimize database queries
      const groupedSubscriptions = this.groupSubscriptionsByGeo(subscriptions);
      
      // Generate and send reports for each geographic area
      let totalSent = 0;
      
      for (const [geoKey, subs] of Object.entries(groupedSubscriptions)) {
        const [geoType, geoId] = geoKey.split(':');
        
        // Get data for this geographic area
        const reportData = await this.getReportData(geoType, geoId, startDate, endDate);
        
        // Generate charts as base64 images
        const charts = await this.generateCharts(reportData);
        
        // Generate and send email for each subscription in this geographic area
        for (const subscription of subs) {
          await this.sendEmailReport(
            subscription,
            reportData,
            charts,
            startDate,
            endDate,
            'monthly'
          );
          totalSent++;
        }
      }
      
      // Complete the log entry
      await this.completeReportGenerationLog(logId, totalSent);
      
      logger.info(`Monthly report generation completed. Sent ${totalSent} emails.`);
      return totalSent;
    } catch (error) {
      logger.error('Error generating monthly reports:', error);
      await this.failReportGenerationLog(logId, error.message);
      throw error;
    }
  }

  async getActiveSubscriptions(reportType) {
    const query = `
      SELECT 
        s.id, 
        s.report_type,
        s.geographic_type,
        s.geographic_id,
        u.email,
        u.name
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      WHERE s.report_type = $1
      AND s.active = true
      AND u.verified = true
    `;
    
    const result = await pool.query(query, [reportType]);
    return result.rows;
  }

  groupSubscriptionsByGeo(subscriptions) {
    const grouped = {};
    
    for (const sub of subscriptions) {
      const key = `${sub.geographic_type}:${sub.geographic_id || 'null'}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(sub);
    }
    
    return grouped;
  }

  async getReportData(geoType, geoId, startDate, endDate) {
    // Format dates for SQL query
    const startStr = startDate.toFormat('yyyy-MM-dd');
    const endStr = endDate.toFormat('yyyy-MM-dd');
    
    // Previous period (for comparison)
    const prevStartDate = startDate.minus({ days: geoType === 'weekly' ? 7 : 30 });
    const prevEndDate = endDate.minus({ days: geoType === 'weekly' ? 7 : 30 });
    const prevStartStr = prevStartDate.toFormat('yyyy-MM-dd');
    const prevEndStr = prevEndDate.toFormat('yyyy-MM-dd');
    
    // Previous year (for comparison)
    const prevYearStartDate = startDate.minus({ years: 1 });
    const prevYearEndDate = endDate.minus({ years: 1 });
    const prevYearStartStr = prevYearStartDate.toFormat('yyyy-MM-dd');
    const prevYearEndStr = prevYearEndDate.toFormat('yyyy-MM-dd');
    
    // Build the WHERE clause for geographic filtering
    let geoFilter = '';
    let geoParams = [];
    let paramIndex = 1;
    
    if (geoType !== 'citywide' && geoId) {
      geoFilter = `AND ${geoType}_id = $${paramIndex}`;
      geoParams.push(geoId);
      paramIndex++;
    }
    
    // Get current period summary metrics
    const metricsSql = `
      SELECT
        SUM(crash_count) as total_crashes,
        SUM(injury_count) as total_injuries,
        SUM(incapacitating_count) as serious_injuries,
        SUM(fatal_count) as fatalities,
        SUM(pedestrian_count) as pedestrian_crashes,
        SUM(cyclist_count) as cyclist_crashes,
        SUM(child_count) as child_vru_crashes,
        SUM(dooring_count) as dooring_crashes
      FROM crash_aggregates
      WHERE date BETWEEN $${paramIndex} AND $${paramIndex + 1}
      ${geoFilter}
    `;
    
    const metricsParams = [...geoParams, startStr, endStr];
    const metricsResult = await pool.query(metricsSql, metricsParams);
    
    // Get previous period metrics (for comparison)
    const prevParams = [...geoParams, prevStartStr, prevEndStr];
    const prevResult = await pool.query(metricsSql, prevParams);
    
    // Get previous year metrics (for comparison)
    const prevYearParams = [...geoParams, prevYearStartStr, prevYearEndStr];
    const prevYearResult = await pool.query(metricsSql, prevYearParams);
    
    // Get daily breakdown for time series
    const dailySql = `
      SELECT
        date,
        SUM(crash_count) as crashes,
        SUM(injury_count) as injuries,
        SUM(incapacitating_count) as serious_injuries,
        SUM(fatal_count) as fatalities,
        SUM(pedestrian_count) as pedestrian_crashes,
        SUM(cyclist_count) as cyclist_crashes
      FROM crash_aggregates
      WHERE date BETWEEN $${paramIndex} AND $${paramIndex + 1}
      ${geoFilter}
      GROUP BY date
      ORDER BY date
    `;
    
    const dailyResult = await pool.query(dailySql, metricsParams);
    
    // Get child injuries by time of day
    const childTimeOfDaySql = `
      SELECT
        rc.crash_hour as hour,
        COUNT(*) as count,
        CASE 
          WHEN rc.crash_day_of_week IN (1, 7) THEN 'weekend'
          WHEN EXTRACT(MONTH FROM rc.crash_date) IN (6, 7, 8) THEN 'weekday_summer'
          ELSE 'weekday_school'
        END as category
      FROM raw_crashes rc
      JOIN raw_people rp ON rc.crash_record_id = rp.crash_record_id
      WHERE rc.crash_date BETWEEN $${paramIndex} AND $${paramIndex + 1}
      AND rp.age < 18 AND rp.age > 0
      AND (rp.person_type = 'PEDESTRIAN' OR rp.person_type = 'BICYCLE')
      ${geoFilter}
      GROUP BY rc.crash_hour, category
      ORDER BY rc.crash_hour, category
    `;
    
    const childTimeResult = await pool.query(childTimeOfDaySql, metricsParams);
    
    // Get hexagon data for heatmap
    const hexagonSql = `
      SELECT 
        h.id,
        h.geometry,
        h.crash_count as crashes,
        h.injury_count as injuries,
        h.incapacitating_count as serious_injuries,
        h.fatal_count as fatalities,
        h.pedestrian_count as pedestrian_crashes,
        h.cyclist_count as cyclist_crashes,
        h.child_count as child_injuries,
        h.dooring_count as dooring_crashes
      FROM hexagons h
      WHERE h.crash_count > 0
      ORDER BY h.crash_count DESC
      LIMIT 100
    `;
    
    const hexagonResult = await pool.query(hexagonSql);
    
    // Calculate percent changes from previous period
    const currentMetrics = metricsResult.rows[0];
    const prevMetrics = prevResult.rows[0];
    const prevYearMetrics = prevYearResult.rows[0];
    
    const calculateChange = (current, previous) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous * 100).toFixed(1);
    };
    
    const changes = {};
    const prevYearChanges = {};
    
    for (const key in currentMetrics) {
      changes[key] = calculateChange(currentMetrics[key], prevMetrics[key]);
      prevYearChanges[key] = calculateChange(currentMetrics[key], prevYearMetrics[key]);
    }
    
    // Process child time of day data
    const childTimeData = Array(24).fill().map((_, hour) => ({
      hour,
      weekday_school: 0,
      weekday_summer: 0,
      weekend: 0
    }));
    
    childTimeResult.rows.forEach(row => {
      const hour = parseInt(row.hour);
      if (hour >= 0 && hour < 24) {
        childTimeData[hour][row.category] = parseInt(row.count);
      }
    });
    
    // Prepare the final data object
    return {
      metrics: {
        current: currentMetrics,
        previous: prevMetrics,
        prevYear: prevYearMetrics,
        changes,
        prevYearChanges
      },
      timeSeries: {
        daily: dailyResult.rows
      },
      childTimeOfDay: childTimeData,
      hexagons: hexagonResult.rows,
      dateRange: {
        start: startDate.toFormat('LLL d, yyyy'),
        end: endDate.toFormat('LLL d, yyyy')
      }
    };
  }

  async generateCharts(reportData) {
    try {
      // Generate time series chart
      const timeSeriesChart = await this.generateTimeSeriesChart(reportData.timeSeries.daily);
      
      // Generate child injury time of day chart
      const childTimeChart = await this.generateChildTimeOfDayChart(reportData.childTimeOfDay);
      
      return {
        timeSeries: timeSeriesChart,
        childTimeOfDay: childTimeChart
      };
    } catch (error) {
      logger.error('Error generating charts:', error);
      throw error;
    }
  }

  async generateTimeSeriesChart(dailyData) {
    const width = 600;
    const height = 300;
    const margin = { top: 20, right: 30, bottom: 30, left: 40 };
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Skip if no data
    if (!dailyData || dailyData.length === 0) {
      return canvas.toDataURL();
    }
    
    // Parse dates
    const data = dailyData.map(d => ({
      ...d,
      date: new Date(d.date)
    }));
    
    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([margin.left, width - margin.right]);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => Math.max(d.crashes, d.injuries)) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top]);
    
    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    y.ticks(5).forEach(tick => {
      ctx.beginPath();
      ctx.moveTo(margin.left, y(tick));
      ctx.lineTo(width - margin.right, y(tick));
      ctx.stroke();
    });
    
    // X and Y axes
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.stroke();
    
    // X-axis ticks and labels
    const xTicks = x.ticks(7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px sans-serif';
    
    xTicks.forEach(tick => {
      const xPos = x(tick);
      
      // Tick
      ctx.beginPath();
      ctx.moveTo(xPos, height - margin.bottom);
      ctx.lineTo(xPos, height - margin.bottom + 5);
      ctx.stroke();
      
      // Label
      const month = tick.getMonth() + 1;
      const day = tick.getDate();
      ctx.fillText(`${month}/${day}`, xPos, height - margin.bottom + 8);
    });
    
    // Y-axis ticks and labels
    const yTicks = y.ticks(5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    yTicks.forEach(tick => {
      const yPos = y(tick);
      
      // Tick
      ctx.beginPath();
      ctx.moveTo(margin.left - 5, yPos);
      ctx.lineTo(margin.left, yPos);
      ctx.stroke();
      
      // Label
      ctx.fillText(tick.toString(), margin.left - 8, yPos);
    });
    
    // Draw lines
    const lineGenerator = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.crashes))
      .context(ctx);
    
    // Crashes line
    ctx.beginPath();
    lineGenerator(data);
    ctx.strokeStyle = '#2563eb'; // Blue
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Injuries line
    const injuriesLine = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.injuries))
      .context(ctx);
    
    ctx.beginPath();
    injuriesLine(data);
    ctx.strokeStyle = '#dc2626'; // Red
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Legend
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Crashes legend
    ctx.strokeStyle = '#2563eb';
    ctx.beginPath();
    ctx.moveTo(width - margin.right - 80, margin.top + 10);
    ctx.lineTo(width - margin.right - 60, margin.top + 10);
    ctx.stroke();
    ctx.fillStyle = '#2563eb';
    ctx.fillText('Crashes', width - margin.right - 55, margin.top + 10);
    
    // Injuries legend
    ctx.strokeStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(width - margin.right - 80, margin.top + 30);
    ctx.lineTo(width - margin.right - 60, margin.top + 30);
    ctx.stroke();
    ctx.fillStyle = '#dc2626';
    ctx.fillText('Injuries', width - margin.right - 55, margin.top + 30);
    
    // Title
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText('Daily Crashes and Injuries', width / 2, margin.top / 2);
    
    return canvas.toDataURL();
  }

  async generateChildTimeOfDayChart(childTimeData) {
    const width = 600;
    const height = 300;
    const margin = { top: 20, right: 80, bottom: 40, left: 50 };
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Skip if no data
    if (!childTimeData || childTimeData.length === 0) {
      return canvas.toDataURL();
    }
    
    // Scales
    const x = d3.scaleLinear()
      .domain([0, 23])
      .range([margin.left, width - margin.right]);
    
    const maxValue = d3.max(childTimeData, d => 
      Math.max(d.weekday_school, d.weekday_summer, d.weekend)
    );
    
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.1 || 10])
      .nice()
      .range([height - margin.bottom, margin.top]);
    
    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    y.ticks(5).forEach(tick => {
      ctx.beginPath();
      ctx.moveTo(margin.left, y(tick));
      ctx.lineTo(width - margin.right, y(tick));
      ctx.stroke();
    });
    
    // X and Y axes
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, height - margin.bottom);
    ctx.lineTo(width - margin.right, height - margin.bottom);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, height - margin.bottom);
    ctx.stroke();
    
    // X-axis ticks and labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px sans-serif';
    
    for (let hour = 0; hour <= 23; hour += 3) {
      const xPos = x(hour);
      
      // Tick
      ctx.beginPath();
      ctx.moveTo(xPos, height - margin.bottom);
      ctx.lineTo(xPos, height - margin.bottom + 5);
      ctx.stroke();
      
      // Label
      let displayHour;
      if (hour === 0) displayHour = '12 AM';
      else if (hour === 12) displayHour = '12 PM';
      else if (hour < 12) displayHour = `${hour} AM`;
      else displayHour = `${hour - 12} PM`;
      
      ctx.fillText(displayHour, xPos, height - margin.bottom + 8);
    }
    
    // X-axis label
    ctx.font = '12px sans-serif';
    ctx.fillText('Hour of Day', width / 2, height - 10);
    
    // Y-axis ticks and labels
    const yTicks = y.ticks(5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    yTicks.forEach(tick => {
      const yPos = y(tick);
      
      // Tick
      ctx.beginPath();
      ctx.moveTo(margin.left - 5, yPos);
      ctx.lineTo(margin.left, yPos);
      ctx.stroke();
      
      // Label
      ctx.fillText(tick.toString(), margin.left - 8, yPos);
    });
    
    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Number of Children Injured', 0, 0);
    ctx.restore();
    
    // Draw lines for each category
    const categories = [
      { key: 'weekday_school', color: '#0072B2', label: 'Weekday (School)' },
      { key: 'weekday_summer', color: '#E69F00', label: 'Weekday (Summer)' },
      { key: 'weekend', color: '#009E73', label: 'Weekend' }
    ];
    
    categories.forEach(category => {
      const lineGenerator = d3.line()
        .x(d => x(d.hour))
        .y(d => y(d[category.key]))
        .context(ctx);
      
      ctx.beginPath();
      lineGenerator(childTimeData);
      ctx.strokeStyle = category.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Legend
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    categories.forEach((category, i) => {
      const yPos = margin.top + 10 + i * 20;
      
      ctx.strokeStyle = category.color;
      ctx.beginPath();
      ctx.moveTo(width - margin.right + 5, yPos);
      ctx.lineTo(width - margin.right + 25, yPos);
      ctx.stroke();
      
      ctx.fillStyle = category.color;
      ctx.fillText(category.label, width - margin.right + 30, yPos);
    });
    
    // Title
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText('Child Injuries by Time of Day', width / 2, margin.top / 2);
    
    return canvas.toDataURL();
  }

  async sendEmailReport(subscription, reportData, charts, startDate, endDate, reportType) {
    try {
      // Load email template
      const templatePath = path.join(this.templateDir, 'report-template.mjml');
      const template = await fs.readFile(templatePath, 'utf8');
      
      // Format metrics with commas
      const formatNumber = (num) => {
        if (num === null || num === undefined) return '0';
        return parseInt(num).toLocaleString();
      };
      
      // Format percent changes
      const formatChange = (change) => {
        if (change === null || change === undefined) return '';
        const value = parseFloat(change);
        const isPositive = value > 0;
        const isNegative = value < 0;
        
        // For safety metrics, negative is good
        const isBad = (isPositive && true) || (isNegative && false);
        
        const color = isBad ? '#DC2626' : '#059669';
        const arrow = isPositive ? '▲' : isNegative ? '▼' : '';
        
        return `<span style="color: ${color};">${arrow} ${Math.abs(value).toFixed(1)}%</span>`;
      };
      
      // Prepare template variables
      const metrics = reportData.metrics.current;
      const changes = reportData.metrics.changes;
      
      const templateVars = {
        userName: subscription.name || 'there',
        reportType: reportType === 'weekly' ? 'Weekly' : 'Monthly',
        geoType: subscription.geographic_type === 'citywide' 
          ? 'Chicago'
          : `${subscription.geographic_type.charAt(0).toUpperCase() + subscription.geographic_type.slice(1)} ${subscription.geographic_id}`,
        startDate: reportData.dateRange.start,
        endDate: reportData.dateRange.end,
        
        // Metrics and their changes
        totalCrashes: formatNumber(metrics.total_crashes),
        totalCrashesChange: formatChange(changes.total_crashes),
        
        totalInjuries: formatNumber(metrics.total_injuries),
        totalInjuriesChange: formatChange(changes.total_injuries),
        
        seriousInjuries: formatNumber(metrics.serious_injuries),
        seriousInjuriesChange: formatChange(changes.serious_injuries),
        
        fatalities: formatNumber(metrics.fatalities),
        fatalitiesChange: formatChange(changes.fatalities),
        
        pedestrianCrashes: formatNumber(metrics.pedestrian_crashes),
        pedestrianCrashesChange: formatChange(changes.pedestrian_crashes),
        
        cyclistCrashes: formatNumber(metrics.cyclist_crashes),
        cyclistCrashesChange: formatChange(changes.cyclist_crashes),
        
        childVRUCrashes: formatNumber(metrics.child_vru_crashes),
        childVRUCrashesChange: formatChange(changes.child_vru_crashes),
        
        dooringCrashes: formatNumber(metrics.dooring_crashes),
        dooringCrashesChange: formatChange(changes.dooring_crashes),
        
        // Chart images
        timeSeriesChart: charts.timeSeries,
        childTimeOfDayChart: charts.childTimeOfDay,
        
        // URLs
        dashboardUrl: `${config.siteUrl}/dashboard`,
        unsubscribeUrl: `${config.siteUrl}/unsubscribe?id=${subscription.id}`,
        currentYear: new Date().getFullYear()
      };
      
      // Inject variables into template
      let compiledTemplate = template;
      for (const [key, value] of Object.entries(templateVars)) {
        compiledTemplate = compiledTemplate.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      
      // Convert MJML to HTML
      const htmlOutput = mjml2html(compiledTemplate);
      
      if (htmlOutput.errors && htmlOutput.errors.length > 0) {
        logger.error('MJML template errors:', htmlOutput.errors);
        throw new Error('Error in email template');
      }
      
      // Send the email
      const mailOptions = {
        from: `"Chicago Traffic Safety" <${config.email.from}>`,
        to: subscription.email,
        subject: `${templateVars.reportType} Traffic Safety Report for ${templateVars.geoType}`,
        html: htmlOutput.html
      };
      
      await transporter.sendMail(mailOptions);
      logger.info(`Sent ${reportType} report to ${subscription.email}`);
    } catch (error) {
      logger.error(`Error sending email to ${subscription.email}:`, error);
      throw error;
    }
  }

  async startReportGenerationLog(reportType) {
    const result = await pool.query(`
      INSERT INTO report_generation_logs (
        report_type,
        start_time,
        status,
        created_at
      ) VALUES (
        $1,
        CURRENT_TIMESTAMP,
        'started',
        CURRENT_TIMESTAMP
      ) RETURNING id
    `, [reportType]);
    
    return result.rows[0].id;
  }

  async completeReportGenerationLog(id, emailsSent) {
    await pool.query(`
      UPDATE report_generation_logs
      SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'completed',
        emails_sent = $1
      WHERE id = $2
    `, [emailsSent, id]);
  }

  async failReportGenerationLog(id, errorMessage) {
    await pool.query(`
      UPDATE report_generation_logs
      SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'failed',
        error_message = $1
      WHERE id = $2
    `, [errorMessage, id]);
  }
}

module.exports = new ReportGenerator();
