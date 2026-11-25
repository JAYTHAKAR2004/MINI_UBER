"""Idempotent CLI seed script for the 12-city demo restaurant catalog."""
from sqlalchemy import func

from src.api.main import ensure_orders_table
from src.database import SessionLocal
from src.models.db_models import Restaurant
from src.restaurants.catalog import seed_restaurants


def main():
    ensure_orders_table()
    db = SessionLocal()
    try:
        inserted = seed_restaurants(db)
        counts = (
            db.query(Restaurant.city, func.count(Restaurant.id))
            .group_by(Restaurant.city)
            .order_by(Restaurant.city)
            .all()
        )
        total = sum(c for _, c in counts)
        print(f"Seed complete: inserted={inserted}, total={total}")
        for city, count in counts:
            print(f"  - {city}: {count}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

