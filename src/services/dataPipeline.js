// src/services/dataPipeline.js
const axios = require('axios');
const { Pool } = require('pg');
const format = require('pg-format');
const { DateTime } = require('luxon');
const turf = require('@turf/turf');
const config = require('../config');
const logger = require('../utils/logger');

// Database connection
const pool = new Pool(config.db);

class DataPipeline {
  constructor() {
    this.crashesEndpoint = 'https://data.cityofchicago.org/resource/85ca-t3if.json';
    this.peopleEndpoint = 'https://data.cityofchicago.org/resource/u6pd-qa9d.json';
    this.vehiclesEndpoint = 'https://data.cityofchicago.org/resource/68nd-jvt3.json';
    this.batchSize = 1000;
    this.lastUpdateTime = null;
  }

  async initialize() {
    try {
      // Check if we already have data to determine if this is initial load or incremental
      const result = await pool.query('SELECT COUNT(*) FROM raw_crashes');
      const count = parseInt(result.rows[0].count);

      if (count === 0) {
        logger.info('No existing data found. Performing initial full load.');
        await this.fullLoad();
      } else {
        logger.info(`Found ${count} existing records. Will perform incremental update.`);
        // Get the last update time
        const timeResult = await pool.query(
          'SELECT MAX(updated_at) as last_update FROM data_ingestion_logs WHERE status = $1',
          ['completed']
        );
        
        if (timeResult.rows[0].last_update) {
          this.lastUpdateTime = timeResult.rows[0].last_update;
          logger.info(`Last successful update was at ${this.lastUpdateTime}`);
        } else {
          // Default to 7 days ago if no last update found
          this.lastUpdateTime = DateTime.now().minus({ days: 7 }).toISO();
          logger.info(`No last update time found. Defaulting to ${this.lastUpdateTime}`);
        }
      }
      
      // Create hexagon grid if it doesn't exist
      await this.ensureHexagonGrid();
    } catch (error) {
      logger.error('Error during initialization:', error);
      throw error;
    }
  }

