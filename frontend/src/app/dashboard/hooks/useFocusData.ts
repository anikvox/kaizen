import { useState, useEffect } from 'react';
import type { FocusWithParsedData } from '../types';

interface UseFocusDataReturn {
    currentFocus: FocusWithParsedData | null;
    focusHistory: FocusWithParsedData[];
    isLoading: boolean;
    error: Error | null;
}

export function useFocusData(): UseFocusDataReturn {
    const [data, setData] = useState<{ currentFocus: FocusWithParsedData | null, focusHistory: FocusWithParsedData[] }>({
        currentFocus: null,
        focusHistory: []
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Mock data for now, you can replace this with actual fetch
        const mockHistory: FocusWithParsedData[] = [
            {
                id: 1,
                item: "Bitcoin Design System",
                focus_item: "Bitcoin Design System",
                keywords: ["bitcoin", "design", "crypto"],
                time_spent: [{ start: Date.now() - 3600000, end: null }],
                last_updated: Date.now(),
                duration: 3600000
            },
            {
                id: 2,
                item: "Fundamental Theorem of Calculus",
                focus_item: "Fundamental Theorem of Calculus",
                keywords: ["math", "calculus"],
                time_spent: [{ start: Date.now() - 7200000, end: Date.now() - 5400000 }],
                last_updated: Date.now() - 5400000,
                duration: 1800000
            }
        ];

        setData({
            currentFocus: mockHistory[0],
            focusHistory: mockHistory
        });
        setIsLoading(false);
    }, []);

    return {
        ...data,
        isLoading,
        error: null
    };
}
