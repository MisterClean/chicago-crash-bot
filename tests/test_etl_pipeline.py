"""Tests for the ETL pipeline module."""
import datetime
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
from prefect.testing.utilities import prefect_test_harness
from sqlalchemy import select

from chicago_crash_bot.database.models import CrashRecord, DataVersion, ETLLog
from chicago_crash_bot.pipelines.etl_pipeline import (
    enrich_gis_data,
    get_last_processed_date,
    log_etl_end,
    log_etl_start,
    process_csv_data,
    process_incremental_data,
    run_etl_pipeline,
    update_data_version,
)

@pytest.fixture(autouse=True)
def prefect_test_fixture():
    """Set up Prefect test environment."""
    with prefect_test_harness():
        yield

def test_log_etl_start(db_session):
    """Test ETL job start logging."""
    log_id = log_etl_start("test_job")
    
    log = db_session.query(ETLLog).get(log_id)
    assert log is not None
    assert log.job_name == "test_job"
    assert log.status == "running"
    assert log.start_time is not None
    assert log.end_time is None

def test_log_etl_end(db_session):
    """Test ETL job end logging."""
    # Create initial log entry
    log_id = log_etl_start("test_job")
    
    # Log completion
    log_etl_end(log_id, "completed", 100)
    
    log = db_session.query(ETLLog).get(log_id)
    assert log.status == "completed"
    assert log.records_processed == 100
    assert log.end_time is not None
    assert log.error_message is None

def test_log_etl_end_with_error(db_session):
    """Test ETL job end logging with error."""
    log_id = log_etl_start("test_job")
    log_etl_end(log_id, "failed", 50, "Test error message")
    
    log = db_session.query(ETLLog).get(log_id)
    assert log.status == "failed"
    assert log.records_processed == 50
    assert log.error_message == "Test error message"

def test_get_last_processed_date(db_session):
    """Test retrieving last processed date."""
    # Create test version
    version = DataVersion(
        last_crash_date=datetime.datetime(2023, 1, 1),
        last_etl_run=datetime.datetime.now(),
        records_count=100
    )
    db_session.add(version)
    db_session.commit()
    
    result = get_last_processed_date()
    assert result == datetime.datetime(2023, 1, 1)

def test_get_last_processed_date_no_data(db_session):
    """Test retrieving last processed date with no data."""
    result = get_last_processed_date()
    assert result is None

def test_update_data_version(db_session):
    """Test updating data version."""
    last_date = datetime.datetime(2023, 1, 1)
    update_data_version(last_date, 100)
    
    version = db_session.query(DataVersion).order_by(
        DataVersion.last_crash_date.desc()
    ).first()
    
    assert version is not None
    assert version.last_crash_date == last_date
    assert version.records_count == 100

def test_process_csv_data(db_session, sample_csv_path):
    """Test CSV data processing."""
    records_processed = process_csv_data(sample_csv_path)
    
    assert records_processed > 0
    
    # Verify records in database
    records = db_session.query(CrashRecord).all()
    assert len(records) == records_processed
    
    # Check a specific record
    record = db_session.query(CrashRecord).filter_by(
        crash_record_id="TEST001"
    ).first()
    assert record is not None
    assert record.data_source == "csv"

@patch('chicago_crash_bot.ingestion.data_fetcher.ChicagoCrashDataFetcher.get_records_since')
def test_process_incremental_data(mock_get_records, db_session):
    """Test incremental data processing."""
    # Mock SODA API response
    mock_get_records.return_value = iter([[{
        'crash_record_id': 'SODA001',
        'crash_date': '2023-01-04T09:15:00',
        'latitude': '41.8784',
        'longitude': '-87.6301',
        'injuries_total': '1'
    }]])
    
    start_date = datetime.datetime(2023, 1, 1)
    records_processed = process_incremental_data(start_date)
    
    assert records_processed == 1
    
    # Verify record in database
    record = db_session.query(CrashRecord).filter_by(
        crash_record_id="SODA001"
    ).first()
    assert record is not None
    assert record.data_source == "soda"

@patch('chicago_crash_bot.gis.enricher.GISEnricher.enrich_crash_records')
def test_enrich_gis_data(mock_enrich, db_session, mock_shapefiles):
    """Test GIS data enrichment."""
    # Create test record
    record = CrashRecord(
        crash_record_id="TEST001",
        crash_date=datetime.datetime(2023, 1, 1),
        latitude=41.8781,
        longitude=-87.6298
    )
    db_session.add(record)
    db_session.commit()
    
    # Mock enrichment
    def mock_enrich_impl(session):
        record.ward_id = 1
        record.precinct_id = 101
        session.commit()
    
    mock_enrich.side_effect = mock_enrich_impl
    
    records_enriched = enrich_gis_data()
    
    assert records_enriched == 1
    
    # Verify enrichment
    updated_record = db_session.query(CrashRecord).first()
    assert updated_record.ward_id == 1
    assert updated_record.precinct_id == 101

def test_run_etl_pipeline_initial_load(db_session, sample_csv_path, mock_shapefiles):
    """Test running complete ETL pipeline with initial load."""
    run_etl_pipeline(initial_load=True, csv_path=sample_csv_path)
    
    # Verify ETL log
    log = db_session.query(ETLLog).order_by(ETLLog.id.desc()).first()
    assert log.status == "completed"
    assert log.records_processed > 0
    
    # Verify data version
    version = db_session.query(DataVersion).order_by(
        DataVersion.last_crash_date.desc()
    ).first()
    assert version is not None
    
    # Verify records
    records = db_session.query(CrashRecord).all()
    assert len(records) > 0

@patch('chicago_crash_bot.ingestion.data_fetcher.ChicagoCrashDataFetcher.get_records_since')
def test_run_etl_pipeline_incremental(mock_get_records, db_session, mock_shapefiles):
    """Test running complete ETL pipeline with incremental load."""
    # Mock SODA API response
    mock_get_records.return_value = iter([[{
        'crash_record_id': 'SODA001',
        'crash_date': '2023-01-04T09:15:00',
        'latitude': '41.8784',
        'longitude': '-87.6301',
        'injuries_total': '1'
    }]])
    
    run_etl_pipeline(initial_load=False)
    
    # Verify ETL log
    log = db_session.query(ETLLog).order_by(ETLLog.id.desc()).first()
    assert log.status == "completed"
    assert log.records_processed > 0
    
    # Verify records
    record = db_session.query(CrashRecord).filter_by(
        crash_record_id="SODA001"
    ).first()
    assert record is not None

def test_run_etl_pipeline_error_handling(db_session):
    """Test ETL pipeline error handling."""
    with pytest.raises(Exception):
        run_etl_pipeline(initial_load=True, csv_path=Path("nonexistent.csv"))
    
    # Verify error logged
    log = db_session.query(ETLLog).order_by(ETLLog.id.desc()).first()
    assert log.status == "failed"
    assert log.error_message is not None
