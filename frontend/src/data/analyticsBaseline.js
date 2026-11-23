/**
 * Real offline evaluation metrics read directly from:
 * - reports/final_test_metrics.csv
 * - reports/validation_model_comparison.csv
 * - data/processed/train_processed.parquet (36,467 rows)
 */
export const FINAL_TEST_METRICS = {
  model: 'Random Forest',
  mae: 3.21,
  rmse: 4.08,
  r2: 0.8114,
  datasetRows: 36467,
  meanActualEta: 26.29,
};

export const MODEL_COMPARISON = [
  {
    model: 'Random Forest',
    mae: 3.26,
    rmse: 4.13,
    r2: 0.807,
    selected: true,
  },
  {
    model: 'Gradient Boosting',
    mae: 3.79,
    rmse: 4.75,
    r2: 0.745,
    selected: false,
  },
  {
    model: 'Linear Regression',
    mae: 4.85,
    rmse: 6.1,
    r2: 0.578,
    selected: false,
  },
];

export const DATASET_ETA_DISTRIBUTION = [
  { bucket: '0–15 min', count: 4414 },
  { bucket: '15–25 min', count: 13790 },
  { bucket: '25–35 min', count: 11891 },
  { bucket: '35–45 min', count: 5117 },
  { bucket: '45–60 min', count: 1255 },
];

/**
 * Sample operational breakdown — clearly flagged in AnalyticsPage because
 * no live order-history / analytics aggregate endpoint exists on the backend.
 */
export const SAMPLE_ORDER_STATUS_DISTRIBUTION = [
  { name: 'Delivered', value: 1420, color: '#E23744' },
  { name: 'On the way', value: 185, color: '#1C1C1C' },
  { name: 'Preparing', value: 112, color: '#52525B' },
  { name: 'Confirmed', value: 64, color: '#A1A1AA' },
];

