import type { Role } from "../access";

export type OptionSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export function parseRole(v: string | string[] | undefined): Role {
  return v === "provider" || v === "client" ? v : "firm";
}

export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
