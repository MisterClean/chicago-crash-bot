# Chicago Crash Bot

An ETL pipeline for processing Chicago traffic crash data with GIS enrichment. This application fetches crash data from the Chicago Data Portal, processes it, and stores it in a PostgreSQL database with PostGIS extensions for spatial analysis.

## Features

- Initial historical data load from CSV
- Incremental updates via SODA API
- GIS enrichment with ward, precinct, and district boundaries
- Robust error handling and retry logic
- ETL job logging and version tracking
- Prefect-based workflow orchestration
- CLI interface for easy operation

## Prerequisites

- Python 3.9+
- PostgreSQL with PostGIS extension
- Chicago Data Portal API access (public)
- GIS shapefiles for:
  - Chicago Wards
  - Police Precincts
  - IL Senate Districts
  - IL House Districts

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chicago-crash-bot.git
   cd chicago-crash-bot
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install poetry
   poetry install
   ```

4. Create a `.env` file with your database configuration:
   ```
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=chicago_crashes
   ```

## Database Setup

1. Create a PostgreSQL database:
   ```sql
   CREATE DATABASE chicago_crashes;
   ```

2. Enable PostGIS extension:
   ```sql
   CREATE EXTENSION postgis;
   ```

3. Initialize the database schema:
   ```bash
   python -m chicago_crash_bot.cli setup --skip-gis
   ```

## GIS Data Setup

Download required shapefiles:
```bash
python -m chicago_crash_bot.cli setup --skip-db
```

## Usage

### Initial Historical Load

1. Download the full CSV dataset from the Chicago Data Portal
2. Run the initial load:
   ```bash
   python -m chicago_crash_bot.cli pipeline --initial-load --csv-path /path/to/crashes.csv
   ```

### Incremental Updates

Run the incremental update pipeline:
```bash
python -m chicago_crash_bot.cli pipeline
```

This will:
1. Fetch new/updated records since the last run
2. Transform and load the data
3. Perform GIS enrichment
4. Update tracking tables

## Data Model

### Main Tables

- `fact_crashes`: Primary crash records
- `etl_log`: ETL job execution history
- `data_version`: Tracks last processed record

### Key Fields

#### fact_crashes
- `crash_record_id` (PK): Unique identifier
- `crash_date`: Date and time of crash
- `location`: PostGIS geometry point
- `ward_id`: Chicago ward
- `precinct_id`: Police precinct
- `senate_district_id`: IL Senate district
- `house_district_id`: IL House district
- Various crash details, conditions, and injury counts

## Development

### Project Structure

```
chicago-crash-bot/
├── src/
│   └── chicago_crash_bot/
│       ├── config/         # Configuration settings
│       ├── database/       # Database models and connection
│       ├── gis/           # GIS processing
│       ├── ingestion/     # Data fetching and transformation
│       └── pipelines/     # ETL pipeline orchestration
├── data/
│   ├── raw/              # Raw CSV files
│   ├── processed/        # Intermediate processed files
│   └── gis/             # GIS shapefiles
├── logs/                 # Application logs
├── tests/               # Test suite
└── README.md
```

### Running Tests

```bash
pytest tests/
```

## Future Enhancements

- Web dashboards for data visualization
- Bluesky bot integration for daily summaries
- Additional GIS layers and analysis
- Real-time crash notifications
- Machine learning for crash prediction

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
