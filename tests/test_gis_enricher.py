"""Tests for the GIS enricher module."""
import os
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import Point, Polygon

from chicago_crash_bot.database.models import CrashRecord
from chicago_crash_bot.gis.enricher import GISEnricher

@pytest.fixture
def mock_shapefiles(monkeypatch, sample_shapefile_path):
    """Mock shapefile paths and loading."""
    def mock_exists(self):
        return True
    
    monkeypatch.setattr(Path, "exists", mock_exists)
    
    def mock_read_file(*args, **kwargs):
        # Create a simple test GeoDataFrame
        polygon = Polygon([
            (-87.6298, 41.8781),  # Chicago area coordinates
            (-87.6298, 41.8782),
            (-87.6299, 41.8782),
            (-87.6299, 41.8781),
            (-87.6298, 41.8781)
        ])
        
        if "ward" in str(args[0]):
            data = {
                'ward': [1],
                'geometry': [polygon]
            }
        elif "precinct" in str(args[0]):
            data = {
                'precinct_id': [101],
                'geometry': [polygon]
            }
        elif "senate" in str(args[0]):
            data = {
                'district_id': [7],
                'geometry': [polygon]
            }
        else:  # house districts
            data = {
                'district_id': [13],
                'geometry': [polygon]
            }
        
        return gpd.GeoDataFrame(data, crs="EPSG:4326")
    
    monkeypatch.setattr(gpd, "read_file", mock_read_file)

def test_gis_enricher_initialization(mock_shapefiles):
    """Test GIS enricher initialization and shapefile loading."""
    enricher = GISEnricher()
    
    assert enricher.wards is not None
    assert enricher.precincts is not None
    assert enricher.senate_districts is not None
    assert enricher.house_districts is not None
    
    assert len(enricher.wards) == 1
    assert 'ward' in enricher.wards.columns
    assert isinstance(enricher.wards.geometry.iloc[0], Polygon)

def test_enrich_crash_record(mock_shapefiles):
    """Test enrichment of a single crash record."""
    enricher = GISEnricher()
    
    # Test point inside the test polygon
    result = enricher.enrich_crash_record(
        lat=41.87815,
        lon=-87.62985
    )
    
    assert result['ward_id'] == 1
    assert result['precinct_id'] == 101
    assert result['senate_district_id'] == 7
    assert result['house_district_id'] == 13

def test_enrich_crash_record_outside_boundaries(mock_shapefiles):
    """Test enrichment of a point outside all boundaries."""
    enricher = GISEnricher()
    
    # Test point far from the test polygon
    result = enricher.enrich_crash_record(
        lat=42.0,
        lon=-88.0
    )
    
    assert result['ward_id'] is None
    assert result['precinct_id'] is None
    assert result['senate_district_id'] is None
    assert result['house_district_id'] is None

def test_enrich_crash_records_db(mock_shapefiles, db_session):
    """Test enrichment of database records."""
    # Create test records
    records = [
        CrashRecord(
            crash_record_id='TEST001',
            crash_date='2023-01-01',
            latitude=41.87815,
            longitude=-87.62985
        ),
        CrashRecord(
            crash_record_id='TEST002',
            crash_date='2023-01-02',
            latitude=42.0,
            longitude=-88.0
        )
    ]
    
    db_session.add_all(records)
    db_session.commit()
    
    # Perform enrichment
    enricher = GISEnricher()
    enricher.enrich_crash_records(db_session)
    
    # Verify results
    record1 = db_session.query(CrashRecord).filter_by(crash_record_id='TEST001').first()
    record2 = db_session.query(CrashRecord).filter_by(crash_record_id='TEST002').first()
    
    assert record1.ward_id == 1
    assert record1.precinct_id == 101
    assert record1.senate_district_id == 7
    assert record1.house_district_id == 13
    
    assert record2.ward_id is None
    assert record2.precinct_id is None
    assert record2.senate_district_id is None
    assert record2.house_district_id is None

def test_download_shapefile(tmp_path, monkeypatch):
    """Test shapefile download functionality."""
    import zipfile
    from io import BytesIO
    
    class MockResponse:
        def __init__(self):
            # Create a simple ZIP file with a mock shapefile
            zip_buffer = BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w') as zf:
                zf.writestr('test.shp', b'mock shapefile content')
                zf.writestr('test.shx', b'mock shapefile index')
                zf.writestr('test.dbf', b'mock shapefile data')
            self.content = zip_buffer.getvalue()
        
        def raise_for_status(self):
            pass
    
    def mock_get(*args, **kwargs):
        return MockResponse()
    
    import requests
    monkeypatch.setattr(requests, "get", mock_get)
    
    # Test download
    enricher = GISEnricher()
    output_dir = tmp_path / "test_gis"
    
    enricher.download_shapefile(
        "https://example.com/shapefile.zip",
        output_dir
    )
    
    assert output_dir.exists()
    assert (output_dir / "test.shp").exists()
    assert (output_dir / "test.shx").exists()
    assert (output_dir / "test.dbf").exists()

def test_download_shapefile_failure(tmp_path, monkeypatch):
    """Test shapefile download failure handling."""
    def mock_get(*args, **kwargs):
        raise requests.RequestException("Download failed")
    
    import requests
    monkeypatch.setattr(requests, "get", mock_get)
    
    enricher = GISEnricher()
    output_dir = tmp_path / "test_gis"
    
    with pytest.raises(Exception) as exc_info:
        enricher.download_shapefile(
            "https://example.com/shapefile.zip",
            output_dir
        )
    
    assert "Download failed" in str(exc_info.value)

def test_missing_shapefiles(monkeypatch):
    """Test handling of missing shapefiles."""
    def mock_exists(self):
        return False
    
    monkeypatch.setattr(Path, "exists", mock_exists)
    
    enricher = GISEnricher()
    
    assert enricher.wards is None
    assert enricher.precincts is None
    assert enricher.senate_districts is None
    assert enricher.house_districts is None

def test_invalid_coordinates(mock_shapefiles):
    """Test handling of invalid coordinates."""
    enricher = GISEnricher()
    
    # Test with invalid coordinates
    result = enricher.enrich_crash_record(
        lat=None,
        lon=None
    )
    
    assert result['ward_id'] is None
    assert result['precinct_id'] is None
    assert result['senate_district_id'] is None
    assert result['house_district_id'] is None
