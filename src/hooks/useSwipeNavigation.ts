import { useNavigate } from 'react-router-dom';
import { useDrag } from '@use-gesture/react';

interface SwipeConfig {
    threshold?: number;
    // You can add more config options here safely if needed in the future
}

export function useSwipeNavigation(config: SwipeConfig = {}) {
    const navigate = useNavigate();
    const { threshold = 100 } = config;

    // We use the bind function returned by useDrag to attach to elements
    const bind = useDrag(({ movement: [mx], direction: [xDir], velocity: [vx], last }) => {
        // If the user swipes right (positive x movement)
        // and matches threshold and velocity criteria
        if (mx > threshold && vx > 0.2 && xDir > 0) {
            if (last) {
                navigate(-1);
            }
        }
    }, {
        filterTaps: true,
        rubberband: true,
        // Ensure we don't block vertical scrolling
        axis: 'x'
    });

    return bind;
}
