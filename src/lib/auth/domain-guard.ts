import { ALLOWED_EMAIL_DOMAIN } from "@/lib/constants";

/**
 * Strict server-side verification that an email address belongs to IIIT Lucknow.
 *
 * Normalizes email and ensures:
 * 1. String is present and trimmed
 * 2. Exactly one '@' symbol
 * 3. Domain part is strictly equal to 'iiitl.ac.in' (case-insensitive)
 * 4. Rejects subdomains (e.g. @alumni.iiitl.ac.in or @mail.iiitl.ac.in) unless allowed
 * 5. Rejects prefix/suffix lookalike domains (e.g. @fake-iiitl.ac.in, @iiitl.ac.in.evil.com)
 */
export function isCampusEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;

  const trimmed = email.trim().toLowerCase();
  // Basic RFC 5322 sanity regex for the local-part and iiitl.ac.in domain
  const emailRegex = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@([a-z0-9.-]+)$/;
  const match = trimmed.match(emailRegex);

  if (!match) return false;

  const domain = match[1];
  return domain === ALLOWED_EMAIL_DOMAIN;
}

/**
 * Extracts student metadata (batch, branch) if email follows IIIT Lucknow roll number format:
 * e.g., 'lit2023045@iiitl.ac.in' -> branch: 'IT', batch: '2023'
 * e.g., 'bcs2022010@iiitl.ac.in' -> branch: 'CS', batch: '2022'
 * e.g., 'cds2024001@iiitl.ac.in' -> branch: 'CS-AI', batch: '2024'
 */
export function parseStudentDetailsFromEmail(email: string | null | undefined): {
  branch: string | null;
  batch: string | null;
  rollNumber: string | null;
} {
  if (!email || !isCampusEmail(email)) {
    return { branch: null, batch: null, rollNumber: null };
  }

  const localPart = email.trim().toLowerCase().split("@")[0];
  const match = localPart.match(/^([a-z]{2,4})(\d{4})(\d{2,4})$/);

  if (!match) {
    return { branch: null, batch: null, rollNumber: localPart.toUpperCase() };
  }

  const [, prefix, year] = match;
  const branchMap: Record<string, string> = {
    lit: "Information Technology",
    it: "Information Technology",
    bcs: "Computer Science",
    cs: "Computer Science",
    cds: "Computer Science & AI",
    csai: "Computer Science & AI",
    bba: "Management & Tech",
    mba: "MBA",
    mtech: "M.Tech",
    phd: "Ph.D.",
  };

  return {
    branch: branchMap[prefix] ?? prefix.toUpperCase(),
    batch: year,
    rollNumber: localPart.toUpperCase(),
  };
}

/**
 * Safely sanitizes a redirect target to prevent open redirect vulnerabilities.
 * Ensures the target is a relative path starting with '/' and not a protocol-relative '//'.
 */
export function sanitizeRedirectPath(
  target: string | null | undefined,
  defaultPath = "/"
): string {
  if (!target || typeof target !== "string") {
    return defaultPath;
  }

  const trimmed = target.trim();

  // Reject empty string or external schemes
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/\\") ||
    trimmed.includes("://")
  ) {
    return defaultPath;
  }

  return trimmed;
}
