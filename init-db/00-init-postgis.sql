-- Enable PostGIS (for spatial data support)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Raw crash data tables (matches source schema from Chicago Data Portal)
CREATE TABLE raw_crashes (
    crash_record_id TEXT PRIMARY KEY,
    crash_date_est_i TEXT,
    crash_date TIMESTAMP,
    posted_speed_limit INTEGER,
    traffic_control_device TEXT,
    device_condition TEXT,
    weather_condition TEXT,
    lighting_condition TEXT,
    first_crash_type TEXT,
    trafficway_type TEXT,
    lane_cnt INTEGER,
    alignment TEXT,
    roadway_surface_cond TEXT,
    road_defect TEXT,
    report_type TEXT,
    crash_type TEXT,
    intersection_related_i TEXT,
    private_property_i TEXT,
    hit_and_run_i TEXT,
    damage TEXT,
    date_police_notified TIMESTAMP,
    prim_contributory_cause TEXT,
    sec_contributory_cause TEXT,
    street_no INTEGER,
    street_direction TEXT,
    street_name TEXT,
    beat_of_occurrence INTEGER,
    photos_taken_i TEXT,
    statements_taken_i TEXT,
    dooring_i TEXT,
    work_zone_i TEXT,
    work_zone_type TEXT,
    workers_present_i TEXT,
    num_units INTEGER,
    most_severe_injury TEXT,
    injuries_total INTEGER,
    injuries_fatal INTEGER,
    injuries_incapacitating INTEGER,
    injuries_non_incapacitating INTEGER,
    injuries_reported_not_evident INTEGER,
    injuries_no_indication INTEGER,
    injuries_unknown INTEGER,
    crash_hour INTEGER,
    crash_day_of_week INTEGER,
    crash_month INTEGER,
    latitude NUMERIC,
    longitude NUMERIC,
    location GEOMETRY(Point, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE raw_people (
    id SERIAL PRIMARY KEY,
    person_id TEXT NOT NULL,
    person_type TEXT,
    crash_record_id TEXT REFERENCES raw_crashes(crash_record_id),
    vehicle_id TEXT,
    crash_date TIMESTAMP,
    seat_no TEXT,
    city TEXT,
    state TEXT,
    zipcode TEXT,
    sex TEXT,
    age INTEGER,
    drivers_license_state TEXT,
    drivers_license_class TEXT,
    safety_equipment TEXT,
    airbag_deployed TEXT,
    ejection TEXT,
    injury_classification TEXT,
    hospital TEXT,
    ems_agency TEXT,
    ems_run_no TEXT,
    driver_action TEXT,
    driver_vision TEXT,
    physical_condition TEXT,
    pedpedal_action TEXT,
    pedpedal_visibility TEXT,
    pedpedal_location TEXT,
    bac_result TEXT,
    bac_result_value NUMERIC,
    cell_phone_use TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(person_id, crash_record_id)
);

CREATE TABLE raw_vehicles (
    id SERIAL PRIMARY KEY,
    crash_unit_id TEXT NOT NULL,
    crash_record_id TEXT REFERENCES raw_crashes(crash_record_id),
    unit_type TEXT,
    unit_no INTEGER,
    vehicle_id TEXT,
    cmrc_veh_i TEXT,
    make TEXT,
    model TEXT,
    lic_plate_state TEXT,
    vehicle_year INTEGER,
    vehicle_defect TEXT,
    vehicle_type TEXT,
    vehicle_use TEXT,
    travel_direction TEXT,
    maneuver TEXT,
    towed_i TEXT,
    fire_i TEXT,
    occupant_cnt INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(crash_unit_id, crash_record_id)
);

-- Create indices for better query performance
CREATE INDEX idx_raw_crashes_crash_date ON raw_crashes(crash_date);
CREATE INDEX idx_raw_crashes_location ON raw_crashes USING GIST(location);
CREATE INDEX idx_raw_people_crash_record_id ON raw_people(crash_record_id);
CREATE INDEX idx_raw_people_person_type ON raw_people(person_type);
CREATE INDEX idx_raw_people_injury ON raw_people(injury_classification);
CREATE INDEX idx_raw_people_age ON raw_people(age);
CREATE INDEX idx_raw_vehicles_crash_record_id ON raw_vehicles(crash_record_id);

-- Geographic boundary tables for spatial joins
CREATE TABLE boundaries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'ward', 'police_district', 'senate', 'house'
    district_id TEXT NOT NULL,
    geometry GEOMETRY(MultiPolygon, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(type, district_id)
);

CREATE INDEX idx_boundaries_geometry ON boundaries USING GIST(geometry);

-- Aggregated and enriched crash data for faster queries
CREATE TABLE crash_aggregates (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    ward_id TEXT,
    police_district_id TEXT,
    senate_district_id TEXT,
    house_district_id TEXT,
    crash_count INTEGER DEFAULT 0,
    injury_count INTEGER DEFAULT 0,
    fatal_count INTEGER DEFAULT 0,
    incapacitating_count INTEGER DEFAULT 0,
    pedestrian_count INTEGER DEFAULT 0,
    cyclist_count INTEGER DEFAULT 0,
    child_count INTEGER DEFAULT 0,
    dooring_count INTEGER DEFAULT 0,
    crash_hour INTEGER,
    crash_day_of_week INTEGER,
    weekday BOOLEAN,
    school_time BOOLEAN,
    hexagon_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crash_aggregates_date ON crash_aggregates(date);
CREATE INDEX idx_crash_aggregates_ward ON crash_aggregates(ward_id);
CREATE INDEX idx_crash_aggregates_hexagon ON crash_aggregates(hexagon_id);

-- Hexagon grid for spatial clustering
CREATE TABLE hexagons (
    id TEXT PRIMARY KEY,
    center GEOMETRY(Point, 4326),
    geometry GEOMETRY(Polygon, 4326),
    crash_count INTEGER DEFAULT 0,
    injury_count INTEGER DEFAULT 0,
    fatal_count INTEGER DEFAULT 0,
    incapacitating_count INTEGER DEFAULT 0,
    pedestrian_count INTEGER DEFAULT 0,
    cyclist_count INTEGER DEFAULT 0,
    child_count INTEGER DEFAULT 0,
    dooring_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_hexagons_geometry ON hexagons USING GIST(geometry);

-- User and subscription management
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    report_type TEXT NOT NULL, -- 'weekly', 'monthly'
    geographic_type TEXT NOT NULL, -- 'ward', 'senate', 'house', 'citywide'
    geographic_id TEXT, -- NULL for citywide
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Admin users
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Data ingestion logging
CREATE TABLE data_ingestion_logs (
    id SERIAL PRIMARY KEY,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    status TEXT NOT NULL, -- 'started', 'completed', 'failed'
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Report generation logging
CREATE TABLE report_generation_logs (
    id SERIAL PRIMARY KEY,
    report_type TEXT NOT NULL, -- 'weekly', 'monthly'
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    emails_sent INTEGER DEFAULT 0,
    status TEXT NOT NULL, -- 'started', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);