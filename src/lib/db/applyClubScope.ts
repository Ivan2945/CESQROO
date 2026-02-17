type QueryBuilder = any;

export function applyClubScope(
  query: QueryBuilder,
  profile: { role: string },
  clubId: string | null
) {
  // Admin sees everything, no filter
  if (profile.role === "admin") return query;

  // Non-admin MUST have a clubId; otherwise this will produce uuid "null" errors
  if (!clubId) {
    throw new Error("Missing clubId for non-admin user (cannot apply club scope).");
  }

  return query.eq("club_id", clubId);
}
