import { ApiError } from "../api";
export function boundedText(
  value: unknown,
  label: string,
  min: number,
  max: number,
): string {
  if (typeof value !== "string")
    throw new ApiError(400, "invalid_input", `Enter ${label}.`);
  const text = value.trim();
  if (
    text.length < min ||
    text.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
  )
    throw new ApiError(
      400,
      "invalid_input",
      `Use ${min}–${max} characters for ${label}.`,
    );
  return text;
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new ApiError(400, "invalid_id", "A valid reference is required.");
  return value.toLowerCase();
}
export function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new ApiError(
      400,
      "invalid_version",
      "Reload this record before saving.",
    );
  return Number(value);
}
