"""Tests for the data fetcher module."""
import datetime
from pathlib import Path

import pandas as pd
import pytest
import requests

from chicago_crash_bot.ingestion.data_fetcher import ChicagoCrashDataFetcher

def test_download_csv(tmp_path, monkeypatch):
    """Test CSV download functionality."""
    # Mock requests.get
    class MockResponse:
        def __init__(self):
            self.status_code = 200
            self.content = b"crash_record_id,crash_date\nTEST001,2023-01-01"
        
        def raise_for_status(self):
            pass
        
        def iter_content(self, chunk_size):
            yield self.content
    
    def mock_get(*args, **kwargs):
        return MockResponse()
    
    monkeypatch.setattr(requests, "get", mock_get)
    
    # Test download
    fetcher = ChicagoCrashDataFetcher()
    output_path = tmp_path / "test_crashes.csv"
    result_path = fetcher.download_csv(output_path)
    
    assert result_path.exists()
    assert result_path.read_text() == "crash_record_id,crash_date\nTEST001,2023-01-01"

def test_parse_csv_to_records(sample_csv_path):
    """Test CSV parsing functionality."""
    fetcher = ChicagoCrashDataFetcher()
    chunks = list(fetcher.parse_csv_to_records(sample_csv_path, chunksize=2))
    
    assert len(chunks) == 2  # Should split 3 records into 2 chunks
    assert isinstance(chunks[0], pd.DataFrame)
    assert len(chunks[0]) == 2  # First chunk has 2 records
    assert len(chunks[1]) == 1  # Second chunk has 1 record
    
    # Check column names are lowercase
    assert all(col.islower() for col in chunks[0].columns)

def test_get_soda_records(mock_soda_client):
    """Test SODA API record fetching."""
    fetcher = ChicagoCrashDataFetcher()
    start_date = datetime.datetime(2023, 1, 1)
    end_date = datetime.datetime(2023, 1, 31)
    
    records = list(fetcher.get_soda_records(start_date, end_date))
    
    assert len(records) == 1  # Our mock returns one batch
    assert len(records[0]) == 1  # With one record
    assert records[0][0]['crash_record_id'] == 'SODA001'

def test_get_recent_records(mock_soda_client):
    """Test fetching recent records."""
    fetcher = ChicagoCrashDataFetcher()
    records = list(fetcher.get_recent_records(days=7))
    
    assert len(records) == 1
    assert isinstance(records[0], list)
    assert records[0][0]['crash_date'] == '2023-01-04T09:15:00'

def test_get_records_since(mock_soda_client):
    """Test fetching records since a specific date."""
    fetcher = ChicagoCrashDataFetcher()
    since_date = datetime.datetime(2023, 1, 1)
    records = list(fetcher.get_records_since(since_date))
    
    assert len(records) == 1
    assert isinstance(records[0], list)
    assert records[0][0]['injuries_total'] == '1'

def test_csv_download_retry(tmp_path, monkeypatch):
    """Test CSV download retry logic."""
    class FailingResponse:
        def __init__(self):
            self.status_code = 500
        
        def raise_for_status(self):
            raise requests.HTTPError("Server error")
    
    class SuccessResponse:
        def __init__(self):
            self.status_code = 200
            self.content = b"crash_record_id,crash_date\nTEST001,2023-01-01"
        
        def raise_for_status(self):
            pass
        
        def iter_content(self, chunk_size):
            yield self.content
    
    responses = [FailingResponse(), SuccessResponse()]
    
    def mock_get(*args, **kwargs):
        return responses.pop(0)
    
    monkeypatch.setattr(requests, "get", mock_get)
    
    fetcher = ChicagoCrashDataFetcher()
    output_path = tmp_path / "test_crashes.csv"
    result_path = fetcher.download_csv(output_path)
    
    assert result_path.exists()
    assert result_path.read_text() == "crash_record_id,crash_date\nTEST001,2023-01-01"

def test_csv_download_all_retries_fail(tmp_path, monkeypatch):
    """Test CSV download when all retries fail."""
    def mock_get(*args, **kwargs):
        raise requests.HTTPError("Server error")
    
    monkeypatch.setattr(requests, "get", mock_get)
    
    fetcher = ChicagoCrashDataFetcher()
    output_path = tmp_path / "test_crashes.csv"
    
    with pytest.raises(requests.HTTPError):
        fetcher.download_csv(output_path)

def test_parse_csv_invalid_file():
    """Test CSV parsing with invalid file."""
    fetcher = ChicagoCrashDataFetcher()
    
    with pytest.raises(FileNotFoundError):
        list(fetcher.parse_csv_to_records(Path("nonexistent.csv")))

def test_parse_csv_corrupted_file(tmp_path):
    """Test CSV parsing with corrupted file."""
    corrupted_csv = tmp_path / "corrupted.csv"
    corrupted_csv.write_text("crash_record_id,crash_date\nTEST001,invalid_date,extra_column")
    
    fetcher = ChicagoCrashDataFetcher()
    
    with pytest.raises(pd.errors.ParserError):
        list(fetcher.parse_csv_to_records(corrupted_csv))

def test_soda_pagination(mock_soda_client, monkeypatch):
    """Test SODA API pagination."""
    # Mock paginated responses
    responses = [
        [{'crash_record_id': f'SODA00{i}'} for i in range(1, 4)],
        [{'crash_record_id': f'SODA00{i}'} for i in range(4, 7)],
        []  # Empty response to end pagination
    ]
    
    class MockPaginatedClient:
        def get(self, dataset_id, **kwargs):
            if not responses:
                return []
            return responses.pop(0)
    
    def mock_init(self, domain, app_token=None):
        self.domain = domain
        self.app_token = app_token
    
    from chicago_crash_bot.ingestion import data_fetcher
    monkeypatch.setattr(data_fetcher.Socrata, '__init__', mock_init)
    monkeypatch.setattr(data_fetcher.Socrata, 'get', MockPaginatedClient.get)
    
    fetcher = ChicagoCrashDataFetcher()
    records = list(fetcher.get_soda_records(batch_size=3))
    
    assert len(records) == 2  # Two batches of records
    assert len(records[0]) == 3  # First batch has 3 records
    assert len(records[1]) == 3  # Second batch has 3 records
    assert records[0][0]['crash_record_id'] == 'SODA001'
    assert records[1][2]['crash_record_id'] == 'SODA006'
