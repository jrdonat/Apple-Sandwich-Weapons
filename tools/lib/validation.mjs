import path from "node:path";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateJsonValue(value, location = "value") {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`${location} contains a non-finite number`);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${location}[${index}]`));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      validateJsonValue(item, `${location}.${key}`);
    }
  }
}

export function validateWeapon(data, location = "weapon") {
  if (!isPlainObject(data)) {
    throw new Error(`${location} must contain a top-level JSON object`);
  }

  if (typeof data.Id !== "string" || data.Id.trim() === "") {
    throw new Error(`${location} must have a non-empty string Id`);
  }

  if (!ID_PATTERN.test(data.Id)) {
    throw new Error(
      `${location} has invalid Id ${JSON.stringify(data.Id)}; use lowercase kebab-case`,
    );
  }

  if (typeof data.DisplayName !== "string" || data.DisplayName.trim() === "") {
    throw new Error(`${location} must have a non-empty string DisplayName`);
  }

  validateJsonValue(data, location);
  return data;
}

export function assertSafeRelativePath(value, label, { fileName = false } = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty relative path`);
  }

  if (
    path.isAbsolute(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new Error(`${label} must not be an absolute path: ${value}`);
  }

  const segments = value.split(/[\\/]/u);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`${label} contains an unsafe path segment: ${value}`);
  }

  if (segments.some((segment) => segment.includes("\0"))) {
    throw new Error(`${label} contains a null byte`);
  }

  if (!fileName && segments.at(-1).toLowerCase().endsWith(".json")) {
    throw new Error(`${label} must name a category directory, not a JSON file: ${value}`);
  }

  return segments;
}

export function resolveInside(root, segments, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  const relative = path.relative(resolvedRoot, resolved);

  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return resolved;
  }

  throw new Error(`${label} escapes its allowed directory`);
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
