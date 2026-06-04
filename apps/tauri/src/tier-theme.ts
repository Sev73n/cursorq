/** CSS class suffix for plan tier styling */
export function tierThemeClass(tier: string): string {
  const n = tier.trim().toLowerCase();
  if (n.includes("ultra")) return "tier-ultra";
  if (n.includes("pro+") || n.includes("pro plus") || n.includes("pro_plus")) {
    return "tier-proplus";
  }
  if (n.includes("enterprise")) return "tier-enterprise";
  if (n.includes("team") || n.includes("business")) return "tier-teams";
  if (n.includes("pro")) return "tier-pro";
  if (n.includes("hobby") || n.includes("free")) return "tier-hobby";
  return "tier-default";
}
