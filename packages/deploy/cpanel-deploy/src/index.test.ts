import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isExcludedFile,
  redactSensitiveValue,
  redactConfig,
  validateRemoteDir,
  validateConfig,
  type CpanelDeployConfig,
} from "./index.js";

describe("isExcludedFile", () => {
  it("excludes .env files", () => {
    expect(isExcludedFile(".env")).toBe(true);
    expect(isExcludedFile(".env.local")).toBe(true);
    expect(isExcludedFile(".env.production")).toBe(true);
  });

  it("excludes package files", () => {
    expect(isExcludedFile("package.json")).toBe(true);
    expect(isExcludedFile("package-lock.json")).toBe(true);
    expect(isExcludedFile("pnpm-lock.yaml")).toBe(true);
  });

  it("excludes git directories", () => {
    expect(isExcludedFile(".git")).toBe(true);
    expect(isExcludedFile(".gitignore")).toBe(true);
    expect(isExcludedFile("path/to/.git/config")).toBe(true);
  });

  it("excludes node_modules", () => {
    expect(isExcludedFile("node_modules")).toBe(true);
    expect(isExcludedFile("path/to/node_modules")).toBe(true);
    expect(isExcludedFile("node_modules/package/index.js")).toBe(true);
  });

  it("excludes dist directories", () => {
    expect(isExcludedFile("dist/index.js")).toBe(true);
    expect(isExcludedFile("path/to/dist/bundle.js")).toBe(true);
  });

  it("does NOT exclude website files", () => {
    expect(isExcludedFile("index.html")).toBe(false);
    expect(isExcludedFile("about.html")).toBe(false);
    expect(isExcludedFile("contact.html")).toBe(false);
    expect(isExcludedFile("assets/css/style.css")).toBe(false);
    expect(isExcludedFile("assets/js/main.js")).toBe(false);
    expect(isExcludedFile("images/logo.png")).toBe(false);
  });

  it("does NOT exclude .well-known for ACME challenges", () => {
    expect(isExcludedFile(".well-known/acme-challenge/token")).toBe(false);
  });
});

describe("redactSensitiveValue", () => {
  it("redacts short values completely", () => {
    expect(redactSensitiveValue("abc")).toBe("***");
  });

  it("redacts long values sensibly", () => {
    const result = redactSensitiveValue("mysecretpassword");
    expect(result.length).toBeLessThan("mysecretpassword".length);
    expect(result).not.toBe("mysecretpassword");
  });

  it("handles very long values", () => {
    const longValue = "a".repeat(50);
    const result = redactSensitiveValue(longValue);
    expect(result.length).toBeLessThan(longValue.length);
  });
});

describe("redactConfig", () => {
  it("redacts password field", () => {
    const config: CpanelDeployConfig = {
      host: "example.com",
      port: 22,
      user: "myuser",
      password: "secret123",
      protocol: "sftp",
      remoteDir: "public_html",
      localDir: "site",
    };
    const redacted = redactConfig(config);
    expect(redacted.password).toBe("s*******3");
    expect(redacted.host).toBe("example.com");
    expect(redacted.user).toBe("myuser");
  });

  it("redacts token-like fields", () => {
    const config: CpanelDeployConfig = {
      host: "example.com",
      port: 22,
      user: "myuser",
      password: "secrettoken",
      protocol: "sftp",
      remoteDir: "public_html",
      localDir: "site",
    };
    const redacted = redactConfig(config);
    expect(redacted.password).not.toBe("secrettoken");
  });
});

describe("validateRemoteDir", () => {
  it("rejects empty paths", () => {
    expect(validateRemoteDir("")).toBe(false);
  });

  it("rejects root directory", () => {
    expect(validateRemoteDir("/")).toBe(false);
    expect(validateRemoteDir("/home")).toBe(false);
    expect(validateRemoteDir("/home/")).toBe(false);
    expect(validateRemoteDir("home")).toBe(false);
  });

  it("rejects system directories", () => {
    expect(validateRemoteDir("/tmp")).toBe(false);
    expect(validateRemoteDir("/var")).toBe(false);
    expect(validateRemoteDir("/etc")).toBe(false);
    expect(validateRemoteDir("/usr")).toBe(false);
  });

  it("rejects parent traversal attempts", () => {
    expect(validateRemoteDir("../")).toBe(false);
    expect(validateRemoteDir("../../../etc")).toBe(false);
    expect(validateRemoteDir("public_html/../../../root")).toBe(false);
  });

  it("accepts valid cPanel paths", () => {
    expect(validateRemoteDir("public_html")).toBe(true);
    expect(validateRemoteDir("engagegroovy.com")).toBe(true);
    expect(validateRemoteDir("home/engaemyx/public_html")).toBe(true);
    expect(validateRemoteDir("/home/engaemyx/public_html")).toBe(true);
  });

  it("normalizes backslashes", () => {
    expect(validateRemoteDir("public_html\\subdir")).toBe(true);
  });
});

describe("validateConfig", () => {
  it("requires host", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("CPANEL_DEPLOY_HOST is required");
  });

  it("requires user", () => {
    const result = validateConfig({ host: "example.com" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("CPANEL_DEPLOY_USER is required");
  });

  it("requires password", () => {
    const result = validateConfig({ host: "example.com", user: "myuser" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("CPANEL_DEPLOY_PASSWORD is required");
  });

  it("requires remoteDir", () => {
    const result = validateConfig({
      host: "example.com",
      user: "myuser",
      password: "pass",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("CPANEL_DEPLOY_REMOTE_DIR is required");
  });

  it("rejects unsafe remote directories", () => {
    const result = validateConfig({
      host: "example.com",
      user: "myuser",
      password: "pass",
      remoteDir: "/",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unsafe"))).toBe(true);
  });

  it("accepts valid complete config", () => {
    const result = validateConfig({
      host: "example.com",
      user: "myuser",
      password: "pass",
      remoteDir: "public_html",
      protocol: "sftp",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("accepts valid port number", () => {
    const result = validateConfig({
      host: "example.com",
      user: "myuser",
      password: "pass",
      remoteDir: "public_html",
      port: 22,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("dry-run behavior", () => {
  it("excluded files should be skipped without uploading", () => {
    expect(isExcludedFile(".env")).toBe(true);
    expect(isExcludedFile("node_modules/package")).toBe(true);
    expect(isExcludedFile(".git/config")).toBe(true);
  });

  it("website files should not be excluded", () => {
    expect(isExcludedFile("index.html")).toBe(false);
    expect(isExcludedFile("about.html")).toBe(false);
    expect(isExcludedFile("contact.html")).toBe(false);
    expect(isExcludedFile("services.html")).toBe(false);
    expect(isExcludedFile("work.html")).toBe(false);
    expect(isExcludedFile("404.html")).toBe(false);
    expect(isExcludedFile("assets/style.css")).toBe(false);
    expect(isExcludedFile("assets/images/logo.png")).toBe(false);
  });
});