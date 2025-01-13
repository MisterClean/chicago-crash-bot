"""SQLAlchemy models for the Chicago Crash Bot database."""
from datetime import datetime
from typing import Optional

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    MetaData,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()
metadata = MetaData()

class CrashRecord(Base):
    """Represents a traffic crash record."""
    __tablename__ = "fact_crashes"

    # Primary identifier
    crash_record_id = Column(String, primary_key=True)
    
    # Temporal fields
    crash_date = Column(DateTime(timezone=True), nullable=False)
    crash_date_est_i = Column(Boolean)
    date_police_notified = Column(DateTime(timezone=True))
    
    # Location fields
    location = Column(Geometry('POINT', srid=4326))
    latitude = Column(Float)
    longitude = Column(Float)
    street_no = Column(Integer)
    street_direction = Column(String)
    street_name = Column(String)
    
    # Administrative fields
    beat_of_occurrence = Column(Integer)
    ward_id = Column(Integer)  # Added through GIS enrichment
    precinct_id = Column(Integer)  # Added through GIS enrichment
    senate_district_id = Column(Integer)  # Added through GIS enrichment
    house_district_id = Column(Integer)  # Added through GIS enrichment
    
    # Crash details
    posted_speed_limit = Column(Integer)
    traffic_control_device = Column(String)
    device_condition = Column(String)
    weather_condition = Column(String)
    lighting_condition = Column(String)
    first_crash_type = Column(String)
    trafficway_type = Column(String)
    lane_cnt = Column(Integer)
    alignment = Column(String)
    roadway_surface_cond = Column(String)
    road_defect = Column(String)
    report_type = Column(String)
    crash_type = Column(String)
    intersection_related_i = Column(Boolean)
    not_right_of_way_i = Column(Boolean)
    hit_and_run_i = Column(Boolean)
    damage = Column(String)
    
    # Contributing factors
    prim_contributory_cause = Column(String)
    sec_contributory_cause = Column(String)
    
    # Photos and statements
    photos_taken_i = Column(Boolean)
    statements_taken_i = Column(Boolean)
    dooring_i = Column(Boolean)
    work_zone_i = Column(Boolean)
    work_zone_type = Column(String)
    workers_present_i = Column(Boolean)
    
    # Injuries
    num_units = Column(Integer)
    most_severe_injury = Column(String)
    injuries_total = Column(Integer)
    injuries_fatal = Column(Integer)
    injuries_incapacitating = Column(Integer)
    injuries_non_incapacitating = Column(Integer)
    injuries_reported_not_evident = Column(Integer)
    injuries_no_indication = Column(Integer)
    injuries_unknown = Column(Integer)
    
    # Derived temporal fields
    crash_hour = Column(Integer)
    crash_day_of_week = Column(Integer)
    crash_month = Column(Integer)
    
    # ETL tracking
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    etl_version = Column(String)  # Track which version of our ETL pipeline processed this record
    data_source = Column(String)  # Track whether this came from CSV or SODA API
    
    def __repr__(self):
        """String representation of the crash record."""
        return f"<CrashRecord(id={self.crash_record_id}, date={self.crash_date})>"


class ETLLog(Base):
    """Tracks ETL job runs and their status."""
    __tablename__ = "etl_log"
    
    id = Column(Integer, primary_key=True)
    job_name = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True))
    status = Column(String, nullable=False)  # 'running', 'completed', 'failed'
    records_processed = Column(Integer, default=0)
    error_message = Column(String)
    
    def __repr__(self):
        """String representation of the ETL log entry."""
        return f"<ETLLog(job={self.job_name}, status={self.status})>"


class DataVersion(Base):
    """Tracks the last processed record for incremental loads."""
    __tablename__ = "data_version"
    
    id = Column(Integer, primary_key=True)
    last_crash_date = Column(DateTime(timezone=True), nullable=False)
    last_etl_run = Column(DateTime(timezone=True), nullable=False)
    records_count = Column(Integer, nullable=False)
    
    def __repr__(self):
        """String representation of the data version."""
        return f"<DataVersion(last_date={self.last_crash_date})>"
