// src/controllers/dashboardController.js
const { Pool } = require('pg');
const { DateTime } = require('luxon');
const config = require('../config');
const logger = require('../utils/logger');

// Database connection
const pool = new Pool(config.db);

/**
 * Get dashboard data for the specified geographic area and date range
 */
exports.getDashboardData = async (req, res) => {
  try {
    const { 
      geoType = 'citywide', 
      geoId = null, 
      startDate, 
      endDate 
    } = req.query;
    
    // Validate inputs
    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters: startDate and endDate'
      });
    }
    
    // Parse dates
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);
    
    if (!start.isValid || !end.isValid) {
      return res.status(400).json({
        error: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
    }
    
    // Previous period (for comparison)
    const duration = end.diff(start).as('days');
    const prevStart = start.minus({ days: duration });
    const prevEnd = end.minus({ days: duration });
    
    // Previous year (for comparison)
    const prevYearStart = start.minus({ years: 1 });
    const prevYearEnd = end.minus({ years: 1 });
    
    // Build the WHERE clause for geographic filtering
    let geoFilter = '';
    let geoParams = [];
    let paramIndex = 1;
    
    if (geoType !== 'citywide' && geoId) {
      geoFilter = `AND ${geoType}_id = $${paramIndex}`;
      geoParams.push(geoId);
      paramIndex++;
    }
    
    // Get metrics for current period
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
    
    const metricsParams = [...geoParams, start.toISODate(), end.toISODate()];
    const metricsResult = await pool.query(metricsSql, metricsParams);
    
    // Get metrics for previous period
    const prevParams = [...geoParams, prevStart.toISODate(), prevEnd.toISODate()];
    const prevResult = await pool.query(metricsSql, prevParams);
    
    // Get metrics for previous year
    const prevYearParams = [...geoParams, prevYearStart.toISODate(), prevYearEnd.toISODate()];
    const prevYearResult = await pool.query(metricsSql, prevYearParams);
    
    // Calculate percent changes
    const currentMetrics = metricsResult.rows[0];
    const prevMetrics = prevResult.rows[0];
    const prevYearMetrics = prevYearResult.rows[0];
    
    const calculateChange = (current, previous) => {
      if (!previous || previous === 0) return null;
      return ((current - previous) / previous * 100).toFixed(1);
    };
    
    const metrics = {};
    
    for (const [key, value] of Object.entries(currentMetrics)) {
      // Convert to integers and provide default values
      const currentValue = parseInt(value || 0);
      const prevValue = parseInt(prevMetrics[key] || 0);
      const prevYearValue = parseInt(prevYearMetrics[key] || 0);
      
      // Calculate changes
      const change = calculateChange(currentValue, prevValue);
      const prevYearChange = calculateChange(currentValue, prevYearValue);
      
      // Store in results object
      metrics[key] = currentValue;
      metrics[`${key}Change`] = change ? parseFloat(change) : null;
      metrics[`${key}PrevYearChange`] = prevYearChange ? parseFloat(prevYearChange) : null;
    }
    
    // Get time series data
    const timeSeriesData = await getTimeSeriesData(geoType, geoId, start, end);
    
    // Get child injury time of day data
    const childInjuryData = await getChildInjuryTimeData(geoType, geoId, start, end);
    
    // Get hexagon data for heatmap
    const hexagonData = await getHexagonData(geoType, geoId, start, end);
    
    // Return the dashboard data
    return res.json({
      metrics,
      timeSeries: timeSeriesData,
      childInjuries: childInjuryData,
      heatmap: hexagonData
    });
    
  } catch (err) {
    logger.error('Error in getDashboardData:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};

/**
 * Get time series data for charts
 */
async function getTimeSeriesData(geoType, geoId, start, end) {
  try {
    // Build the WHERE clause for geographic filtering
    let geoFilter = '';
    let geoParams = [];
    let paramIndex = 1;
    
    if (geoType !== 'citywide' && geoId) {
      geoFilter = `AND ${geoType}_id = $${paramIndex}`;
      geoParams.push(geoId);
      paramIndex++;
    }
    
    // Daily data
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
    
    const dailyParams = [...geoParams, start.toISODate(), end.toISODate()];
    const dailyResult = await pool.query(dailySql, dailyParams);
    
    // Previous year data for comparison
    const prevYearStart = start.minus({ years: 1 });
    const prevYearEnd = end.minus({ years: 1 });
    
    const prevYearParams = [...geoParams, prevYearStart.toISODate(), prevYearEnd.toISODate()];
    const prevYearResult = await pool.query(dailySql, prevYearParams);
    
    // Create a map of previous year data indexed by day of year
    const prevYearMap = new Map();
    prevYearResult.rows.forEach(row => {
      const date = DateTime.fromISO(row.date);
      const dayOfYear = date.toFormat('DDD'); // Day of year
      prevYearMap.set(dayOfYear, row);
    });
    
    // Add previous year data to current year rows
    const dailyData = dailyResult.rows.map(row => {
      const date = DateTime.fromISO(row.date);
      const dayOfYear = date.toFormat('DDD');
      const prevYearRow = prevYearMap.get(dayOfYear);
      
      const resultRow = {
        date: date.toISODate(),
        period: date.toFormat('LLL d'),
        ...row
      };
      
      // Add previous year data if available
      if (prevYearRow) {
        resultRow.prevCrashes = prevYearRow.crashes;
        resultRow.prevInjuries = prevYearRow.injuries;
        resultRow.prevSeriousInjuries = prevYearRow.serious_injuries;
        resultRow.prevFatalities = prevYearRow.fatalities;
        resultRow.prevPedestrianCrashes = prevYearRow.pedestrian_crashes;
        resultRow.prevCyclistCrashes = prevYearRow.cyclist_crashes;
      }
      
      return resultRow;
    });
    
    // Weekly data (aggregate by week)
    const weeklyData = aggregateByPeriod(dailyData, 'week');
    
    // Monthly data (aggregate by month)
    const monthlyData = aggregateByPeriod(dailyData, 'month');
    
    return {
      daily: dailyData,
      weekly: weeklyData,
      monthly: monthlyData
    };
  } catch (err) {
    logger.error('Error in getTimeSeriesData:', err);
    throw err;
  }
}

/**
 * Aggregate daily data into weekly or monthly periods
 */
function aggregateByPeriod(dailyData, periodType) {
  if (!dailyData || dailyData.length === 0) return [];
  
  const periods = new Map();
  
  dailyData.forEach(day => {
    const date = DateTime.fromISO(day.date);
    let periodKey, periodLabel;
    
    if (periodType === 'week') {
      const weekNumber = date.weekNumber;
      const year = date.year;
      periodKey = `${year}-W${weekNumber}`;
      periodLabel = `Week ${weekNumber}`;
    } else if (periodType === 'month') {
      periodKey = date.toFormat('yyyy-MM');
      periodLabel = date.toFormat('LLL yyyy');
    }
    
    if (!periods.has(periodKey)) {
      periods.set(periodKey, {
        period: periodLabel,
        crashes: 0,
        injuries: 0,
        seriousInjuries: 0,
        fatalities: 0,
        pedestrianCrashes: 0,
        cyclistCrashes: 0,
        prevCrashes: 0,
        prevInjuries: 0,
        prevSeriousInjuries: 0,
        prevFatalities: 0,
        prevPedestrianCrashes: 0,
        prevCyclistCrashes: 0
      });
    }
    
    const period = periods.get(periodKey);
    
    // Sum metrics
    period.crashes += parseInt(day.crashes || 0);
    period.injuries += parseInt(day.injuries || 0);
    period.seriousInjuries += parseInt(day.serious_injuries || 0);
    period.fatalities += parseInt(day.fatalities || 0);
    period.pedestrianCrashes += parseInt(day.pedestrian_crashes || 0);
    period.cyclistCrashes += parseInt(day.cyclist_crashes || 0);
    
    // Sum previous year metrics if available
    if (day.prevCrashes) period.prevCrashes += parseInt(day.prevCrashes || 0);
    if (day.prevInjuries) period.prevInjuries += parseInt(day.prevInjuries || 0);
    if (day.prevSeriousInjuries) period.prevSeriousInjuries += parseInt(day.prevSeriousInjuries || 0);
    if (day.prevFatalities) period.prevFatalities += parseInt(day.prevFatalities || 0);
    if (day.prevPedestrianCrashes) period.prevPedestrianCrashes += parseInt(day.prevPedestrianCrashes || 0);
    if (day.prevCyclistCrashes) period.prevCyclistCrashes += parseInt(day.prevCyclistCrashes || 0);
  });
  
  // Convert map to array and sort by period key
  return Array.from(periods.values());
}

/**
 * Get child injury by time of day data
 */
async function getChildInjuryTimeData(geoType, geoId, start, end) {
  try {
    // Build the WHERE clause for geographic filtering
    let geoFilter = '';
    let geoParams = [];
    let paramIndex = 1;
    
    if (geoType !== 'citywide' && geoId) {
      geoFilter = `AND ${geoType}_id = $${paramIndex}`;
      geoParams.push(geoId);
      paramIndex++;
    }
    
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
    
    const params = [...geoParams, start.toISODate(), end.toISODate()];
    const result = await pool.query(childTimeOfDaySql, params);
    
    // Process results into a format suitable for charts
    const timeData = Array(24).fill().map((_, hour) => ({
      hour,
      weekday_school: 0,
      weekday_summer: 0,
      weekend: 0
    }));
    
    result.rows.forEach(row => {
      const hour = parseInt(row.hour);
      if (hour >= 0 && hour < 24) {
        timeData[hour][row.category] = parseInt(row.count);
      }
    });
    
    return timeData;
  } catch (err) {
    logger.error('Error in getChildInjuryTimeData:', err);
    throw err;
  }
}

/**
 * Get hexagon data for heatmap
 */
async function getHexagonData(geoType, geoId, start, end) {
  try {
    // For citywide, just return top hexagons
    if (geoType === 'citywide') {
      const hexagonSql = `
        SELECT 
          id,
          ST_AsGeoJSON(geometry) as geometry,
          crash_count as crash_count,
          injury_count as injury_count,
          incapacitating_count as incapacitating_count,
          fatal_count as fatal_count,
          pedestrian_count as pedestrian_count,
          cyclist_count as cyclist_count,
          child_count as child_count,
          dooring_count as dooring_count
        FROM hexagons
        WHERE crash_count > 0
        ORDER BY crash_count DESC
        LIMIT 200
      `;
      
      const result = await pool.query(hexagonSql);
      
      // Process results
      return result.rows.map(row => ({
        id: row.id,
        geometry: JSON.parse(row.geometry),
        crashCount: parseInt(row.crash_count),
        injuryCount: parseInt(row.injury_count),
        incapacitatingCount: parseInt(row.incapacitating_count),
        fatalCount: parseInt(row.fatal_count),
        pedestrianCount: parseInt(row.pedestrian_count),
        cyclistCount: parseInt(row.cyclist_count),
        childCount: parseInt(row.child_count),
        dooringCount: parseInt(row.dooring_count)
      }));
    } else {
      // For specific geographic areas, get hexagons that intersect with the boundary
      const boundarySql = `
        SELECT geometry 
        FROM boundaries 
        WHERE type = $1 AND district_id = $2
      `;
      
      const boundaryResult = await pool.query(boundarySql, [geoType, geoId]);
      
      if (boundaryResult.rows.length === 0) {
        return [];
      }
      
      const boundaryGeom = boundaryResult.rows[0].geometry;
      
      const hexagonSql = `
        SELECT 
          h.id,
          ST_AsGeoJSON(h.geometry) as geometry,
          h.crash_count as crash_count,
          h.injury_count as injury_count,
          h.incapacitating_count as incapacitating_count,
          h.fatal_count as fatal_count,
          h.pedestrian_count as pedestrian_count,
          h.cyclist_count as cyclist_count,
          h.child_count as child_count,
          h.dooring_count as dooring_count
        FROM hexagons h
        WHERE ST_Intersects(h.geometry, $1)
        AND h.crash_count > 0
        ORDER BY h.crash_count DESC
      `;
      
      const result = await pool.query(hexagonSql, [boundaryGeom]);
      
      // Process results
      return result.rows.map(row => ({
        id: row.id,
        geometry: JSON.parse(row.geometry),
        crashCount: parseInt(row.crash_count),
        injuryCount: parseInt(row.injury_count),
        incapacitatingCount: parseInt(row.incapacitating_count),
        fatalCount: parseInt(row.fatal_count),
        pedestrianCount: parseInt(row.pedestrian_count),
        cyclistCount: parseInt(row.cyclist_count),
        childCount: parseInt(row.child_count),
        dooringCount: parseInt(row.dooring_count)
      }));
    }
  } catch (err) {
    logger.error('Error in getHexagonData:', err);
    throw err;
  }
}

/**
 * Get geo boundaries data for dropdowns
 */
exports.getGeoBoundaries = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['ward', 'police_district', 'senate', 'house'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid boundary type. Must be one of: ward, police_district, senate, house'
      });
    }
    
    const query = `
      SELECT 
        district_id,
        name
      FROM boundaries
      WHERE type = $1
      ORDER BY district_id::integer
    `;
    
    const result = await pool.query(query, [type]);
    
    return res.json(result.rows);
  } catch (err) {
    logger.error('Error in getGeoBoundaries:', err);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
