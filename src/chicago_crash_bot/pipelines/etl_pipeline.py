"""ETL pipeline for processing Chicago crash data."""
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from prefect import flow, task
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from chicago_crash_bot.database.connection import get_db_session
from chicago_crash_bot.database.models import CrashRecord, DataVersion, ETLLog
from chicago_crash_bot.gis.enricher import GISEnricher
from chicago_crash_bot.ingestion.data_fetcher import ChicagoCrashDataFetcher
from chicago_crash_bot.ingestion.transformer import CrashDataTransformer

logger = logging.getLogger(__name__)

@task
def get_last_processed_date() -> Optional[datetime]:
    """Get the last processed crash date from the database."""
    with get_db_session() as session:
        version = session.query(DataVersion).order_by(DataVersion.last_crash_date.desc()).first()
        return version.last_crash_date if version else None

@task
def log_etl_start(job_name: str) -> int:
    """Log the start of an ETL job."""
    with get_db_session() as session:
        log = ETLLog(
            job_name=job_name,
            start_time=datetime.now(),
            status='running'
        )
        session.add(log)
        session.commit()
        return log.id

@task
def log_etl_end(log_id: int, status: str, records_processed: int, error_message: Optional[str] = None):
    """Log the completion of an ETL job."""
    with get_db_session() as session:
        log = session.query(ETLLog).get(log_id)
        if log:
            log.end_time = datetime.now()
            log.status = status
            log.records_processed = records_processed
            log.error_message = error_message
            session.commit()

@task
def update_data_version(last_crash_date: datetime, records_count: int):
    """Update the data version tracking table."""
    with get_db_session() as session:
        version = DataVersion(
            last_crash_date=last_crash_date,
            last_etl_run=datetime.now(),
            records_count=records_count
        )
        session.add(version)
        session.commit()

@task
def process_csv_data(csv_path: Path) -> int:
    """Process the initial CSV data load.
    
    Args:
        csv_path: Path to the CSV file
    
    Returns:
        Number of records processed
    """
    fetcher = ChicagoCrashDataFetcher()
    transformer = CrashDataTransformer()
    records_processed = 0
    
    with get_db_session() as session:
        for chunk in fetcher.parse_csv_to_records(csv_path):
            # Transform the data
            chunk['data_source'] = 'csv'
            transformed_df = transformer.transform_dataframe(chunk)
            
            # Convert to dictionaries for database insertion
            records = transformed_df.to_dict('records')
            
            # Upsert records
            for record in records:
                stmt = insert(CrashRecord).values(record)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['crash_record_id'],
                    set_=record
                )
                session.execute(stmt)
            
            session.commit()
            records_processed += len(records)
            logger.info(f"Processed {records_processed} records from CSV")
    
    return records_processed

@task
def process_incremental_data(start_date: Optional[datetime] = None) -> int:
    """Process incremental data from SODA API.
    
    Args:
        start_date: Optional start date for fetching records
    
    Returns:
        Number of records processed
    """
    fetcher = ChicagoCrashDataFetcher()
    transformer = CrashDataTransformer()
    records_processed = 0
    
    with get_db_session() as session:
        # Get records from SODA API
        if start_date:
            record_generator = fetcher.get_records_since(start_date)
        else:
            record_generator = fetcher.get_recent_records()
        
        for batch in record_generator:
            # Add source tracking
            for record in batch:
                record['data_source'] = 'soda'
            
            # Transform records
            transformed_records = [transformer.transform_record(r) for r in batch]
            
            # Upsert records
            for record in transformed_records:
                stmt = insert(CrashRecord).values(record)
                stmt = stmt.on_conflict_do_update(
                    index_elements=['crash_record_id'],
                    set_=record
                )
                session.execute(stmt)
            
            session.commit()
            records_processed += len(transformed_records)
            logger.info(f"Processed {records_processed} records from SODA API")
    
    return records_processed

@task
def enrich_gis_data() -> int:
    """Enrich crash records with GIS boundary information.
    
    Returns:
        Number of records enriched
    """
    enricher = GISEnricher()
    records_enriched = 0
    
    with get_db_session() as session:
        enricher.enrich_crash_records(session)
        records_enriched = session.query(CrashRecord).filter(
            CrashRecord.ward_id.isnot(None)
        ).count()
    
    return records_enriched

@flow(name="chicago_crashes_etl")
def run_etl_pipeline(
    initial_load: bool = False,
    csv_path: Optional[Path] = None
) -> None:
    """Run the complete ETL pipeline.
    
    Args:
        initial_load: Whether to perform initial CSV load
        csv_path: Path to CSV file for initial load
    """
    try:
        # Log ETL start
        log_id = log_etl_start("chicago_crashes_etl")
        records_processed = 0
        
        if initial_load and csv_path:
            # Process initial CSV load
            records_processed = process_csv_data(csv_path)
            logger.info(f"Initial load completed: {records_processed} records processed")
        else:
            # Get last processed date
            last_date = get_last_processed_date()
            
            # Process incremental data
            records_processed = process_incremental_data(last_date)
            logger.info(f"Incremental load completed: {records_processed} records processed")
        
        # Enrich with GIS data
        records_enriched = enrich_gis_data()
        logger.info(f"GIS enrichment completed: {records_enriched} records enriched")
        
        # Update data version
        if records_processed > 0:
            with get_db_session() as session:
                latest_crash = session.query(
                    CrashRecord.crash_date
                ).order_by(
                    CrashRecord.crash_date.desc()
                ).first()
                
                if latest_crash:
                    update_data_version(latest_crash[0], records_processed)
        
        # Log successful completion
        log_etl_end(log_id, "completed", records_processed)
        
    except Exception as e:
        logger.error(f"ETL pipeline failed: {str(e)}")
        log_etl_end(log_id, "failed", records_processed, str(e))
        raise

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_etl_pipeline()
