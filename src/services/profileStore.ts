/**
 * Active-profile selection (F2 multi-profile).
 *
 * Kept in MMKV (sync) and separate from the profiles CRUD in db/database.ts
 * so the database layer can read the active profile without an import cycle.
 *
 * SAFETY RULE: the active profile only scopes what UI LISTS show. Alarm and
 * notification scheduling always covers every profile — a dependent's dose
 * must ring no matter whose profile is on screen.
 */
import { storage } from "../storage";
import { STORAGE_KEYS } from "../config";

export const DEFAULT_PROFILE_ID = "default";

export function getActiveProfileId(): string {
  return storage.getString(STORAGE_KEYS.ACTIVE_PROFILE) ?? DEFAULT_PROFILE_ID;
}

export function setActiveProfileId(id: string): void {
  storage.set(STORAGE_KEYS.ACTIVE_PROFILE, id);
}
