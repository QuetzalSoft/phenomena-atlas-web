import type { components } from "@quetzalsoft/phenomena-atlas-contract";

export type Role = components["schemas"]["Role"];

/**
 * The roles as docs/roles.md in the system repository defines them. Keyed by the contract's
 * Role, so a role added there does not compile until it is described here.
 */
export const roleInfo: Record<Role, { label: string; purpose: string; includes?: string }> = {
  user: {
    label: "User",
    purpose: "Consumes the atlas and files incident reports about phenomena.",
  },
  analyst: {
    label: "Analyst",
    purpose: "Feeds the atlas with data and reads the individual incident reports behind it.",
    includes: "Includes everything a user can do.",
  },
  admin: {
    label: "Admin",
    purpose: "Operates and governs the system, including accounts and their roles.",
    includes: "Includes everything an analyst can do.",
  },
};

/** Lowest to highest. Each role can do everything the roles before it can. */
export const roles = Object.keys(roleInfo) as Role[];
