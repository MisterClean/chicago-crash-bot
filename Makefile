# Chicago Crash Bot Makefile

.PHONY: help setup test lint clean db gis pipeline schedule

# Variables
PYTHON := python3
PYTEST := pytest
POETRY := poetry
DB_NAME := chicago_crashes
DB_USER := postgres
DB_PASSWORD := 
DB_HOST := localhost
DB_PORT := 5432

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

setup:  ## Install dependencies and set up development environment
	$(PYTHON) -m venv venv
	. venv/bin/activate && \
	pip install poetry && \
	$(POETRY) install

test:  ## Run tests
	$(POETRY) run $(PYTEST) tests/ -v

lint:  ## Run linters and formatters
	$(POETRY) run black .
	$(POETRY) run isort .
	$(POETRY) run flake8 .

clean:  ## Clean up temporary files and artifacts
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type f -name "*.pyd" -delete
	find . -type f -name ".coverage" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name "*.egg" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".eggs" -exec rm -rf {} +
	find . -type d -name "build" -exec rm -rf {} +
	find . -type d -name "dist" -exec rm -rf {} +

db:  ## Set up local database
	$(POETRY) run python scripts/setup_local_db.py \
		--dbname $(DB_NAME) \
		--user $(DB_USER) \
		--password $(DB_PASSWORD) \
		--host $(DB_HOST) \
		--port $(DB_PORT)

gis:  ## Download GIS data
	$(POETRY) run python scripts/download_gis_data.py

pipeline:  ## Run ETL pipeline
	$(POETRY) run python -m chicago_crash_bot.cli pipeline

pipeline-initial:  ## Run initial ETL pipeline with CSV data
	@read -p "Enter path to CSV file: " csv_path; \
	$(POETRY) run python -m chicago_crash_bot.cli pipeline --initial-load --csv-path $$csv_path

schedule:  ## Schedule ETL pipeline
	@read -p "Schedule type (cron/interval): " type; \
	read -p "Schedule value: " value; \
	$(POETRY) run python scripts/schedule_pipeline.py \
		--schedule-type $$type \
		--schedule-value $$value

schedule-disable:  ## Disable scheduled pipeline
	$(POETRY) run python scripts/schedule_pipeline.py --disable

schedule-enable:  ## Enable scheduled pipeline
	$(POETRY) run python scripts/schedule_pipeline.py --enable

schedule-delete:  ## Delete scheduled pipeline
	$(POETRY) run python scripts/schedule_pipeline.py --delete

verify-gis:  ## Verify GIS data files
	$(POETRY) run python scripts/download_gis_data.py --verify-only

clean-gis:  ## Clean GIS data directory
	$(POETRY) run python scripts/download_gis_data.py --clean

setup-all: setup db gis  ## Complete setup: install dependencies, set up database, and download GIS data

# Development shortcuts
dev-clean: clean clean-gis  ## Clean all temporary files and data
	rm -rf venv/

dev-reset: dev-clean setup-all  ## Reset development environment completely

dev-test: lint test  ## Run all code quality checks and tests
