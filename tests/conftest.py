"""Test configuration and shared fixtures."""
import os
from pathlib import Path
from typing import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from chicago_crash_bot.database.models import Base

# Test database settings
TEST_DB_USER = os.getenv("TEST_DB_USER", "postgres")
TEST_DB_PASSWORD = os.getenv("TEST_DB_PASSWORD", "")
TEST_DB_HOST = os.getenv("TEST_DB_HOST", "localhost")
TEST_DB_PORT = os.getenv("TEST_DB_PORT", "5432")
TEST_DB_NAME = os.getenv("TEST_DB_NAME", "chicago_crashes_test")

TEST_DATABASE_URL = f"postgresql://{TEST_DB_USER}:{TEST_DB_PASSWORD}@{TEST_DB_HOST}:{TEST_DB_PORT}/{TEST_DB_NAME}"

# Test data paths
TEST_DIR = Path(__file__).parent
TEST_DATA_DIR = TEST_DIR / "data"
TEST_GIS_DIR = TEST_DATA_DIR / "gis"

@pytest.fixture(scope="session")
def test_db_engine():
    """Create test database engine."""
    engine = create_engine(TEST_DATABASE_URL)
    
    # Create tables
    Base.metadata.create_all(engine)
    
    yield engine
    
    # Drop tables after tests
    Base.metadata.drop_all(engine)

@pytest.fixture
def db_session(test_db_engine) -> Generator[Session, None, None]:
    """Create database session for testing."""
    SessionLocal = sessionmaker(bind=test_db_engine)
    session = SessionLocal()
    
    try:
        yield session
    finally:
        session.rollback()
        session.close()

@pytest.fixture(scope="session")
def sample_csv_path() -> Path:
    """Create a sample CSV file for testing."""
    csv_path = TEST_DATA_DIR / "sample_crashes.csv"
    TEST_DATA_DIR.mkdir(exist_ok=True)
    
    # Create sample CSV if it doesn't exist
    if not csv_path.exists():
        import pandas as pd
        
        data = {
            'crash_record_id': ['TEST001', 'TEST002', 'TEST003'],
            'crash_date': [
                '2023-01-01T10:00:00',
                '2023-01-02T14:30:00',
                '2023-01-03T18:45:00'
            ],
            'latitude': ['41.8781', '41.8782', '41.8783'],
            'longitude': ['-87.6298', '-87.6299', '-87.6300'],
            'injuries_total': ['1', '0', '2'],
            'posted_speed_limit': ['30', '35', '30'],
            'weather_condition': ['CLEAR', 'RAIN', 'CLEAR'],
            'crash_type': ['NO INJURY', 'NO INJURY', 'INJURY'],
            'intersection_related_i': ['true', 'false', 'true']
        }
        
        df = pd.DataFrame(data)
        df.to_csv(csv_path, index=False)
    
    return csv_path

@pytest.fixture(scope="session")
def sample_shapefile_path() -> Path:
    """Create a sample shapefile for testing."""
    import geopandas as gpd
    from shapely.geometry import Polygon
    
    TEST_GIS_DIR.mkdir(exist_ok=True)
    shapefile_path = TEST_GIS_DIR / "test_wards.shp"
    
    if not shapefile_path.exists():
        # Create a simple polygon for testing
        polygon = Polygon([
            (-87.6298, 41.8781),
            (-87.6298, 41.8782),
            (-87.6299, 41.8782),
            (-87.6299, 41.8781),
            (-87.6298, 41.8781)
        ])
        
        data = {
            'ward': [1],
            'geometry': [polygon]
        }
        
        gdf = gpd.GeoDataFrame(data, crs="EPSG:4326")
        gdf.to_file(shapefile_path)
    
    return shapefile_path

@pytest.fixture
def mock_soda_client(monkeypatch):
    """Mock SODA API client for testing."""
    class MockSodaClient:
        def get(self, dataset_id, **kwargs):
            return [
                {
                    'crash_record_id': 'SODA001',
                    'crash_date': '2023-01-04T09:15:00',
                    'latitude': '41.8784',
                    'longitude': '-87.6301',
                    'injuries_total': '1',
                    'posted_speed_limit': '30',
                    'weather_condition': 'CLEAR',
                    'crash_type': 'INJURY',
                    'intersection_related_i': 'true'
                }
            ]
    
    def mock_init(self, domain, app_token=None):
        self.domain = domain
        self.app_token = app_token
    
    from chicago_crash_bot.ingestion import data_fetcher
    monkeypatch.setattr(data_fetcher.Socrata, '__init__', mock_init)
    monkeypatch.setattr(data_fetcher.Socrata, 'get', MockSodaClient.get)

@pytest.fixture
def clean_test_data():
    """Clean up test data after tests."""
    yield
    
    # Remove test data files
    if TEST_DATA_DIR.exists():
        import shutil
        shutil.rmtree(TEST_DATA_DIR)
