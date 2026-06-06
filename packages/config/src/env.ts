export type RuntimeEnvironment = "development" | "test" | "production";

export function readRuntimeEnvironment(
  value: string | undefined,
): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

