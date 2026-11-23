import { useCallback, useEffect, useState } from 'react';
import {
  fetchGraphQLHealth,
  fetchHealth,
  fetchRootInfo,
} from '../services/etaService';

export function useBackendHealth({ autoPollMs = 0 } = {}) {
  const [state, setState] = useState({
    loading: true,
    health: null,
    healthError: null,
    rootInfo: null,
    rootError: null,
    graphql: null,
    graphqlError: null,
    lastChecked: null,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const [healthRes, rootRes, gqlRes] = await Promise.allSettled([
      fetchHealth(),
      fetchRootInfo(),
      fetchGraphQLHealth(),
    ]);

    setState({
      loading: false,
      health: healthRes.status === 'fulfilled' ? healthRes.value : null,
      healthError:
        healthRes.status === 'rejected'
          ? healthRes.reason?.message || 'Health check failed'
          : null,
      rootInfo: rootRes.status === 'fulfilled' ? rootRes.value : null,
      rootError:
        rootRes.status === 'rejected'
          ? rootRes.reason?.message || 'Root check failed'
          : null,
      graphql: gqlRes.status === 'fulfilled' ? gqlRes.value : null,
      graphqlError:
        gqlRes.status === 'rejected'
          ? gqlRes.reason?.message || 'GraphQL unavailable'
          : null,
      lastChecked: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoPollMs || autoPollMs <= 0) return undefined;
    const timer = setInterval(refresh, autoPollMs);
    return () => clearInterval(timer);
  }, [autoPollMs, refresh]);

  return {
    ...state,
    refresh,
  };
}

