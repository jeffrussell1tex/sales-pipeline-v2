// How long an invitation's link lasts, in days (state §0.165): the invite
// screen's choices and the only values users.mjs hands Clerk. One list for both
// sides — two lists drift (the role vocabulary's lesson). Clerk's own default is
// 30; the screen promised 7 and sent nothing, so every link lasted 30.
export const INVITE_EXPIRY_DAYS = [3, 7, 14, 30];
export const DEFAULT_INVITE_EXPIRY_DAYS = 7;
