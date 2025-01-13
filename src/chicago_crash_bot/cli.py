"""Command-line interface for Chicago Crash Bot."""
import argparse
import logging
from datetime import datetime
from pathlib import Path

from chicago_crash_bot.config.settings import (
    DATABASE_URL,
    GIS_DATA_DIR,
    LOG_DIR,
    RAW_DATA_DIR,
)
from chicago_crash_bot.database.connection import create_db_engine, init_db
from chicago_crash_bot.gis.enricher import GISEnricher
from chicago_crash_bot.pipelines.etl_pipeline import run_etl_pipeline

# Configure logging
log_file = LOG_DIR / f"chicago_crash_bot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

def setup_database():
    """Initialize database schema."""
    logger.info("Initializing database schema...")
    engine = create_db_engine()
    init_db(engine)
    logger.info("Database schema initialized successfully")

def download_shapefiles(args):
    """Download GIS shapefiles."""
    logger.info("Downloading GIS shapefiles...")
    enricher = GISEnricher()
    
    # Chicago Wards
    ward_dir = GIS_DATA_DIR / "wards"
    ward_dir.mkdir(exist_ok=True)
    enricher.download_shapefile(
        "https://data.cityofchicago.org/api/geospatial/sp34-6z76?method=export&format=Shapefile",
        ward_dir
    )
    
    # Police Precincts
    precinct_dir = GIS_DATA_DIR / "precincts"
    precinct_dir.mkdir(exist_ok=True)
    enricher.download_shapefile(
        "https://data.cityofchicago.org/api/geospatial/fthy-xz3r?method=export&format=Shapefile",
        precinct_dir
    )
    
    # IL Senate Districts
    senate_dir = GIS_DATA_DIR / "senate_districts"
    senate_dir.mkdir(exist_ok=True)
    enricher.download_shapefile(
        "https://www.census.gov/geo/maps-data/data/cbf/cbf_sldu.html",  # Example URL, replace with actual
        senate_dir
    )
    
    # IL House Districts
    house_dir = GIS_DATA_DIR / "house_districts"
    house_dir.mkdir(exist_ok=True)
    enricher.download_shapefile(
        "https://www.census.gov/geo/maps-data/data/cbf/cbf_sldl.html",  # Example URL, replace with actual
        house_dir
    )
    
    logger.info("GIS shapefiles downloaded successfully")

def run_pipeline(args):
    """Run the ETL pipeline."""
    logger.info("Starting ETL pipeline...")
    
    if args.initial_load:
        if not args.csv_path:
            logger.error("CSV path is required for initial load")
            return
        
        csv_path = Path(args.csv_path)
        if not csv_path.exists():
            logger.error(f"CSV file not found: {csv_path}")
            return
        
        run_etl_pipeline(initial_load=True, csv_path=csv_path)
    else:
        run_etl_pipeline(initial_load=False)
    
    logger.info("ETL pipeline completed successfully")

def main():
    """Main CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Chicago Crash Bot CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Setup command
    setup_parser = subparsers.add_parser("setup", help="Initialize database and download shapefiles")
    setup_parser.add_argument("--skip-db", action="store_true", help="Skip database initialization")
    setup_parser.add_argument("--skip-gis", action="store_true", help="Skip GIS shapefile download")
    
    # Pipeline command
    pipeline_parser = subparsers.add_parser("pipeline", help="Run the ETL pipeline")
    pipeline_parser.add_argument("--initial-load", action="store_true", help="Perform initial CSV load")
    pipeline_parser.add_argument("--csv-path", type=str, help="Path to CSV file for initial load")
    
    args = parser.parse_args()
    
    try:
        if args.command == "setup":
            if not args.skip_db:
                setup_database()
            if not args.skip_gis:
                download_shapefiles(args)
            logger.info("Setup completed successfully")
        
        elif args.command == "pipeline":
            run_pipeline(args)
        
        else:
            parser.print_help()
    
    except Exception as e:
        logger.error(f"Command failed: {str(e)}")
        raise

if __name__ == "__main__":
    main()
