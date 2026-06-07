// Shared height & section rules for showjumping event entries.
// Used by both the public sign-up form and the server-side API validation,
// so the rules can never drift between client and server.

export const HEIGHTS = [
  "Cruces",
  "40cm",
  "60cm",
  "75cm",
  "80cm",
  "1m",
  "1.10m",
  "1.20m",
  "1.30m",
] as const;

export type Height = (typeof HEIGHTS)[number];

export const SECTIONS = ["Abierta", "Libre", "Especial", "Exhibición"] as const;
export type Section = (typeof SECTIONS)[number];

// Section availability depends on the chosen height:
//   - Abierta & Libre: available for every height
//   - Especial: only 60cm and 80cm
//   - Exhibición: only Cruces
export function sectionsForHeight(height: string): Section[] {
  const out: Section[] = [];
  if (height === "Cruces") out.push("Exhibición");
  out.push("Abierta", "Libre");
  if (height === "60cm" || height === "80cm") out.push("Especial");
  return out;
}

export function isValidHeight(height: string): boolean {
  return (HEIGHTS as readonly string[]).includes(height);
}

export function isValidPair(height: string, section: string): boolean {
  return isValidHeight(height) && sectionsForHeight(height).includes(section as Section);
}
