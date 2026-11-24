import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker, declarative_base

# Load project environment variables
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# Build database URL safely (supports managed DATABASE_URL / POSTGRES_URL or discrete env vars)
def _resolve_database_url():
    """Return a SQLAlchemy PostgreSQL URL from managed env vars or discrete POSTGRES_* fields."""
    raw_url = (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "").strip()
    if raw_url:
        if raw_url.startswith("postgres://"):
            return "postgresql+psycopg://" + raw_url[len("postgres://"):]
        if raw_url.startswith("postgresql://"):
            return "postgresql+psycopg://" + raw_url[len("postgresql://"):]
        return raw_url

    return URL.create(
        drivername="postgresql+psycopg",
        username=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        database=os.getenv("POSTGRES_DB"),
    )


DATABASE_URL = _resolve_database_url()


# SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={
        "connect_timeout": 5
    },
)

# Database sessions
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for database models
Base = declarative_base()


def test_db_connection():
    with engine.connect() as connection:
        result = connection.execute(text("SELECT 1"))
        return result.scalar()
