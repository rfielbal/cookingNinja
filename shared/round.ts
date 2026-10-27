/** Active round time; setup, practice and explicit pauses are outside this budget. */
export const COUNTDOWN_SECONDS = 3;
export const CUT_SECONDS = 45;
export const MIX_SECONDS = 6;

/** Keep the required average effort unchanged when the mixing phase gets shorter. */
export const MIX_FILL_SECONDS = MIX_SECONDS / 2;
