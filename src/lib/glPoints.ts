export const calculateGLPoints = (
    total: number,
    bodyWeight: number,
    gender: 'male' | 'female',
    equipment: 'raw' | 'equipped' = 'raw'
): number => {
    if (!total || !bodyWeight) return 0;

    // IPF GL Coefficients (2020 Update)
    // Source: https://www.powerlifting.ipf.info/fileadmin/ipf/data/ipf-formula/IPF_GL_Coefficients_2020.pdf
    const coefficients = {
        male: {
            raw: { a: 1199.72839, b: 1025.18162, c: 0.00921 },
            equipped: { a: 1236.25115, b: 1202.52881, c: 0.007126 }
        },
        female: {
            raw: { a: 610.32796, b: 1045.59282, c: 0.03048 },
            equipped: { a: 758.64468, b: 949.31382, c: 0.02435 }
        }
    };

    const { a, b, c } = coefficients[gender][equipment];

    // GL Formula: Total * 100 / ( A - B * e^(-C * Bodyweight) )
    const denominator = a - b * Math.exp(-c * bodyWeight);
    if (denominator === 0) return 0;

    const glPoints = (total * 100) / denominator;

    return Number(glPoints.toFixed(2));
};

export const getGenderAndWeightFromCategory = (category: string): { gender: 'male' | 'female', weight: number } | null => {
    if (!category) return null;

    const cat = category.toLowerCase().trim();

    // Determine Gender based on typical IPF categories or optgroup labels if we had access, 
    // but here we have to infer from standard weight classes.
    // Men: 59, 66, 74, 83, 93, 105, 120, +120
    // Women: 47, 52, 57, 63, 69, 76, 84, +84

    // This heuristic might be imperfect if categories are custom, but works for standard IPF.
    // We can also assume "Default Male" if ambiguous, or check for specific female weights.

    let gender: 'male' | 'female' = 'male'; // Default

    // Specific female categories check
    if (['47', '52', '57', '63', '69', '76', '84', '+84'].some(w => cat.includes(w) && !cat.includes('120') && !cat.includes('105') && !cat.includes('93') && !cat.includes('83') && !cat.includes('74') && !cat.includes('59'))) {
        gender = 'female';
    }
    // Ambiguous overlap: 52, 57... usually female. 59, 66 are men. 
    // Let's refine based on the ProfileSection select options:
    // Female: -47, -52, -57, -63, -69, -76, -84, +84
    // Male: -59, -66, -74, -83, -93, -105, -120, +120

    if (cat.includes('47') || cat.includes('52') || cat.includes('57') || cat.includes('63') || cat.includes('69') || cat.includes('76') || cat.includes('84')) {
        gender = 'female';
    }

    // Extract numerical weight
    const weightMatch = cat.match(/\d+/);
    const weight = weightMatch ? parseInt(weightMatch[0]) : 75; // Fallback average weight if parse fails

    // Handle "+120" or "+84" - Add a bit to represent super heavyweight? 
    // Standard practice often just uses the limit or a slight bump. 
    // For ranking purposes, using the category limit is "safe" but for Supers it penalizes them.
    // However, without exact bodyweight, we use the category limit number.

    return { gender, weight };
};
