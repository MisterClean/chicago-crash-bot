"""GIS enrichment module for processing spatial data."""
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import geopandas as gpd
from shapely.geometry import Point
from sqlalchemy.orm import Session

from chicago_crash_bot.config.settings import (
    GIS_DATA_DIR,
    HOUSE_DISTRICTS_SHAPEFILE,
    PRECINCTS_SHAPEFILE,
    SENATE_DISTRICTS_SHAPEFILE,
    WARDS_SHAPEFILE,
)
from chicago_crash_bot.database.models import CrashRecord

logger = logging.getLogger(__name__)

class GISEnricher:
    """Handles GIS data loading and spatial enrichment of crash records."""
    
    def __init__(self):
        """Initialize GIS enricher with shapefiles."""
        self.wards = None
        self.precincts = None
        self.senate_districts = None
        self.house_districts = None
        self._load_shapefiles()
    
    def _load_shapefiles(self) -> None:
        """Load GIS shapefiles into memory."""
        try:
            if WARDS_SHAPEFILE.exists():
                self.wards = gpd.read_file(WARDS_SHAPEFILE)
                logger.info("Loaded wards shapefile")
            
            if PRECINCTS_SHAPEFILE.exists():
                self.precincts = gpd.read_file(PRECINCTS_SHAPEFILE)
                logger.info("Loaded precincts shapefile")
            
            if SENATE_DISTRICTS_SHAPEFILE.exists():
                self.senate_districts = gpd.read_file(SENATE_DISTRICTS_SHAPEFILE)
                logger.info("Loaded senate districts shapefile")
            
            if HOUSE_DISTRICTS_SHAPEFILE.exists():
                self.house_districts = gpd.read_file(HOUSE_DISTRICTS_SHAPEFILE)
                logger.info("Loaded house districts shapefile")
        
        except Exception as e:
            logger.error(f"Failed to load shapefiles: {str(e)}")
            raise
    
    def enrich_crash_record(self, lat: float, lon: float) -> Dict[str, Optional[int]]:
        """Enrich a crash record with GIS boundary information.
        
        Args:
            lat: Latitude of the crash location
            lon: Longitude of the crash location
        
        Returns:
            Dictionary containing ward_id, precinct_id, senate_district_id,
            and house_district_id for the given location
        """
        point = Point(lon, lat)
        result = {
            'ward_id': None,
            'precinct_id': None,
            'senate_district_id': None,
            'house_district_id': None
        }
        
        try:
            # Find ward
            if self.wards is not None:
                ward = self.wards[self.wards.geometry.contains(point)]
                if not ward.empty:
                    result['ward_id'] = ward.iloc[0]['ward']
            
            # Find precinct
            if self.precincts is not None:
                precinct = self.precincts[self.precincts.geometry.contains(point)]
                if not precinct.empty:
                    result['precinct_id'] = precinct.iloc[0]['precinct_id']
            
            # Find senate district
            if self.senate_districts is not None:
                senate = self.senate_districts[self.senate_districts.geometry.contains(point)]
                if not senate.empty:
                    result['senate_district_id'] = senate.iloc[0]['district_id']
            
            # Find house district
            if self.house_districts is not None:
                house = self.house_districts[self.house_districts.geometry.contains(point)]
                if not house.empty:
                    result['house_district_id'] = house.iloc[0]['district_id']
        
        except Exception as e:
            logger.error(f"Failed to enrich location ({lat}, {lon}): {str(e)}")
        
        return result
    
    def enrich_crash_records(self, session: Session, batch_size: int = 1000) -> None:
        """Enrich all crash records in the database that lack GIS information.
        
        Args:
            session: SQLAlchemy session
            batch_size: Number of records to process at once
        """
        try:
            # Get records that need enrichment (any GIS field is NULL)
            query = session.query(CrashRecord).filter(
                (CrashRecord.ward_id.is_(None)) |
                (CrashRecord.precinct_id.is_(None)) |
                (CrashRecord.senate_district_id.is_(None)) |
                (CrashRecord.house_district_id.is_(None))
            ).filter(
                CrashRecord.latitude.isnot(None),
                CrashRecord.longitude.isnot(None)
            )
            
            total_records = query.count()
            logger.info(f"Found {total_records} records needing GIS enrichment")
            
            processed = 0
            for record in query.yield_per(batch_size):
                try:
                    enriched = self.enrich_crash_record(
                        record.latitude,
                        record.longitude
                    )
                    
                    # Update record with enriched data
                    for field, value in enriched.items():
                        if value is not None:
                            setattr(record, field, value)
                    
                    processed += 1
                    if processed % batch_size == 0:
                        session.commit()
                        logger.info(f"Processed {processed}/{total_records} records")
                
                except Exception as e:
                    logger.error(f"Failed to enrich record {record.crash_record_id}: {str(e)}")
                    session.rollback()
                    continue
            
            # Final commit for any remaining records
            session.commit()
            logger.info(f"Completed GIS enrichment for {processed} records")
        
        except Exception as e:
            logger.error(f"Failed to process GIS enrichment: {str(e)}")
            session.rollback()
            raise
    
    @staticmethod
    def download_shapefile(url: str, output_dir: Path) -> None:
        """Download and extract a shapefile from URL.
        
        Args:
            url: URL of the shapefile to download
            output_dir: Directory to save the extracted shapefile
        """
        import requests
        import zipfile
        from io import BytesIO
        
        try:
            response = requests.get(url)
            response.raise_for_status()
            
            with zipfile.ZipFile(BytesIO(response.content)) as zip_ref:
                zip_ref.extractall(output_dir)
            
            logger.info(f"Successfully downloaded and extracted shapefile to {output_dir}")
        
        except Exception as e:
            logger.error(f"Failed to download shapefile from {url}: {str(e)}")
            raise
