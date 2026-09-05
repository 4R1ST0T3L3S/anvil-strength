/**
 * Utility functions for user display names
 */

/**
 * Gets the display name for a user (name + first surname)
 * Falls back to full_name if no splitting is possible
 * @param user User object with full_name
 * @returns Formatted display name
 */
export function getDisplayName(user: { full_name?: string; nickname?: string; name?: string } | null | undefined): string {
    if (!user) return 'Usuario';

    const fullName = user.full_name || user.name;
    if (!fullName) return user.nickname || 'Usuario';

    // Split by spaces to get name parts
    const parts = fullName.trim().split(/\s+/);

    // If only one word, return it
    if (parts.length === 1) return parts[0];

    // Return first name + first surname (first two words)
    return parts.slice(0, 2).join(' ');
}

/**
 * Gets initials from user's full name
 * @param user User object with full_name
 * @returns User initials (1-2 characters)
 */
export function getUserInitials(user: { full_name?: string; nickname?: string; name?: string } | null | undefined): string {
    if (!user) return 'U';

    const fullName = user.full_name || user.name;
    if (!fullName) {
        return user.nickname?.[0]?.toUpperCase() || 'U';
    }

    const parts = fullName.trim().split(/\s+/);

    if (parts.length === 1) {
        return parts[0][0]?.toUpperCase() || 'U';
    }

    // Return first letter of first name + first letter of surname
    return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}
