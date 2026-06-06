const FREELAS_HOST_PATTERN = /(^|\.)99freelas\.com\.br$/i;

export function is99FreelasUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return FREELAS_HOST_PATTERN.test(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeProjectUrl(value: string): string {
  const url = new URL(value);

  url.hash = "";
  url.search = "";

  const normalizedPathname = url.pathname.replace(/\/+$/, "") || "/";
  url.pathname = normalizedPathname;

  return url.toString();
}

export function extractProjectIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    const projectSegment = segments[segments.length - 1];

    if (!projectSegment) {
      return null;
    }

    return projectSegment;
  } catch {
    return null;
  }
}

