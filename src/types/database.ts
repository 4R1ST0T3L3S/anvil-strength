export type Role = 'coach' | 'athlete';

export interface Profile {
    id: string;
    email: string;
    role: Role;
    full_name: string;
    nickname?: string;
    age_category?: string; // Sub-Junior, Junior, etc.
    weight_category?: string; // -93kg, etc.
    biography?: string;
    username?: string; // Instagram handle usually
    avatar_url?: string;
    total_pr?: number;
    squat_pr?: number;
    bench_pr?: number;
    deadlift_pr?: number;
    created_at: string;
    coach_id?: string | null; // For athletes linked to a coach
}

export interface Coach extends Profile {
    role: 'coach';
}

export interface Athlete extends Profile {
    role: 'athlete';
    coach_id?: string | null;
}

// AEP Service Types
export interface AepLifter {
    id: number;
    name: string;
    club: string;
    division: string;
    bodyweight: number;
    wilks: number;
    dots: number;
    goodlift?: number;
    ipf_points?: number;
}

export interface TrainingSession {
    id: string;
    athlete_id: string;
    coach_id: string;
    date: string;
    notes?: string;
    // Add more fields as we discover them
}
