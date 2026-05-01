import path from "node:path";
import { pathToFileURL } from "node:url";

const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const URL_SCHEME = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function toDynamicImportSpecifier(specifier: string): string {
  if (path.isAbsolute(specifier) || WINDOWS_ABSOLUTE_PATH.test(specifier)) {
    return pathToFileURL(specifier).href;
  }

  if (URL_SCHEME.test(specifier)) {
    return specifier;
  }

  return specifier;
}
