
export function AnvilLogoSVG({ className = "", width = 24, height = 24 }: { className?: string, width?: number | string, height?: number | string }) {
    return (
        <svg 
            width={width} 
            height={height} 
            viewBox="0 0 500 500" 
            fill="currentColor" 
            className={className}
        >
            <path d="M123.636 179.352L153.948 227.086H415.548L445.86 179.352H123.636Z" />
            <path d="M192.176 244.603L168.324 353.97H235.344C243.619 333.626 262.833 318.57 284.748 318.57C306.663 318.57 325.877 333.626 334.152 353.97H401.172L377.32 244.603H192.176Z" />
        </svg>
    );
}
