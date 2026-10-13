/**
 * Categories the engine refuses to touch automatically: gated/restricted on Amazon, regulated, or
 * high-liability. Selling these needs approval/compliance work a bot should not improvise.
 */
const BLOCKED = [
  "supplement", "vitamin", "medical", "medicine", "drug", "cbd", "hemp", "weapon", "knife", "firearm", "ammo",
  "adult", "sexual", "tobacco", "vape", "alcohol", "baby formula", "car seat", "helmet", "battery", "lithium",
  "cosmetic", "skincare", "sunscreen", "pesticide", "aerosol", "recalled",
];

export function isBlocked(text: string): string | null {
  const t = text.toLowerCase();
  const hit = BLOCKED.find((b) => t.includes(b));
  return hit ?? null;
}
