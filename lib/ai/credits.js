/**
 * Central credit conversion utility for CreateoraAI.
 *
 * MuAPI is the source of truth. CreateoraAI does NOT maintain
 * a separate credit wallet. Instead, we convert MuAPI's USD
 * balance to AI Credits at a fixed rate.
 *
 * Conversion Rate: 1 USD = 100 AI Credits
 *
 * Rounding Rules:
 *   - Available balance: floor() — never display more spendable credits than the provider supports
 *   - Generation cost: ceil() — always require enough credits to cover the full cost
 */

export const CREATEORA_CREDITS_PER_USD = 100;

/**
 * Convert a MuAPI USD balance to CreateoraAI AI Credits.
 * Uses floor() to avoid displaying more spendable credits than available.
 *
 * @param {number|string|null} balanceUsd - The MuAPI balance in USD
 * @returns {number} - The available AI Credits (always >= 0)
 */
export function balanceUsdToCredits(balanceUsd) {
    if (balanceUsd == null || balanceUsd === "") return 0;
    const numeric = typeof balanceUsd === "string" ? parseFloat(balanceUsd) : Number(balanceUsd);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    // Use epsilon to handle floating-point precision issues
    const epsilon = 1e-9;
    return Math.floor(numeric * CREATEORA_CREDITS_PER_USD + epsilon);
}

/**
 * Convert a MuAPI generation cost in USD to CreateoraAI AI Credits.
 * Uses ceil() to ensure the user has enough credits to cover the full cost.
 *
 * @param {number|string|null} costUsd - The MuAPI generation cost in USD
 * @returns {number} - The required AI Credits (always >= 0)
 */
export function generationUsdToCredits(costUsd) {
    if (costUsd == null || costUsd === "") return 0;
    const numeric = typeof costUsd === "string" ? parseFloat(costUsd) : Number(costUsd);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    // Use epsilon to handle floating-point precision issues
    const epsilon = 1e-9;
    return Math.ceil(numeric * CREATEORA_CREDITS_PER_USD - epsilon);
}

/**
 * Check if the user has sufficient AI Credits for a generation.
 *
 * @param {number} availableCredits - The user's available AI Credits
 * @param {number} requiredCredits - The generation cost in AI Credits
 * @returns {{ sufficient: boolean, availableCredits: number, requiredCredits: number }}
 */
export function checkSufficientCredits(availableCredits, requiredCredits) {
    const available = Math.max(0, Math.floor(Number(availableCredits) || 0));
    const required = Math.max(0, Math.ceil(Number(requiredCredits) || 0));
    return {
        sufficient: available >= required,
        availableCredits: available,
        requiredCredits: required,
    };
}
