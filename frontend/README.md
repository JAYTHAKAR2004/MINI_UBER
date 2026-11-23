# Mini Uber – AI-Powered Food Delivery & ETA Prediction Platform

Uber Eats-inspired React frontend for the **Mini-Uber-ETA** Machine Learning food delivery ETA prediction platform.

## Tech Stack
- React 18 + Vite
- Tailwind CSS
- React Router v6
- Axios (with request/response interceptors + Vite `/api` proxy)
- Recharts
- Lucide React icons

## Environment Configuration

Copy `.env.example` to `.env` if needed:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_PROXY=true
```

> **Note on CORS:** Because FastAPI (`src/api/main.py`) and Nginx (`nginx/nginx.conf`) do not expose browser CORS headers by default, Vite's dev and preview servers proxy `/api/*` directly to `VITE_API_BASE_URL`. Set `VITE_USE_PROXY=false` only if you add CORS headers at your reverse proxy.

## Running Locally

### 1. Start the Backend Stack (Docker Compose)
From the repository root (`Mini-Uber-ETA/`):
```powershell
docker compose up -d
```
This starts PostgreSQL, Redis, Redpanda/Kafka, 3 FastAPI replicas (`api1`, `api2`, `api3`), and Nginx on `http://localhost:8000`.

### 2. Install & Run the Frontend
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

### 3. Production Build & Preview
```powershell
cd frontend
npm run build
npm run preview
```

## Live vs. Demo Data Transparency
- **Live Backend Endpoints Used:**
  - `GET /` — API metadata and active replica ID
  - `GET /health` — Model loaded flag, active instance, Redis circuit breaker state
  - `POST /predict` — Real Random Forest ETA prediction (`ETAPredictionRequest`), Redis caching, PostgreSQL write, and Redpanda/Kafka event publish
  - `POST /graphql` — Strawberry GraphQL health & project query
- **Demo / Simulated Features (No Backend Endpoints Exist):**
  - Restaurant catalog & menus (`src/data/restaurants.js`)
  - Shopping cart & demo checkout (`localStorage`, no real payments)
  - 6-stage order status timeline & simulated vector delivery route map
  - Offline model metrics sourced directly from `reports/final_test_metrics.csv` and `reports/validation_model_comparison.csv`

