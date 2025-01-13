"""Data transformer module for cleaning and standardizing crash data."""
import logging
from datetime import datetime
from typing import Dict, List, Union

import pandas as pd
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

logger = logging.getLogger(__name__)

class CrashDataTransformer:
    """Transforms crash data into standardized format for database insertion."""
    
    # Column mapping from source to database schema
    COLUMN_MAP = {
        'crash_record_id': 'crash_record_id',
        'crash_date': 'crash_date',
        'crash_date_est_i': 'crash_date_est_i',
        'posted_speed_limit': 'posted_speed_limit',
        'traffic_control_device': 'traffic_control_device',
        'device_condition': 'device_condition',
        'weather_condition': 'weather_condition',
        'lighting_condition': 'lighting_condition',
        'first_crash_type': 'first_crash_type',
        'trafficway_type': 'trafficway_type',
        'lane_cnt': 'lane_cnt',
        'alignment': 'alignment',
        'roadway_surface_cond': 'roadway_surface_cond',
        'road_defect': 'road_defect',
        'report_type': 'report_type',
        'crash_type': 'crash_type',
        'intersection_related_i': 'intersection_related_i',
        'not_right_of_way_i': 'not_right_of_way_i',
        'hit_and_run_i': 'hit_and_run_i',
        'damage': 'damage',
        'date_police_notified': 'date_police_notified',
        'prim_contributory_cause': 'prim_contributory_cause',
        'sec_contributory_cause': 'sec_contributory_cause',
        'street_no': 'street_no',
        'street_direction': 'street_direction',
        'street_name': 'street_name',
        'beat_of_occurrence': 'beat_of_occurrence',
        'photos_taken_i': 'photos_taken_i',
        'statements_taken_i': 'statements_taken_i',
        'dooring_i': 'dooring_i',
        'work_zone_i': 'work_zone_i',
        'work_zone_type': 'work_zone_type',
        'workers_present_i': 'workers_present_i',
        'num_units': 'num_units',
        'most_severe_injury': 'most_severe_injury',
        'injuries_total': 'injuries_total',
        'injuries_fatal': 'injuries_fatal',
        'injuries_incapacitating': 'injuries_incapacitating',
        'injuries_non_incapacitating': 'injuries_non_incapacitating',
        'injuries_reported_not_evident': 'injuries_reported_not_evident',
        'injuries_no_indication': 'injuries_no_indication',
        'injuries_unknown': 'injuries_unknown',
        'crash_hour': 'crash_hour',
        'crash_day_of_week': 'crash_day_of_week',
        'crash_month': 'crash_month',
        'latitude': 'latitude',
        'longitude': 'longitude'
    }

    # Boolean columns that need conversion from string
    BOOLEAN_COLUMNS = [
        'crash_date_est_i',
        'intersection_related_i',
        'not_right_of_way_i',
        'hit_and_run_i',
        'photos_taken_i',
        'statements_taken_i',
        'dooring_i',
        'work_zone_i',
        'workers_present_i'
    ]

    # Numeric columns that need conversion
    NUMERIC_COLUMNS = [
        'posted_speed_limit',
        'lane_cnt',
        'street_no',
        'beat_of_occurrence',
        'num_units',
        'injuries_total',
        'injuries_fatal',
        'injuries_incapacitating',
        'injuries_non_incapacitating',
        'injuries_reported_not_evident',
        'injuries_no_indication',
        'injuries_unknown',
        'crash_hour',
        'crash_day_of_week',
        'crash_month',
        'latitude',
        'longitude'
    ]

    @classmethod
    def transform_record(cls, record: Dict) -> Dict:
        """Transform a single record into database format.
        
        Args:
            record: Dictionary containing crash record data
        
        Returns:
            Transformed record ready for database insertion
        """
        transformed = {}
        
        # Map columns using standard mapping
        for source_col, target_col in cls.COLUMN_MAP.items():
            if source_col in record:
                transformed[target_col] = record[source_col]
        
        # Convert boolean fields
        for col in cls.BOOLEAN_COLUMNS:
            if col in transformed:
                transformed[col] = cls._convert_to_boolean(transformed[col])
        
        # Convert numeric fields
        for col in cls.NUMERIC_COLUMNS:
            if col in transformed:
                transformed[col] = cls._convert_to_numeric(transformed[col])
        
        # Convert datetime fields
        if 'crash_date' in transformed:
            transformed['crash_date'] = cls._parse_datetime(transformed['crash_date'])
        if 'date_police_notified' in transformed:
            transformed['date_police_notified'] = cls._parse_datetime(transformed['date_police_notified'])
        
        # Create geometry point if lat/long available
        if all(k in transformed for k in ['latitude', 'longitude']):
            try:
                point = Point(transformed['longitude'], transformed['latitude'])
                transformed['location'] = from_shape(point, srid=4326)
            except Exception as e:
                logger.warning(f"Failed to create geometry point: {str(e)}")
        
        # Add ETL tracking fields
        transformed['etl_version'] = '1.0'
        transformed['data_source'] = record.get('data_source', 'unknown')
        
        return transformed

    @classmethod
    def transform_dataframe(cls, df: pd.DataFrame) -> pd.DataFrame:
        """Transform a DataFrame of records.
        
        Args:
            df: DataFrame containing crash records
        
        Returns:
            Transformed DataFrame ready for database insertion
        """
        # Lowercase column names
        df.columns = df.columns.str.lower()
        
        # Map columns
        df = df.rename(columns=cls.COLUMN_MAP)
        
        # Convert boolean columns
        for col in cls.BOOLEAN_COLUMNS:
            if col in df.columns:
                df[col] = df[col].apply(cls._convert_to_boolean)
        
        # Convert numeric columns
        for col in cls.NUMERIC_COLUMNS:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Convert datetime columns
        if 'crash_date' in df.columns:
            df['crash_date'] = pd.to_datetime(df['crash_date'])
        if 'date_police_notified' in df.columns:
            df['date_police_notified'] = pd.to_datetime(df['date_police_notified'])
        
        # Add ETL tracking columns
        df['etl_version'] = '1.0'
        df['data_source'] = df.get('data_source', 'unknown')
        
        return df

    @staticmethod
    def _convert_to_boolean(value: Union[str, bool, int, None]) -> bool:
        """Convert various input formats to boolean."""
        if pd.isna(value) or value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            return value.lower() in ('true', 't', 'yes', 'y', '1')
        return False

    @staticmethod
    def _convert_to_numeric(value: Union[str, int, float, None]) -> Union[int, float, None]:
        """Convert string to numeric, handling invalid values."""
        if pd.isna(value) or value is None:
            return None
        try:
            return pd.to_numeric(value)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_datetime(value: Union[str, datetime, None]) -> Optional[datetime]:
        """Parse datetime from various formats."""
        if pd.isna(value) or value is None:
            return None
        if isinstance(value, datetime):
            return value
        try:
            return pd.to_datetime(value)
        except (ValueError, TypeError):
            return None
