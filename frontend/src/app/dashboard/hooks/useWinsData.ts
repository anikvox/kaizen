import { useState, useEffect } from 'react';
import type { WinWithParsedData } from '../types';

export function useWinsData() {
    const [wins, setWins] = useState<WinWithParsedData[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const mockWins: WinWithParsedData[] = [
            {
                id: 1,
                focus_item: "Bitcoin Design",
                time_spent: 3600000,
                time_spent_hours: 1,
                recorded_at: Date.now() - 86400000
            }
        ];
        setWins(mockWins);
        setIsLoading(false);
    }, []);

    return { wins, isLoading };
}
