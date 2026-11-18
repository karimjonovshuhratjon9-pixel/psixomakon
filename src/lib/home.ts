import type { Role } from "../types";

/** Har bir rol uchun bosh sahifa */
export function homeFor(role: Role) {
  if (role === "student") return "/app/my-tests";
  return "/app";
}
