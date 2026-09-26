import { expect, it } from "vitest";
import { josa, q } from "@/lib/korean";

it("받침에 따라 조사를 고른다", () => {
  expect(q("풋살", "이/가")).toBe("'풋살'이");
  expect(q("자료구조 과제", "을/를")).toBe("'자료구조 과제'를");
  expect(josa("학교", "으로/로")).toBe("학교로");
  expect(josa("도서관", "으로/로")).toBe("도서관으로");
  expect(josa("서울", "으로/로")).toBe("서울로");
  expect(q("CLASS FC", "이/가")).toBe("'CLASS FC'이(가)");
  expect(q("과제 3 (힙 구현)", "을/를")).toBe("'과제 3 (힙 구현)'을");
  expect(q("선형대수 과제 4", "을/를")).toBe("'선형대수 과제 4'를");
  expect(q("과제 3", "을/를")).toBe("'과제 3'을");
  expect(josa("7", "으로/로")).toBe("7로");
});
