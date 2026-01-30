import { Skeleton } from "../ui/Skeleton";
import { DashboardLayout } from "../layout/DashboardLayout";

const mockUser = {
    id: "skeleton",
    email: "loading...",
    role: "athlete" as const,
    full_name: "Loading...",
    nickname: "Loading",
    avatar_url: undefined,
    created_at: "",
    updated_at: ""
};

export function ProfileSkeleton() {
    return (
        <DashboardLayout
            user={mockUser}
            onLogout={() => { }}
            menuItems={[1, 2, 3, 4, 5].map((i) => ({
                icon: <Skeleton className="h-5 w-5" />,
                label: "Loading...",
                onClick: () => { },
                isActive: i === 5
            }))}
            roleLabel="Profile"
        >
            <div className="max-w-4xl mx-auto p-6 space-y-8">
                <Skeleton className="h-10 w-48 mb-8" />

                <div className="bg-[#252525] rounded-xl p-8 space-y-6 border border-white/5">
                    {/* Avatar Section */}
                    <div className="flex flex-col items-center gap-4 pb-6 border-b border-white/10">
                        <Skeleton className="w-32 h-32 rounded-full" />
                        <Skeleton className="h-4 w-48" />
                    </div>

                    {/* Basic Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i}>
                                <Skeleton className="h-4 w-24 mb-2" />
                                <Skeleton className="h-12 w-full rounded-lg" />
                            </div>
                        ))}
                    </div>

                    {/* Section Divider */}
                    <div className="pt-6 border-t border-white/10">
                        <Skeleton className="h-8 w-48 mb-4" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[1, 2].map((i) => (
                                <div key={i}>
                                    <Skeleton className="h-4 w-32 mb-2" />
                                    <Skeleton className="h-12 w-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PRs Section */}
                    <div className="pt-6 border-t border-white/10">
                        <Skeleton className="h-8 w-48 mb-4" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i}>
                                    <Skeleton className="h-4 w-24 mb-2" />
                                    <Skeleton className="h-12 w-full rounded-lg" />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Button */}
                    <div className="flex justify-end pt-6 border-t border-white/10">
                        <Skeleton className="h-12 w-48 rounded-lg" />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
