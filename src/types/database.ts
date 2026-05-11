export type Role = 'coach' | 'athlete' | 'nutritionist' | 'visitor';

export interface UserPoints {
    user_id: string;
    balance: number;
    total_earned: number;
    last_updated: string;
}

export interface PointTransaction {
    id: string;
    user_id: string;
    amount: number;
    reason: 'WELCOME_BONUS' | 'REFERRAL' | 'GAME_PLACEMENT' | 'BET_WON' | 'ADMIN_ADJUSTMENT' | string;
    created_at: string;
}

export interface AppNotification {
    id: string;
    user_id: string;
    type: 'system' | 'chat' | 'training' | 'nutrition' | 'points' | 'arena';
    title: string;
    content: string;
    is_read: boolean;
    related_entity_id?: string;
    created_at: string;
}

export type BetType = '1vs1' | 'pool' | 'event' | 'prediction';
export type BetStatus = 'open' | 'locked' | 'resolved' | 'cancelled';

export interface ArenaBet {
    id: string;
    title: string;
    description?: string;
    type: BetType;
    status: BetStatus;
    image_url?: string;
    created_at: string;
    resolved_at?: string;
    winner_option_id?: string;
    target_value?: number;
}

export interface ArenaOption {
    id: string;
    bet_id: string;
    name: string;
    image_url?: string;
    total_pool: number;
}

export interface UserArenaBet {
    id: string;
    user_id: string;
    bet_id: string;
    option_id?: string;
    prediction_value?: number;
    amount: number;
    created_at: string;
}

export interface ChatMessage {
    id: string;
    sender_id: string;
    receiver_id: string;
    content: string;
    type: 'text' | 'image';
    is_read: boolean;
    created_at: string;
}

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
    brand_color?: string | null;
    logo_url?: string | null;
    max_sushi_pieces?: number;
    is_developer?: boolean;
    is_club_member?: boolean;
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
