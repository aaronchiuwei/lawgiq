import type { SourceKind } from "./types";

/**
 * Deep links into the Clio Manage web app. Clio does not document these routes;
 * they are the hash routes the web app uses today. Region-hosted firms set
 * CLIO_APP_BASE (e.g. https://eu.app.clio.com).
 */
const APP_BASE = process.env.CLIO_APP_BASE ?? "https://app.clio.com";

export function clioDeepLink(kind: SourceKind, id: string, matterId: string): string {
  const nc = `${APP_BASE}/nc/#`;
  switch (kind) {
    case "matter":
    case "custom_field":
    case "relationship":
      return `${nc}/matters/${matterId}`;
    case "contact":
      return `${nc}/contacts/${id}`;
    case "note":
      return `${nc}/matters/${matterId}/notes`;
    case "communication":
      return `${nc}/matters/${matterId}/communications`;
    case "task":
      return `${nc}/tasks/${id}`;
    case "calendar_entry":
      return `${nc}/matters/${matterId}/calendar`;
    case "expense":
      return `${nc}/matters/${matterId}/activities`;
    case "document":
      return `${nc}/documents/${id}/details`;
  }
}

/** Human text for a custom field value (currency as dollars, checkboxes as Yes/No). */
export function fieldText(fieldType: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (fieldType === "currency" && typeof value === "number") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (fieldType === "checkbox" || typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
