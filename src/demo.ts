import { parseTime } from "./time";
import type { TimerRun } from "./types";
const examples = [
  {
    id: "mock-1",
    taskName: "【组装机】价格每日持久化",
    start: "2026-08-10 06:00:09",
    end: "2026-08-10 06:00:10",
    durationSeconds: 1
  },
  {
    id: "mock-2",
    taskName: "价格每日持久化",
    start: "2026-08-11 10:37:07",
    end: "2026-08-11 15:37:17",
    durationSeconds: 18010
  },
  {
    id: "mock-3",
    taskName: "价格每日持久化",
    start: "2026-08-11 10:42:21",
    end: "2026-08-11 11:09:04",
    durationSeconds: 1603
  }
];

export const mockRuns: TimerRun[] = examples.map(run => ({...run, start: parseTime(run.start), end: parseTime(run.end)}));
