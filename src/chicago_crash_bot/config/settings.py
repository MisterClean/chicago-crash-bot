"""Configuration settings for the Chicago Crash Bot application."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Base directory of the project
BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

# Data directory for storing raw files
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# Chicago Data Portal settings
CHICAGO_PORTAL_DOMAIN = "data.cityofchicago.org"
CRASHES_DATASET_ID = "85ca-t3if"
CRASHES_CSV_URL = f"https://{CHICAGO_PORTAL_DOMAIN}/api/views/{CRASHES_DATASET_ID}/rows.csv"
CRASHES_SODA_ENDPOINT = f"https://{CHICAGO_PORTAL_DOMAIN}/resource/{CRASHES_DATASET_ID}.json"

# Database settings
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "chicago_crashes")

# SQLAlchemy database URL
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# GIS data paths
GIS_DATA_DIR = DATA_DIR / "gis"
WARDS_SHAPEFILE = GIS_DATA_DIR / "wards/wards.shp"
PRECINCTS_SHAPEFILE = GIS_DATA_DIR / "precincts/precincts.shp"
SENATE_DISTRICTS_SHAPEFILE = GIS_DATA_DIR / "senate_districts/senate_districts.shp"
HOUSE_DISTRICTS_SHAPEFILE = GIS_DATA_DIR / "house_districts/house_districts.shp"

# Logging settings
LOG_DIR = BASE_DIR / "logs"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Time settings
TIMEZONE = "America/Chicago"

# Data ingestion settings
LOOKBACK_DAYS = 730  # 2 years for initial load
BATCH_SIZE = 50000  # Number of records to process at once
MAX_RETRIES = 3  # Maximum number of retry attempts for API calls
RETRY_DELAY = 5  # Delay in seconds between retries

# Create required directories
for directory in [DATA_DIR, RAW_DATA_DIR, PROCESSED_DATA_DIR, GIS_DATA_DIR, LOG_DIR]:
    directory.mkdir(exist_ok=True)
