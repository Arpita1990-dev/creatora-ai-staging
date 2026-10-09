export function canManageBrandKit(membership) {
  return membership?.role === "OWNER" || membership?.role === "ADMIN";
}