  async fullLoad() {
    const logId = await this.startIngestionLog('full');
    
    try {
      logger.info('Starting full data load...');
      
      // Process crashes in batches
      let offset = 0;
      let totalFetched = 0;
      let hasMore = true;
      
      while (hasMore) {
        const url = `${this.crashesEndpoint}?$limit=${this.batchSize}&$offset=${offset}`;
        logger.info(`Fetching batch from ${url}`);
        
        const response = await axios.get(url);
        const crashes = response.data;
        
        if (crashes.length === 0) {
          hasMore = false;
          continue;
        }
        
        totalFetched += crashes.length;
        logger.info(`Fetched ${crashes.length} crashes (total: ${totalFetched})`);
        
        // Process and insert this batch
        await this.processCrashBatch(crashes);
        
        // Move to next batch
        offset += this.batchSize;
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Now fetch and process people data
      await this.fetchAndProcessPeopleData();
      
      // Now fetch and process vehicles data
      await this.fetchAndProcessVehiclesData();
      
      // Update spatial joins
      await this.updateSpatialJoins();
      
      // Update aggregates
      await this.updateAggregates();
      
      // Complete the log entry
      await this.completeIngestionLog(logId, totalFetched, totalFetched, 0);
      
      logger.info(`Full load completed. Total records: ${totalFetched}`);
    } catch (error) {
      logger.error('Error during full load:', error);
      await this.failIngestionLog(logId, error.message);
      throw error;
    }
  }

  async incrementalUpdate() {
    const logId = await this.startIngestionLog('incremental');
    
    try {
      logger.info(`Starting incremental update since ${this.lastUpdateTime}...`);
      
      // We need to check for both new records and updates to existing records
      // First, get new records created after last update
      const newRecordsQuery = `$where=date_police_notified > '${this.lastUpdateTime}'`;
      const newRecords = await this.fetchCrashesWithQuery(newRecordsQuery);
      
      logger.info(`Found ${newRecords.length} new crash records`);
      
      // Check for updated records
      // This is more complex as we need to compare with what we have
      // For simplicity, we'll check records from the past 30 days
      const thirtyDaysAgo = DateTime.now().minus({ days: 30 }).toISO();
      const recentRecordsQuery = `$where=date_police_notified > '${thirtyDaysAgo}' AND date_police_notified <= '${this.lastUpdateTime}'`;
      const recentRecords = await this.fetchCrashesWithQuery(recentRecordsQuery);
      
      logger.info(`Checking ${recentRecords.length} recent records for updates`);
      
      // Get IDs of all fetched records
      const allIds = [...newRecords, ...recentRecords].map(crash => crash.crash_record_id);
      
      // Find existing records in our database
      const existingRecords = await this.getExistingRecords(allIds);
      const existingIds = new Set(existingRecords.map(record => record.crash_record_id));
      
      // Separate into inserts and updates
      const recordsToInsert = newRecords.filter(crash => !existingIds.has(crash.crash_record_id));
      const recordsToUpdate = recentRecords.filter(crash => existingIds.has(crash.crash_record_id));
      
      logger.info(`Processing ${recordsToInsert.length} inserts and ${recordsToUpdate.length} potential updates`);
      
      // Process inserts
      let insertedCount = 0;
      if (recordsToInsert.length > 0) {
        await this.processCrashBatch(recordsToInsert);
        insertedCount = recordsToInsert.length;
      }
      
      // Process updates
      let updatedCount = 0;
      if (recordsToUpdate.length > 0) {
        updatedCount = await this.processUpdates(recordsToUpdate, existingRecords);
      }
      
      // Update related data
      if (insertedCount > 0 || updatedCount > 0) {
        // Fetch and process related people and vehicles
        await this.fetchAndProcessPeopleData(allIds);
        await this.fetchAndProcessVehiclesData(allIds);
        
        // Update spatial joins and aggregates
        await this.updateSpatialJoins(allIds);
        await this.updateAggregates();
      }
      
      // Update the last update time to now
      this.lastUpdateTime = DateTime.now().toISO();
      
      // Complete the log entry
      await this.completeIngestionLog(logId, recordsToInsert.length + recordsToUpdate.length, insertedCount, updatedCount);
      
      logger.info(`Incremental update completed. Inserted: ${insertedCount}, Updated: ${updatedCount}`);
      return { inserted: insertedCount, updated: updatedCount };
    } catch (error) {
      logger.error('Error during incremental update:', error);
      await this.failIngestionLog(logId, error.message);
      throw error;
    }
  }

  async fetchCrashesWithQuery(query) {
    let offset = 0;
    let allRecords = [];
    let hasMore = true;
    
    while (hasMore) {
      const url = `${this.crashesEndpoint}?${query}&$limit=${this.batchSize}&$offset=${offset}`;
      logger.info(`Fetching: ${url}`);
      
      const response = await axios.get(url);
      const records = response.data;
      
      if (records.length === 0) {
        hasMore = false;
        continue;
      }
      
      allRecords = [...allRecords, ...records];
      offset += this.batchSize;
      
      // Small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return allRecords;
  }

  async getExistingRecords(ids) {
    if (ids.length === 0) return [];
    
    // Split into chunks to avoid query size limitations
    const chunkSize = 1000;
    let allRecords = [];
    
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');
      
      const query = `SELECT crash_record_id, updated_at FROM raw_crashes WHERE crash_record_id IN (${placeholders})`;
      const result = await pool.query(query, chunk);
      
      allRecords = [...allRecords, ...result.rows];
    }
    
    return allRecords;
  }

  async processCrashBatch(crashes) {
    if (crashes.length === 0) return;
    
    // Prepare data for insertion
    const values = crashes.map(crash => {
      // Parse and convert data types as needed
      return [
        crash.crash_record_id,
        crash.crash_date_est_i || null,
        crash.crash_date ? new Date(crash.crash_date) : null,
        crash.posted_speed_limit ? parseInt(crash.posted_speed_limit) : null,
        crash.traffic_control_device || null,
        crash.device_condition || null,
        crash.weather_condition || null,
        crash.lighting_condition || null,
        crash.first_crash_type || null,
        crash.trafficway_type || null,
        crash.lane_cnt ? parseInt(crash.lane_cnt) : null,
        crash.alignment || null,
        crash.roadway_surface_cond || null,
        crash.road_defect || null,
        crash.report_type || null,
        crash.crash_type || null,
        crash.intersection_related_i || null,
        crash.private_property_i || null,
        crash.hit_and_run_i || null,
        crash.damage || null,
        crash.date_police_notified ? new Date(crash.date_police_notified) : null,
        crash.prim_contributory_cause || null,
        crash.sec_contributory_cause || null,
        crash.street_no ? parseInt(crash.street_no) : null,
        crash.street_direction || null,
        crash.street_name || null,
        crash.beat_of_occurrence ? parseInt(crash.beat_of_occurrence) : null,
        crash.photos_taken_i || null,
        crash.statements_taken_i || null,
        crash.dooring_i || null,
        crash.work_zone_i || null,
        crash.work_zone_type || null,
        crash.workers_present_i || null,
        crash.num_units ? parseInt(crash.num_units) : null,
        crash.most_severe_injury || null,
        crash.injuries_total ? parseInt(crash.injuries_total) : null,
        crash.injuries_fatal ? parseInt(crash.injuries_fatal) : null,
        crash.injuries_incapacitating ? parseInt(crash.injuries_incapacitating) : null,
        crash.injuries_non_incapacitating ? parseInt(crash.injuries_non_incapacitating) : null,
        crash.injuries_reported_not_evident ? parseInt(crash.injuries_reported_not_evident) : null,
        crash.injuries_no_indication ? parseInt(crash.injuries_no_indication) : null,
        crash.injuries_unknown ? parseInt(crash.injuries_unknown) : null,
        crash.crash_hour ? parseInt(crash.crash_hour) : null,
        crash.crash_day_of_week ? parseInt(crash.crash_day_of_week) : null,
        crash.crash_month ? parseInt(crash.crash_month) : null,
        crash.latitude ? parseFloat(crash.latitude) : null,
        crash.longitude ? parseFloat(crash.longitude) : null,
        // Create PostGIS point if lat/long are available
        crash.latitude && crash.longitude ? 
          `POINT(${crash.longitude} ${crash.latitude})` : null
      ];
    });
    
    // Bulk insert using pg-format
    const query = format(`
      INSERT INTO raw_crashes (
        crash_record_id, crash_date_est_i, crash_date, posted_speed_limit, 
        traffic_control_device, device_condition, weather_condition, lighting_condition, 
        first_crash_type, trafficway_type, lane_cnt, alignment, roadway_surface_cond, 
        road_defect, report_type, crash_type, intersection_related_i, private_property_i, 
        hit_and_run_i, damage, date_police_notified, prim_contributory_cause, 
        sec_contributory_cause, street_no, street_direction, street_name, 
        beat_of_occurrence, photos_taken_i, statements_taken_i, dooring_i, 
        work_zone_i, work_zone_type, workers_present_i, num_units, most_severe_injury, 
        injuries_total, injuries_fatal, injuries_incapacitating, injuries_non_incapacitating, 
        injuries_reported_not_evident, injuries_no_indication, injuries_unknown, 
        crash_hour, crash_day_of_week, crash_month, latitude, longitude, location
      ) 
      VALUES %L
      ON CONFLICT (crash_record_id) DO UPDATE SET
        crash_date_est_i = EXCLUDED.crash_date_est_i,
        crash_date = EXCLUDED.crash_date,
        posted_speed_limit = EXCLUDED.posted_speed_limit,
        traffic_control_device = EXCLUDED.traffic_control_device,
        device_condition = EXCLUDED.device_condition,
        weather_condition = EXCLUDED.weather_condition,
        lighting_condition = EXCLUDED.lighting_condition,
        first_crash_type = EXCLUDED.first_crash_type,
        trafficway_type = EXCLUDED.trafficway_type,
        lane_cnt = EXCLUDED.lane_cnt,
        alignment = EXCLUDED.alignment,
        roadway_surface_cond = EXCLUDED.roadway_surface_cond,
        road_defect = EXCLUDED.road_defect,
        report_type = EXCLUDED.report_type,
        crash_type = EXCLUDED.crash_type,
        intersection_related_i = EXCLUDED.intersection_related_i,
        private_property_i = EXCLUDED.private_property_i,
        hit_and_run_i = EXCLUDED.hit_and_run_i,
        damage = EXCLUDED.damage,
        date_police_notified = EXCLUDED.date_police_notified,
        prim_contributory_cause = EXCLUDED.prim_contributory_cause,
        sec_contributory_cause = EXCLUDED.sec_contributory_cause,
        street_no = EXCLUDED.street_no,
        street_direction = EXCLUDED.street_direction,
        street_name = EXCLUDED.street_name,
        beat_of_occurrence = EXCLUDED.beat_of_occurrence,
        photos_taken_i = EXCLUDED.photos_taken_i,
        statements_taken_i = EXCLUDED.statements_taken_i,
        dooring_i = EXCLUDED.dooring_i,
        work_zone_i = EXCLUDED.work_zone_i,
        work_zone_type = EXCLUDED.work_zone_type,
        workers_present_i = EXCLUDED.workers_present_i,
        num_units = EXCLUDED.num_units,
        most_severe_injury = EXCLUDED.most_severe_injury,
        injuries_total = EXCLUDED.injuries_total,
        injuries_fatal = EXCLUDED.injuries_fatal,
        injuries_incapacitating = EXCLUDED.injuries_incapacitating,
        injuries_non_incapacitating = EXCLUDED.injuries_non_incapacitating,
        injuries_reported_not_evident = EXCLUDED.injuries_reported_not_evident,
        injuries_no_indication = EXCLUDED.injuries_no_indication,
        injuries_unknown = EXCLUDED.injuries_unknown,
        crash_hour = EXCLUDED.crash_hour,
        crash_day_of_week = EXCLUDED.crash_day_of_week,
        crash_month = EXCLUDED.crash_month,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location = EXCLUDED.location,
        updated_at = CURRENT_TIMESTAMP
    `, values);
    
    // Convert PostGIS point string to proper format
    const formattedQuery = query.replace(/'POINT\(([^)]+)\)'/g, 'ST_SetSRID(ST_MakePoint($1), 4326)');
    
    await pool.query(formattedQuery);
    logger.info(`Inserted/Updated ${crashes.length} crash records`);
  }

  async processUpdates(recordsToUpdate, existingRecords) {
    // Create a map of existing records for easy lookup
    const existingMap = new Map();
    existingRecords.forEach(record => {
      existingMap.set(record.crash_record_id, record);
    });
    
    // Filter to only records that have actually changed
    const needsUpdate = recordsToUpdate.filter(record => {
      const existing = existingMap.get(record.crash_record_id);
      if (!existing) return false;
      
      // Compare updated_at timestamps
      const recordDate = new Date(record.updated_at || record.date_police_notified);
      const existingDate = new Date(existing.updated_at);
      
      return recordDate > existingDate;
    });
    
    if (needsUpdate.length > 0) {
      await this.processCrashBatch(needsUpdate);
    }
    
    return needsUpdate.length;
  }

  async fetchAndProcessPeopleData(crashIds = null) {
    logger.info('Fetching people data...');
    let query = '';
    
    if (crashIds) {
      // Filter to specific crash IDs if provided
      if (crashIds.length === 0) return;
      
      // Split into chunks to avoid URL length limitations
      const chunkSize = 100;
      let allPeople = [];
      
      for (let i = 0; i < crashIds.length; i += chunkSize) {
        const chunk = crashIds.slice(i, i + chunkSize);
        const idList = chunk.map(id => `'${id}'`).join(',');
        query = `$where=crash_record_id in(${idList})`;
        
        const peopleBatch = await this.fetchPeopleWithQuery(query);
        allPeople = [...allPeople, ...peopleBatch];
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await this.processPeopleBatch(allPeople);
    } else {
      // Process all people data in batches
      let offset = 0;
      let totalFetched = 0;
      let hasMore = true;
      
      while (hasMore) {
        const url = `${this.peopleEndpoint}?$limit=${this.batchSize}&$offset=${offset}`;
        logger.info(`Fetching people batch from ${url}`);
        
        const response = await axios.get(url);
        const people = response.data;
        
        if (people.length === 0) {
          hasMore = false;
          continue;
        }
        
        totalFetched += people.length;
        logger.info(`Fetched ${people.length} people records (total: ${totalFetched})`);
        
        // Process and insert this batch
        await this.processPeopleBatch(people);
        
        // Move to next batch
        offset += this.batchSize;
        
        // Small delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    logger.info('Finished processing people data');
  }

  async fetchPeopleWithQuery(query) {
    let offset = 0;
    let allRecords = [];
    let hasMore = true;
    
    while (hasMore) {
      const url = `${this.peopleEndpoint}?${query}&$limit=${this.batchSize}&$offset=${offset}`;
      logger.info(`Fetching people: ${url}`);
      
      const response = await axios.get(url);
      const records = response.data;
      
      if (records.length === 0) {
        hasMore = false;
        continue;
      }
      
      allRecords = [...allRecords, ...records];
      offset += this.batchSize;
      
      // Small delay to avoid hitting rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return allRecords;
  }

  async processPeopleBatch(people) {
    if (people.length === 0) return;
    
    // Prepare data for insertion
    const values = people.map(person => [
      person.person_id,
      person.person_type || null,
      person.crash_record_id,
      person.vehicle_id || null,
      person.crash_date ? new Date(person.crash_date) : null,
      person.seat_no || null,
      person.city || null,
      person.state || null,
      person.zipcode || null,
      person.sex || null,
      person.age ? parseInt(person.age) : null,
      person.drivers_license_state || null,
      person.drivers_license_class || null,
      person.safety_equipment || null,
      person.airbag_deployed || null,
      person.ejection || null,
      person.injury_classification || null,
      person.hospital || null,
      person.ems_agency || null,
      person.ems_run_no || null,
      person.driver_action || null,
      person.driver_vision || null,
      person.physical_condition || null,
      person.pedpedal_action || null,
      person.pedpedal_visibility || null,
      person.pedpedal_location || null,
      person.bac_result || null,
      person.bac_result_value ? parseFloat(person.bac_result_value) : null,
      person.cell_phone_use || null
    ]);
    
    // Bulk insert using pg-format
    const query = format(`
      INSERT INTO raw_people (
        person_id, person_type, crash_record_id, vehicle_id, crash_date,
        seat_no, city, state, zipcode, sex, age, drivers_license_state,
        drivers_license_class, safety_equipment, airbag_deployed, ejection,
        injury_classification, hospital, ems_agency, ems_run_no, driver_action,
        driver_vision, physical_condition, pedpedal_action, pedpedal_visibility,
        pedpedal_location, bac_result, bac_result_value, cell_phone_use
      ) 
      VALUES %L
      ON CONFLICT (person_id, crash_record_id) DO UPDATE SET
        person_type = EXCLUDED.person_type,
        vehicle_id = EXCLUDED.vehicle_id,
        crash_date = EXCLUDED.crash_date,
        seat_no = EXCLUDED.seat_no,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        zipcode = EXCLUDED.zipcode,
        sex = EXCLUDED.sex,
        age = EXCLUDED.age,
        drivers_license_state = EXCLUDED.drivers_license_state,
        drivers_license_class = EXCLUDED.drivers_license_class,
        safety_equipment = EXCLUDED.safety_equipment,
        airbag_deployed = EXCLUDED.airbag_deployed,
        ejection = EXCLUDED.ejection,
        injury_classification = EXCLUDED.injury_classification,
        hospital = EXCLUDED.hospital,
        ems_agency = EXCLUDED.ems_agency,
        ems_run_no = EXCLUDED.ems_run_no,
        driver_action = EXCLUDED.driver_action,
        driver_vision = EXCLUDED.driver_vision,
        physical_condition = EXCLUDED.physical_condition,
        pedpedal_action = EXCLUDED.pedpedal_action,
        pedpedal_visibility = EXCLUDED.pedpedal_visibility,
        pedpedal_location = EXCLUDED.pedpedal_location,
        bac_result = EXCLUDED.bac_result,
        bac_result_value = EXCLUDED.bac_result_value,
        cell_phone_use = EXCLUDED.cell_phone_use,
        updated_at = CURRENT_TIMESTAMP
    `, values);
    
    await pool.query(query);
    logger.info(`Inserted/Updated ${people.length} people records`);
  }

  async fetchAndProcessVehiclesData(crashIds = null) {
    // Similar to fetchAndProcessPeopleData but for vehicles
    // Implementation omitted for brevity
    logger.info('Processing vehicles data...');
    // This would follow the same pattern as the people data processing
  }

  async updateSpatialJoins(crashIds = null) {
    logger.info('Updating spatial joins...');
    
    let query;
    if (crashIds && crashIds.length > 0) {
      // Only update specific crashes
      const placeholders = crashIds.map((_, idx) => `$${idx + 1}`).join(',');
      query = `
        SELECT 
          c.crash_record_id,
          c.location,
          c.crash_date
        FROM raw_crashes c
        WHERE c.crash_record_id IN (${placeholders})
        AND c.location IS NOT NULL
      `;
      
      const result = await pool.query(query, crashIds);
      await this.processSpatialJoins(result.rows);
    } else {
      // Update all crashes in batches
      let offset = 0;
      const batchSize = 5000;
      let hasMore = true;
      
      while (hasMore) {
        query = `
          SELECT 
            c.crash_record_id,
            c.location,
            c.crash_date
          FROM raw_crashes c
          WHERE c.location IS NOT NULL
          ORDER BY c.crash_date DESC
          LIMIT $1 OFFSET $2
        `;
        
        const result = await pool.query(query, [batchSize, offset]);
        
        if (result.rows.length === 0) {
          hasMore = false;
          continue;
        }
        
        await this.processSpatialJoins(result.rows);
        
        offset += batchSize;
        logger.info(`Processed spatial joins for ${offset} crash records so far`);
      }
    }
    
    logger.info('Spatial joins update completed');
  }

  async processSpatialJoins(crashes) {
    if (crashes.length === 0) return;
    
    // For each crash, find which boundaries it falls within
    for (const crash of crashes) {
      const query = `
        SELECT 
          type, 
          district_id
        FROM boundaries
        WHERE ST_Contains(geometry, $1)
      `;
      
      const result = await pool.query(query, [crash.location]);
      
      // Create a map of boundary types to district IDs
      const boundaries = {};
      result.rows.forEach(row => {
        boundaries[row.type] = row.district_id;
      });
      
      // Also assign to hexagon
      const hexQuery = `
        SELECT id
        FROM hexagons
        WHERE ST_Contains(geometry, $1)
        LIMIT 1
      `;
      
      const hexResult = await pool.query(hexQuery, [crash.location]);
      let hexagonId = null;
      
      if (hexResult.rows.length > 0) {
        hexagonId = hexResult.rows[0].id;
      }
      
      // Create or update the aggregate record
      const date = new Date(crash.crash_date).toISOString().split('T')[0];
      const upsertQuery = `
        INSERT INTO crash_aggregates (
          date,
          ward_id,
          police_district_id,
          senate_district_id,
          house_district_id,
          hexagon_id,
          created_at,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (date, ward_id, police_district_id, senate_district_id, house_district_id, hexagon_id)
        DO UPDATE SET
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      await pool.query(upsertQuery, [
        date,
        boundaries.ward || null,
        boundaries.police_district || null,
        boundaries.senate || null,
        boundaries.house || null,
        hexagonId
      ]);
    }
  }

  async updateAggregates() {
    logger.info('Updating crash aggregates...');
    
    // Reset counts
    await pool.query(`
      UPDATE crash_aggregates
      SET 
        crash_count = 0,
        injury_count = 0,
        fatal_count = 0,
        incapacitating_count = 0,
        pedestrian_count = 0,
        cyclist_count = 0,
        child_count = 0,
        dooring_count = 0
    `);
    
    // Update crash counts
    await pool.query(`
      UPDATE crash_aggregates a
      SET crash_count = c.count
      FROM (
        SELECT 
          DATE(crash_date) as date,
          COUNT(*) as count
        FROM raw_crashes
        GROUP BY DATE(crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update injury counts
    await pool.query(`
      UPDATE crash_aggregates a
      SET injury_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(*) as count
        FROM raw_crashes rc
        WHERE rc.injuries_total > 0
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update fatal counts
    await pool.query(`
      UPDATE crash_aggregates a
      SET fatal_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(*) as count
        FROM raw_crashes rc
        WHERE rc.injuries_fatal > 0
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update incapacitating injury counts
    await pool.query(`
      UPDATE crash_aggregates a
      SET incapacitating_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(*) as count
        FROM raw_crashes rc
        WHERE rc.injuries_incapacitating > 0
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update pedestrian counts - using people data
    await pool.query(`
      UPDATE crash_aggregates a
      SET pedestrian_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(DISTINCT rc.crash_record_id) as count
        FROM raw_crashes rc
        JOIN raw_people rp ON rc.crash_record_id = rp.crash_record_id
        WHERE rp.person_type = 'PEDESTRIAN'
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update cyclist counts - using people data
    await pool.query(`
      UPDATE crash_aggregates a
      SET cyclist_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(DISTINCT rc.crash_record_id) as count
        FROM raw_crashes rc
        JOIN raw_people rp ON rc.crash_record_id = rp.crash_record_id
        WHERE rp.person_type = 'BICYCLE'
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update child counts (people under 18) - using people data
    await pool.query(`
      UPDATE crash_aggregates a
      SET child_count = c.count
      FROM (
        SELECT 
          DATE(rc.crash_date) as date,
          COUNT(DISTINCT rc.crash_record_id) as count
        FROM raw_crashes rc
        JOIN raw_people rp ON rc.crash_record_id = rp.crash_record_id
        WHERE rp.age < 18 AND rp.age > 0
        AND (rp.person_type = 'PEDESTRIAN' OR rp.person_type = 'BICYCLE')
        GROUP BY DATE(rc.crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update dooring counts
    await pool.query(`
      UPDATE crash_aggregates a
      SET dooring_count = c.count
      FROM (
        SELECT 
          DATE(crash_date) as date,
          COUNT(*) as count
        FROM raw_crashes
        WHERE dooring_i = 'Y'
        GROUP BY DATE(crash_date)
      ) c
      WHERE a.date = c.date
    `);
    
    // Update hexagon aggregates
    await pool.query(`
      UPDATE hexagons h
      SET 
        crash_count = c.count,
        injury_count = c.injuries,
        fatal_count = c.fatalities,
        incapacitating_count = c.incapacitating,
        pedestrian_count = c.pedestrians,
        cyclist_count = c.cyclists,
        child_count = c.children,
        dooring_count = c.dooring,
        updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT 
          h2.id,
          COUNT(rc.crash_record_id) as count,
          SUM(CASE WHEN rc.injuries_total > 0 THEN 1 ELSE 0 END) as injuries,
          SUM(CASE WHEN rc.injuries_fatal > 0 THEN 1 ELSE 0 END) as fatalities,
          SUM(CASE WHEN rc.injuries_incapacitating > 0 THEN 1 ELSE 0 END) as incapacitating,
          COUNT(DISTINCT CASE WHEN rp.person_type = 'PEDESTRIAN' THEN rc.crash_record_id END) as pedestrians,
          COUNT(DISTINCT CASE WHEN rp.person_type = 'BICYCLE' THEN rc.crash_record_id END) as cyclists,
          COUNT(DISTINCT CASE WHEN rp.age < 18 AND rp.age > 0 AND (rp.person_type = 'PEDESTRIAN' OR rp.person_type = 'BICYCLE') THEN rc.crash_record_id END) as children,
          SUM(CASE WHEN rc.dooring_i = 'Y' THEN 1 ELSE 0 END) as dooring
        FROM hexagons h2
        LEFT JOIN raw_crashes rc ON ST_Contains(h2.geometry, rc.location)
        LEFT JOIN raw_people rp ON rc.crash_record_id = rp.crash_record_id
        GROUP BY h2.id
      ) c
      WHERE h.id = c.id
    `);
    
    logger.info('Finished updating aggregates');
  }

  async ensureHexagonGrid() {
    // Check if hexagon grid exists
    const result = await pool.query('SELECT COUNT(*) FROM hexagons');
    const count = parseInt(result.rows[0].count);
    
    if (count > 0) {
      logger.info(`Hexagon grid already exists with ${count} cells`);
      return;
    }
    
    logger.info('Creating hexagon grid...');
    
    // Get the bounding box of Chicago
    const bbox = [-87.94, 41.64, -87.52, 42.02]; // [west, south, east, north]
    
    // Create a hexagon grid using Turf.js
    const cellSize = 0.5; // 500 meters in km
    const options = { units: 'kilometers' };
    const grid = turf.hexGrid(bbox, cellSize, options);
    
    // Prepare for bulk insert
    const values = grid.features.map(feature => {
      const id = feature.properties.id;
      const center = turf.centroid(feature).geometry;
      const polygon = feature.geometry;
      
      return [
        id, 
        `POINT(${center.coordinates[0]} ${center.coordinates[1]})`,
        JSON.stringify(polygon)
      ];
    });
    
    // Bulk insert
    const query = format(`
      INSERT INTO hexagons (
        id,
        center,
        geometry
      ) 
      VALUES %L
    `, values);
    
    // Convert GeoJSON to PostGIS geometry
    const formattedQuery = query
      .replace(/'POINT\(([^)]+)\)'/g, 'ST_SetSRID(ST_MakePoint($1), 4326)')
      .replace(/'(\{"type":"Polygon","coordinates":\[\[.*?\]\]\})'/g, 'ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)');
    
    await pool.query(formattedQuery);
    logger.info(`Created hexagon grid with ${values.length} cells`);
  }

  async startIngestionLog(type) {
    const result = await pool.query(`
      INSERT INTO data_ingestion_logs (
        start_time,
        status,
        created_at
      ) VALUES (
        CURRENT_TIMESTAMP,
        'started',
        CURRENT_TIMESTAMP
      ) RETURNING id
    `);
    
    return result.rows[0].id;
  }

  async completeIngestionLog(id, recordsFetched, recordsInserted, recordsUpdated) {
    await pool.query(`
      UPDATE data_ingestion_logs
      SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'completed',
        records_fetched = $1,
        records_inserted = $2,
        records_updated = $3
      WHERE id = $4
    `, [recordsFetched, recordsInserted, recordsUpdated, id]);
  }

  async failIngestionLog(id, errorMessage) {
    await pool.query(`
      UPDATE data_ingestion_logs
      SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'failed',
        error_message = $1
      WHERE id = $2
    `, [errorMessage, id]);
  }
}

module.exports = new DataPipeline();