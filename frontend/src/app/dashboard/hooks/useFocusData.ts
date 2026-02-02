import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { BackendFocus } from '../types';
import { FocusService } from '../lib/focus';

interface UseFocusDataReturn {
    currentFocus: BackendFocus | null;
    focusHistory: BackendFocus[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
}

// Poll every 30 seconds for new focus data
const POLL_INTERVAL_MS = 30 * 1000;

export function useFocusData(): UseFocusDataReturn {
    const { getToken } = useAuth();
    const [data, setData] = useState<{ currentFocus: BackendFocus | null, focusHistory: BackendFocus[] }>({
        currentFocus: null,
        focusHistory: []
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchFocusData = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) {
                setError(new Error('Not authenticated'));
                setIsLoading(false);
                return;
            }

            const focusService = new FocusService(token);

            // Fetch latest focus and history in parallel
            const [latest, history] = await Promise.all([
                focusService.getLatestFocus(),
                focusService.getFocusHistory(10, 0)
            ]);

            setData({
                currentFocus: latest,
                focusHistory: history
            });
            setError(null);
        } catch (err) {
            console.error('Error fetching focus data:', err);
            setError(err instanceof Error ? err : new Error('Unknown error'));
        } finally {
            setIsLoading(false);
        }
    }, [getToken]);

    // Initial fetch
    useEffect(() => {
        fetchFocusData();
    }, [fetchFocusData]);

    // Set up polling
    useEffect(() => {
        const interval = setInterval(() => {
            fetchFocusData();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [fetchFocusData]);

    return {
        ...data,
        isLoading,
        error,
        refetch: fetchFocusData
    };
}
