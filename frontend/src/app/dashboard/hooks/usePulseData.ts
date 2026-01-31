import { useState, useEffect } from 'react';
import type { Pulse } from '../types';

export function usePulseData() {
    const [pulses, setPulses] = useState<Pulse[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const mockPulses: Pulse[] = [
            { message: "Review your notes on Calculus", timestamp: Date.now() - 300000 },
            { message: "You've explored 15 resources today", timestamp: Date.now() - 600000 },
            { message: "Great focus on Bitcoin design!", timestamp: Date.now() - 900000 }
        ];
        setPulses(mockPulses);
        setIsLoading(false);
    }, []);

    return { pulses, isLoading };
}
