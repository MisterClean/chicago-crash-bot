"""Data fetcher module for retrieving crash data from Chicago Data Portal."""
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Generator, Optional

import pandas as pd
import requests
from sodapy import Socrata

from chicago_crash_bot.config.settings import (
    BATCH_SIZE,
    CHICAGO_PORTAL_DOMAIN,
    CRASHES_CSV_URL,
    CRASHES_DATASET_ID,
    LOOKBACK_DAYS,
    MAX_RETRIES,
    RAW_DATA_DIR,
    RETRY_DELAY,
)

logger = logging.getLogger(__name__)

class ChicagoCrashDataFetcher:
    """Fetches crash data from Chicago Data Portal using CSV and SODA API."""
    
    def __init__(self):
        """Initialize the data fetcher."""
        self.domain = CHICAGO_PORTAL_DOMAIN
        self.dataset_id = CRASHES_DATASET_ID
        self.client = Socrata(self.domain, None)  # Anonymous access for public dataset
    
    def download_csv(self, output_path: Optional[Path] = None) -> Path:
        """Download the full CSV dataset.
        
        Args:
            output_path: Optional path to save the CSV file. If not provided,
                        saves to RAW_DATA_DIR with timestamp.
        
        Returns:
            Path to the downloaded CSV file.
        """
        if output_path is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = RAW_DATA_DIR / f"crashes_{timestamp}.csv"
        
        logger.info(f"Downloading CSV to {output_path}")
        
        for attempt in range(MAX_RETRIES):
            try:
                response = requests.get(CRASHES_CSV_URL, stream=True)
                response.raise_for_status()
                
                with open(output_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                logger.info("CSV download completed successfully")
                return output_path
            
            except Exception as e:
                if attempt == MAX_RETRIES - 1:
                    logger.error(f"Failed to download CSV after {MAX_RETRIES} attempts")
                    raise
                logger.warning(f"Attempt {attempt + 1} failed: {str(e)}")
                time.sleep(RETRY_DELAY * (attempt + 1))
    
    def get_soda_records(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        batch_size: int = BATCH_SIZE,
    ) -> Generator[list, None, None]:
        """Fetch records from SODA API with pagination.
        
        Args:
            start_date: Optional start date filter
            end_date: Optional end date filter
            batch_size: Number of records to fetch per batch
        
        Yields:
            List of records for each batch
        """
        where_clause = []
        
        if start_date:
            where_clause.append(f"crash_date >= '{start_date.isoformat()}'")
        if end_date:
            where_clause.append(f"crash_date <= '{end_date.isoformat()}'")
        
        where_str = " AND ".join(where_clause) if where_clause else None
        
        offset = 0
        while True:
            try:
                records = self.client.get(
                    self.dataset_id,
                    where=where_str,
                    limit=batch_size,
                    offset=offset,
                    order="crash_date DESC"
                )
                
                if not records:
                    break
                
                yield records
                offset += batch_size
                
                logger.info(f"Fetched {len(records)} records (offset: {offset})")
                
            except Exception as e:
                logger.error(f"Failed to fetch records at offset {offset}: {str(e)}")
                raise
    
    def get_recent_records(
        self,
        days: int = LOOKBACK_DAYS,
        batch_size: int = BATCH_SIZE
    ) -> Generator[list, None, None]:
        """Fetch records from the last N days.
        
        Args:
            days: Number of days to look back
            batch_size: Number of records per batch
        
        Yields:
            List of records for each batch
        """
        start_date = datetime.now() - timedelta(days=days)
        yield from self.get_soda_records(
            start_date=start_date,
            batch_size=batch_size
        )
    
    def get_records_since(
        self,
        since_date: datetime,
        batch_size: int = BATCH_SIZE
    ) -> Generator[list, None, None]:
        """Fetch all records since a specific date.
        
        Args:
            since_date: Date to fetch records from
            batch_size: Number of records per batch
        
        Yields:
            List of records for each batch
        """
        yield from self.get_soda_records(
            start_date=since_date,
            batch_size=batch_size
        )

    @staticmethod
    def parse_csv_to_records(csv_path: Path, chunksize: int = BATCH_SIZE) -> Generator[pd.DataFrame, None, None]:
        """Parse CSV file into chunks of records.
        
        Args:
            csv_path: Path to the CSV file
            chunksize: Number of rows to read at a time
        
        Yields:
            DataFrame chunks of records
        """
        try:
            for chunk in pd.read_csv(csv_path, chunksize=chunksize):
                # Convert column names to match SODA API format
                chunk.columns = chunk.columns.str.lower()
                yield chunk
        except Exception as e:
            logger.error(f"Failed to parse CSV file {csv_path}: {str(e)}")
            raise
