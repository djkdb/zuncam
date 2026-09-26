import { z } from "zod";
import { DEFAULT_SETTINGS, type CampusData } from "./types";

/** 입력/저장 데이터 검증용 스키마. localStorage 데이터가 깨졌을 때도 앱이 죽지 않도록 사용한다. */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");
export const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "HH:mm 형식이어야 합니다");

const base = {
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
};

export const timetableEntrySchema = z.object({
  ...base,
  subject: z.string().min(1),
  professor: z.string().default(""),
  weekday: z.number().int().min(0).max(6),
  startTime: hhmm,
  endTime: hhmm,
  room: z.string().default(""),
  location: z.string().default(""),
  memo: z.string().default(""),
});

export const assignmentSchema = z.object({
  ...base,
  title: z.string().min(1),
  subject: z.string().default(""),
  dueDate: isoDate,
  dueTime: hhmm,
  estimatedMinutes: z.number().int().min(0).max(60 * 24 * 7),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: z.enum(["todo", "in_progress", "done"]),
  memo: z.string().default(""),
});

export const eventSchema = z.object({
  ...base,
  title: z.string().min(1),
  date: isoDate,
  startTime: hhmm,
  endTime: hhmm,
  location: z.string().default(""),
  category: z.enum(["school", "appointment", "club", "exercise", "personal", "etc"]),
  memo: z.string().default(""),
  travelMinutes: z.number().int().min(0).max(600).nullable().default(null),
});

export const settingsSchema = z.object({
  userName: z.string().default(DEFAULT_SETTINGS.userName),
  dayStart: hhmm.default(DEFAULT_SETTINGS.dayStart),
  dayEnd: hhmm.default(DEFAULT_SETTINGS.dayEnd),
  reserveMeals: z.boolean().default(DEFAULT_SETTINGS.reserveMeals),
  departureBufferMinutes: z.number().int().min(0).max(60).default(DEFAULT_SETTINGS.departureBufferMinutes),
});

/**
 * 컬렉션 단위가 아니라 "항목 단위"로 검증한다.
 * 하나의 항목이 깨졌다고 전체 데이터를 버리지 않기 위해서다.
 */
export function parseCampusData(raw: unknown): { data: CampusData; dropped: number } {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  let dropped = 0;
  const pick = <T>(schema: z.ZodType<T>, list: unknown): T[] => {
    if (!Array.isArray(list)) return [];
    const out: T[] = [];
    for (const item of list) {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else dropped++;
    }
    return out;
  };
  const settings = settingsSchema.safeParse(obj.settings ?? {});
  return {
    data: {
      version: 1,
      settings: settings.success ? settings.data : { ...DEFAULT_SETTINGS },
      timetable: pick(timetableEntrySchema, obj.timetable) as CampusData["timetable"],
      assignments: pick(assignmentSchema, obj.assignments),
      events: pick(eventSchema, obj.events),
    },
    dropped,
  };
}
