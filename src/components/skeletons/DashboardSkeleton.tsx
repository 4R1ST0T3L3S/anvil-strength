import { Skeleton } from "../ui/Skeleton";
import { DashboardLayout } from "../layout/DashboardLayout";




export function DashboardSkeleton() {
    return (
        <DashboardLayout
            menuItems={[1, 2, 3, 4, 5].map((i) => ({
                icon: <Skeleton className="h-5 w-5" />,
                label: "Loading...",
                onClick: () => { },
                isActive: i === 1
            }))}
        >
            <div className="p-8 space-y-8">
                {/* Header Skeleton */}
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-4 w-96" />
                </div>

                {/* Stats Grid Skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="bg-[#252525] p-6 rounded-xl border border-white/5 space-y-4">
                            <div className="flex justify-between items-start">
                                <Skeleton className="h-10 w-10 rounded-lg" />
                                <Skeleton className="h-6 w-12" />
                            </div>
                            <div>
                                <Skeleton className="h-8 w-16 mb-1" />
                                <Skeleton className="h-4 w-24" />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Content Area Skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Chart/Table Area */}
                    <div className="lg:col-span-2 bg-[#252525] p-6 rounded-xl border border-white/5 h-[400px]">
                        <div className="flex justify-between mb-6">
                            <Skeleton className="h-6 w-32" />
                            <Skeleton className="h-8 w-24 rounded-lg" />
                        </div>
                        <Skeleton className="w-full h-[300px] rounded-lg" />
                    </div>

                    {/* Sidebar/List Area */}
                    <div className="bg-[#252525] p-6 rounded-xl border border-white/5 h-[400px]">
                        <Skeleton className="h-6 w-32 mb-6" />
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-1 flex-1">
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
