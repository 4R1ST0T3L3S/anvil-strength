export type Role = 'coach' | 'athlete' | 'nutritionist';

export interface Profile {
    id: string;
    email: string;
    role: Role;
    has_access?: boolean;
    full_name: string;
    nickname?: string;
    gender?: 'male' | 'female';
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
    nutritionist_id?: string | null; // For athletes linked to a nutritionist
}

export interface Coach extends Profile {
    role: 'coach';
}

export interface Athlete extends Profile {
    role: 'athlete';
    coach_id?: string | null;
    nutritionist_id?: string | null;
}

export interface Nutritionist extends Profile {
    role: 'nutritionist';
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

export interface AthleteReview {
    id: string;
    user_id: string;
    athlete_name: string;
    rating: number; // 1-5 stars
    review_text: string;
    created_at: string;
    updated_at: string;
}
