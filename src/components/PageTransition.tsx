import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { useNavigate, useLocation } from 'react-router-dom';

interface PageTransitionProps {
    children: ReactNode;
}

export const PageTransition = ({ children }: PageTransitionProps) => {
    const navigate = useNavigate();
    const location = useLocation();

    // Root paths where swipe-back should be disabled to prevent exiting the app context
    const isRootPath = ['/', '/dashboard'].includes(location.pathname);

    // Bind the drag gesture
    const bind = useDrag(
        ({ movement: [mx], velocity: [vx], direction: [dx], cancel, last }) => {
            // Logic:
            // 1. Must be a right swipe (mx > 0, dx > 0)
            // 2. Must not be on a root path
            if (isRootPath || mx <= 0) return;

            // Thresholds: Moved at least 100px OR moved 50px with high velocity
            if (last && (mx > 100 || (mx > 50 && vx > 0.5))) {
                navigate(-1);
            }
        },
        {
            from: () => [0, 0],
            filterTaps: true,
            rubberband: true,
            axis: 'x', // restrict to horizontal movement
        }
    );

    return (
        <motion.div
            {...(bind() as any)} // Attach gesture handlers
            className="min-h-screen w-full touch-pan-y" // allow vertical scroll, handle horizontal
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ touchAction: 'pan-y' }} // CSS essential for use-gesture to work with scrolling
        >
            {children}
        </motion.div>
    );
};
