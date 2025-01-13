"""Script to set up local PostgreSQL database with PostGIS for development."""
import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def run_command(command: str) -> bool:
    """Run a shell command and return success status."""
    try:
        subprocess.run(command, shell=True, check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {e.stderr.decode()}")
        return False

def check_postgres_running() -> bool:
    """Check if PostgreSQL service is running."""
    if sys.platform == "darwin":  # macOS
        return run_command("pg_isready")
    elif sys.platform == "linux":
        return run_command("systemctl is-active --quiet postgresql")
    elif sys.platform == "win32":
        return run_command("sc query postgresql")
    return False

def create_database(
    dbname: str,
    user: str,
    password: str,
    host: str = "localhost",
    port: str = "5432"
) -> bool:
    """Create PostgreSQL database if it doesn't exist."""
    try:
        # Connect to default database to create new one
        conn = psycopg2.connect(
            dbname="postgres",
            user=user,
            password=password,
            host=host,
            port=port
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        # Check if database exists
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
        if cur.fetchone():
            logger.info(f"Database {dbname} already exists")
            return True
        
        # Create database
        cur.execute(f"CREATE DATABASE {dbname}")
        logger.info(f"Created database {dbname}")
        
        # Close connection to postgres database
        cur.close()
        conn.close()
        
        # Connect to new database to create extensions
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
        
        # Create PostGIS extension
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        logger.info("Created PostGIS extension")
        
        cur.close()
        conn.close()
        return True
    
    except Exception as e:
        logger.error(f"Failed to create database: {str(e)}")
        return False

def create_test_database(
    dbname: str,
    user: str,
    password: str,
    host: str = "localhost",
    port: str = "5432"
) -> bool:
    """Create test database."""
    test_dbname = f"{dbname}_test"
    return create_database(test_dbname, user, password, host, port)

def main():
    """Main function."""
    parser = argparse.ArgumentParser(description="Set up local PostgreSQL database")
    parser.add_argument("--dbname", default="chicago_crashes", help="Database name")
    parser.add_argument("--user", default="postgres", help="Database user")
    parser.add_argument("--password", default="", help="Database password")
    parser.add_argument("--host", default="localhost", help="Database host")
    parser.add_argument("--port", default="5432", help="Database port")
    parser.add_argument("--skip-test-db", action="store_true", help="Skip test database creation")
    
    args = parser.parse_args()
    
    # Check if PostgreSQL is running
    if not check_postgres_running():
        logger.error("PostgreSQL is not running")
        sys.exit(1)
    
    # Create main database
    if not create_database(
        args.dbname,
        args.user,
        args.password,
        args.host,
        args.port
    ):
        sys.exit(1)
    
    # Create test database
    if not args.skip_test_db:
        if not create_test_database(
            args.dbname,
            args.user,
            args.password,
            args.host,
            args.port
        ):
            sys.exit(1)
    
    # Create .env file with database configuration
    env_path = Path(__file__).resolve().parent.parent / ".env"
    with open(env_path, "w") as f:
        f.write(f"DB_USER={args.user}\n")
        f.write(f"DB_PASSWORD={args.password}\n")
        f.write(f"DB_HOST={args.host}\n")
        f.write(f"DB_PORT={args.port}\n")
        f.write(f"DB_NAME={args.dbname}\n")
        if not args.skip_test_db:
            f.write(f"TEST_DB_NAME={args.dbname}_test\n")
    
    logger.info("Setup completed successfully")

if __name__ == "__main__":
    main()
