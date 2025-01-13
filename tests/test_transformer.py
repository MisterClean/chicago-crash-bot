"""Tests for the data transformer module."""
import datetime
from typing import Dict

import pandas as pd
import pytest
from geoalchemy2.elements import WKBElement
from shapely.geometry import Point

from chicago_crash_bot.ingestion.transformer import CrashDataTransformer

@pytest.fixture
def sample_record() -> Dict:
    """Sample crash record for testing."""
    return {
        'crash_record_id': 'TEST123',
        'crash_date': '2023-01-01T12:00:00',
        'crash_date_est_i': 'Y',
        'posted_speed_limit': '30',
        'latitude': '41.8781',
        'longitude': '-87.6298',
        'intersection_related_i': 'true',
        'injuries_total': '2',
        'data_source': 'test'
    }

@pytest.fixture
def sample_dataframe() -> pd.DataFrame:
    """Sample DataFrame for testing."""
    data = {
        'crash_record_id': ['TEST123', 'TEST456'],
        'crash_date': ['2023-01-01T12:00:00', '2023-01-02T14:30:00'],
        'crash_date_est_i': ['Y', 'N'],
        'posted_speed_limit': ['30', '45'],
        'latitude': ['41.8781', '41.8782'],
        'longitude': ['-87.6298', '-87.6299'],
        'intersection_related_i': ['true', 'false'],
        'injuries_total': ['2', '0']
    }
    return pd.DataFrame(data)

def test_transform_record_basic_fields():
    """Test basic field transformations."""
    transformer = CrashDataTransformer()
    record = {
        'crash_record_id': 'TEST123',
        'posted_speed_limit': '30',
        'injuries_total': '2'
    }
    
    result = transformer.transform_record(record)
    
    assert result['crash_record_id'] == 'TEST123'
    assert result['posted_speed_limit'] == 30
    assert result['injuries_total'] == 2
    assert result['etl_version'] == '1.0'

def test_transform_record_boolean_conversion():
    """Test boolean field conversions."""
    transformer = CrashDataTransformer()
    record = {
        'crash_record_id': 'TEST123',
        'intersection_related_i': 'Y',
        'hit_and_run_i': 'true',
        'photos_taken_i': '1'
    }
    
    result = transformer.transform_record(record)
    
    assert result['intersection_related_i'] is True
    assert result['hit_and_run_i'] is True
    assert result['photos_taken_i'] is True

def test_transform_record_datetime_parsing():
    """Test datetime field parsing."""
    transformer = CrashDataTransformer()
    record = {
        'crash_record_id': 'TEST123',
        'crash_date': '2023-01-01T12:00:00'
    }
    
    result = transformer.transform_record(record)
    
    assert isinstance(result['crash_date'], datetime.datetime)
    assert result['crash_date'].year == 2023
    assert result['crash_date'].month == 1
    assert result['crash_date'].day == 1

def test_transform_record_location_creation():
    """Test creation of PostGIS geometry from lat/long."""
    transformer = CrashDataTransformer()
    record = {
        'crash_record_id': 'TEST123',
        'latitude': '41.8781',
        'longitude': '-87.6298'
    }
    
    result = transformer.transform_record(record)
    
    assert isinstance(result['location'], WKBElement)
    assert result['latitude'] == pytest.approx(41.8781)
    assert result['longitude'] == pytest.approx(-87.6298)

def test_transform_dataframe(sample_dataframe):
    """Test DataFrame transformation."""
    transformer = CrashDataTransformer()
    result = transformer.transform_dataframe(sample_dataframe)
    
    assert len(result) == 2
    assert result['posted_speed_limit'].dtype == 'float64'
    assert result['intersection_related_i'].dtype == 'bool'
    assert pd.api.types.is_datetime64_any_dtype(result['crash_date'])
    assert result['etl_version'].iloc[0] == '1.0'

def test_boolean_conversion():
    """Test various boolean value conversions."""
    transformer = CrashDataTransformer()
    
    assert transformer._convert_to_boolean('Y') is True
    assert transformer._convert_to_boolean('N') is False
    assert transformer._convert_to_boolean('true') is True
    assert transformer._convert_to_boolean('false') is False
    assert transformer._convert_to_boolean('1') is True
    assert transformer._convert_to_boolean('0') is False
    assert transformer._convert_to_boolean(None) is False
    assert transformer._convert_to_boolean('') is False

def test_numeric_conversion():
    """Test numeric value conversions."""
    transformer = CrashDataTransformer()
    
    assert transformer._convert_to_numeric('42') == 42
    assert transformer._convert_to_numeric('3.14') == 3.14
    assert transformer._convert_to_numeric('invalid') is None
    assert transformer._convert_to_numeric(None) is None
    assert transformer._convert_to_numeric('') is None

def test_datetime_parsing():
    """Test datetime parsing."""
    transformer = CrashDataTransformer()
    
    # Test ISO format
    dt = transformer._parse_datetime('2023-01-01T12:00:00')
    assert isinstance(dt, datetime.datetime)
    assert dt.year == 2023
    
    # Test date only
    dt = transformer._parse_datetime('2023-01-01')
    assert isinstance(dt, datetime.datetime)
    assert dt.year == 2023
    
    # Test invalid formats
    assert transformer._parse_datetime('invalid') is None
    assert transformer._parse_datetime(None) is None
    assert transformer._parse_datetime('') is None
