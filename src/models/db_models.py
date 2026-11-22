from datetime import datetime, timezone

from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from src.database import Base


class ETAPrediction(Base):
    __tablename__ = "eta_predictions"

    id = Column(Integer, primary_key=True, index=True)

    input_features = Column(JSON, nullable=False)

    predicted_eta_minutes = Column(Float, nullable=False)

    model_name = Column(String(100), nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
