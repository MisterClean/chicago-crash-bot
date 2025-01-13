"""Script to download and prepare GIS shapefiles."""
import argparse
import logging
import os
import sys
from pathlib import Path

import requests

from chicago_crash_bot.config.settings import GIS_DATA_DIR
from chicago_crash_bot.gis.enricher import GISEnricher

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# GIS data sources
GIS_SOURCES = {
    'wards': {
        'url': 'https://data.cityofchicago.org/api/geospatial/sp34-6z76?method=export&format=Shapefile',
        'dir': GIS_DATA_DIR / 'wards',
        'description': 'Chicago Ward Boundaries'
    },
    'precincts': {
        'url': 'https://data.cityofchicago.org/api/geospatial/fthy-xz3r?method=export&format=Shapefile',
        'dir': GIS_DATA_DIR / 'precincts',
        'description': 'Police Precincts'
    },
    'senate_districts': {
        'url': 'https://www2.census.gov/geo/tiger/TIGER2022/SLDU/tl_2022_17_sldu.zip',
        'dir': GIS_DATA_DIR / 'senate_districts',
        'description': 'IL Senate Districts'
    },
    'house_districts': {
        'url': 'https://www2.census.gov/geo/tiger/TIGER2022/SLDL/tl_2022_17_sldl.zip',
        'dir': GIS_DATA_DIR / 'house_districts',
        'description': 'IL House Districts'
    }
}

def download_shapefile(url: str, output_dir: Path, description: str) -> bool:
    """Download and extract a shapefile.
    
    Args:
        url: URL to download from
        output_dir: Directory to save files
        description: Description for logging
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info(f"Downloading {description}...")
        enricher = GISEnricher()
        enricher.download_shapefile(url, output_dir)
        logger.info(f"Successfully downloaded {description}")
        return True
    
    except Exception as e:
        logger.error(f"Failed to download {description}: {str(e)}")
        return False

def verify_shapefiles(gis_dir: Path = GIS_DATA_DIR) -> bool:
    """Verify all required shapefiles exist.
    
    Args:
        gis_dir: Base directory for GIS data
    
    Returns:
        bool: True if all files exist, False otherwise
    """
    missing = []
    
    for source, info in GIS_SOURCES.items():
        shapefile = info['dir'] / f"{source}.shp"
        if not shapefile.exists():
            missing.append(source)
    
    if missing:
        logger.warning(f"Missing shapefiles: {', '.join(missing)}")
        return False
    
    logger.info("All shapefiles present")
    return True

def clean_gis_data(gis_dir: Path = GIS_DATA_DIR) -> None:
    """Remove existing GIS data.
    
    Args:
        gis_dir: Base directory for GIS data
    """
    if gis_dir.exists():
        import shutil
        shutil.rmtree(gis_dir)
        logger.info("Removed existing GIS data")
    
    gis_dir.mkdir(parents=True, exist_ok=True)

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Download GIS shapefiles")
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove existing GIS data before downloading"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify existing files without downloading"
    )
    parser.add_argument(
        "--sources",
        nargs="+",
        choices=list(GIS_SOURCES.keys()),
        help="Specific sources to download (default: all)"
    )
    
    args = parser.parse_args()
    
    if args.verify_only:
        sys.exit(0 if verify_shapefiles() else 1)
    
    if args.clean:
        clean_gis_data()
    
    sources_to_download = args.sources if args.sources else GIS_SOURCES.keys()
    success = True
    
    for source in sources_to_download:
        info = GIS_SOURCES[source]
        output_dir = info['dir']
        output_dir.mkdir(parents=True, exist_ok=True)
        
        if not download_shapefile(info['url'], output_dir, info['description']):
            success = False
    
    if not verify_shapefiles():
        success = False
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
