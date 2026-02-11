import { describe, expect, it } from "vitest";
import {
  calculateSimilarity,
  expandAliases,
  levenshtein,
} from "../search/fuzzy";

describe("fuzzy-search", () => {
  const mockTags = [
    {
      id: "auth",
      label: "認証",
      aliases: ["authentication", "login", "認証", "jwt"],
    },
    {
      id: "frontend",
      label: "Frontend",
      aliases: ["front", "フロント", "client"],
    },
  ];

  describe("levenshtein", () => {
    it("同じ文字列は距離0", () => {
      expect(levenshtein("auth", "auth")).toBe(0);
    });

    it("1文字挿入は距離1", () => {
      expect(levenshtein("auth", "auths")).toBe(1);
    });

    it("1文字削除は距離1", () => {
      expect(levenshtein("auths", "auth")).toBe(1);
    });

    it("1文字置換は距離1", () => {
      expect(levenshtein("auth", "autH")).toBe(1);
    });

    it("空文字列の距離", () => {
      expect(levenshtein("", "abc")).toBe(3);
      expect(levenshtein("abc", "")).toBe(3);
    });
  });

  describe("expandAliases", () => {
    it("タグIDからエイリアスを展開する", () => {
      const result = expandAliases("auth", mockTags);
      expect(result).toContain("authentication");
      expect(result).toContain("jwt");
      expect(result).toContain("認証");
    });

    it("エイリアスからタグIDを逆引きする", () => {
      const result = expandAliases("認証", mockTags);
      expect(result).toContain("auth");
      expect(result).toContain("jwt");
    });

    it("マッチしないクエリはそのまま返す", () => {
      const result = expandAliases("unknown", mockTags);
      expect(result).toEqual(["unknown"]);
    });

    it("大文字小文字を無視する", () => {
      const result = expandAliases("AUTH", mockTags);
      expect(result).toContain("jwt");
    });
  });

  describe("calculateSimilarity", () => {
    it("完全一致は最高スコア", () => {
      expect(calculateSimilarity("auth", "auth")).toBe(10);
    });

    it("部分一致（テキストにクエリが含まれる）", () => {
      const score = calculateSimilarity("authentication system", "auth");
      expect(score).toBeGreaterThan(0);
    });

    it("Levenshtein距離が小さい場合はスコア加点", () => {
      const score = calculateSimilarity("auht", "auth"); // typo
      expect(score).toBeGreaterThan(0);
    });

    it("全く関係ない文字列はスコア0", () => {
      const score = calculateSimilarity("xyz", "auth");
      expect(score).toBe(0);
    });
  });
});
