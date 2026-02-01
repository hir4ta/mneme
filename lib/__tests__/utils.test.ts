import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureDir, safeReadJson, safeWriteJson } from "../utils";

describe("utils", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mneme-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("safeReadJson", () => {
    it("存在するJSONファイルを読み込む", () => {
      const filePath = path.join(tmpDir, "test.json");
      fs.writeFileSync(filePath, '{"key": "value"}');
      const result = safeReadJson(filePath, {});
      expect(result).toEqual({ key: "value" });
    });

    it("存在しないファイルはフォールバックを返す", () => {
      const result = safeReadJson("/nonexistent/file.json", { default: true });
      expect(result).toEqual({ default: true });
    });

    it("不正なJSONはフォールバックを返す", () => {
      const filePath = path.join(tmpDir, "invalid.json");
      fs.writeFileSync(filePath, "not json");
      const result = safeReadJson(filePath, { fallback: true });
      expect(result).toEqual({ fallback: true });
    });
  });

  describe("safeWriteJson", () => {
    it("JSONファイルを書き込む", () => {
      const filePath = path.join(tmpDir, "output.json");
      safeWriteJson(filePath, { test: 123 });
      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content).toEqual({ test: 123 });
    });

    it("ディレクトリが存在しなければ作成する", () => {
      const filePath = path.join(tmpDir, "nested", "dir", "file.json");
      safeWriteJson(filePath, { nested: true });
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe("ensureDir", () => {
    it("ディレクトリを作成する", () => {
      const dirPath = path.join(tmpDir, "new", "directory");
      ensureDir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it("既存ディレクトリでもエラーにならない", () => {
      ensureDir(tmpDir);
      expect(fs.existsSync(tmpDir)).toBe(true);
    });
  });
});
