// Generate a URL-safe, reasonably-unique slug from a club name.
export function slugify(name: string): string {
  const base =
    (name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "club";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
