import strawberry
from typing import Optional


@strawberry.type
class ETAResult:
    prediction_id: Optional[int]
    predicted_eta: float
    status: str


@strawberry.type
class Query:

    @strawberry.field
    def hello(self) -> str:
        return "Welcome to Mini Uber ETA GraphQL API!"

    @strawberry.field
    def project_info(self) -> str:
        return "Real-time Food Delivery ETA Prediction System"

    @strawberry.field
    def health(self) -> str:
        return "Mini Uber ETA API is healthy"


schema = strawberry.Schema(query=Query)