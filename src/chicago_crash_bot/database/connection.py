"""Database connection and initialization module."""
import logging
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import QueuePool

from chicago_crash_bot.config.settings import DATABASE_URL
from chicago_crash_bot.database.models import Base

logger = logging.getLogger(__name__)

def create_db_engine(url: str = DATABASE_URL) -> Engine:
    """Create SQLAlchemy engine with appropriate configuration."""
    return create_engine(
        url,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_timeout=30,
        pool_pre_ping=True,
        echo=False,
    )

def init_db(engine: Engine = None) -> None:
    """Initialize database schema."""
    if engine is None:
        engine = create_db_engine()
    
    try:
        # Create PostGIS extension if it doesn't exist
        engine.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        
        # Create all tables
        Base.metadata.create_all(engine)
        logger.info("Database schema created successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise

@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Get a database session using context manager.
    
    Usage:
        with get_db_session() as session:
            session.query(...)
    """
    engine = create_db_engine()
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    
    try:
        yield session
        session.commit()
    except Exception as e:
        session.rollback()
        logger.error(f"Database session error: {str(e)}")
        raise
    finally:
        session.close()

def get_or_create(session: Session, model: Base, **kwargs):
    """Get an existing record or create a new one."""
    instance = session.query(model).filter_by(**kwargs).first()
    if instance:
        return instance, False
    
    instance = model(**kwargs)
    session.add(instance)
    session.commit()
    return instance, True
