# P10 – Docker and Continuous Deployment Report

## 1. Objective
The objective of P10 is to containerize the Mini-Uber-ETA application and establish an automated CI/CD pipeline for validation, Docker image building, and publishing.

## 2. Continuous Integration (CI)
File: `.github/workflows/ci.yml`

The CI workflow is triggered by:
- Push events to main and master branches.
- Pull requests targeting main and master.
- Manual workflow dispatch.

Implemented steps:
1. Checkout repository.
2. Set up Python 3.12.
3. Install project dependencies and pytest.
4. Compile Python files using compileall.
5. Execute automated tests using pytest.

## 3. Continuous Deployment (CD)
File: `.github/workflows/cd.yml`

The CD workflow supports:
- Execution after successful CI completion on main.
- Manual execution through workflow dispatch.
- Downloading the trained ETA model.
- Docker Buildx configuration.
- Authentication with GitHub Container Registry (GHCR).
- Docker image building and publishing.

Registry:
`ghcr.io`

Image:
`ghcr.io/jaythakar2004/mini-uber-eta`

Image tags:
- latest
- Commit SHA

Note: The workflow automates Docker image publishing. Deployment to a separate production server is not configured.

## 4. Dockerfile
File: `Dockerfile`

Configuration:
- Base image: python:3.12-slim
- Working directory: /app
- Dependencies installed from requirements.txt.
- Application source copied into the image.
- Trained model copied into the image.
- Application port: 8000.
- Health check configured for `/health`.
- Application served using Uvicorn.

## 5. Docker Compose Architecture
File: `docker-compose.yml`

The application uses seven services:

1. PostgreSQL – Persistent relational database.
2. Redis – Prediction caching.
3. Redpanda – Kafka-compatible event streaming.
4. API1 – First FastAPI instance.
5. API2 – Second FastAPI instance.
6. API3 – Third FastAPI instance.
7. Nginx – Reverse proxy and load balancer.

Persistent volumes are configured for PostgreSQL, Redis and Redpanda.

PostgreSQL and Redis have Docker health checks.

## 6. Container Verification

The following services were observed running through `docker compose ps`:

- mini_uber_postgres – Healthy
- mini_uber_redis – Healthy
- mini_uber_kafka – Running
- mini_uber_api1 – Healthy
- mini_uber_api2 – Healthy
- mini_uber_api3 – Healthy
- mini_uber_nginx – Running

Docker Compose configuration validation completed without reported errors.

## 7. Application Health Verification

Endpoint:
`http://localhost:8000/health`

Observed response:
- Status: healthy
- Model loaded: True
- Redis circuit: CLOSED

The health endpoint responded successfully through Nginx.

## 8. Load Balancing Verification

Nine consecutive requests were sent through the Nginx endpoint.

Observed API instance sequence:

API1 → API2 → API3
API1 → API2 → API3
API1 → API2 → API3

Result:
- Total requests: 9
- API instances: 3
- Requests handled per instance: 3
- Round-robin routing: Passed

## 9. Limitations and Future Scope

- Automatic deployment to a production server is not configured.
- Live CI execution should be checked in GitHub Actions for the latest commit.
- Production deployment, monitoring and automated rollback can be added in future.

## 10. Conclusion

The Mini-Uber-ETA application has a Docker-based multi-service architecture with three FastAPI instances, PostgreSQL, Redis, Redpanda and Nginx.

The CI/CD workflows automate code validation and Docker image publishing to GHCR. Docker Compose configuration validation, container health checks, application health checks and round-robin load balancing were verified.

The project demonstrates containerization, automated validation, container registry publishing and multi-instance application deployment locally.
