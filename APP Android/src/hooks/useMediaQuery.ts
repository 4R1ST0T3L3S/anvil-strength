import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia(query);
        const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
        // Para Safari antiguo hay que usar addListener
        if (mq.addEventListener) {
            mq.addEventListener('change', listener);
        } else {
            mq.addListener(listener);
        }
        return () => {
            if (mq.removeEventListener) {
                mq.removeEventListener('change', listener);
            } else {
                mq.removeListener(listener);
            }
        };
    }, [query]);

    return matches;
}
