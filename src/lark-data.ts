import type { ITable } from "@lark-base-open/js-sdk";
import type { DataSourceConfig, TimerRun } from "./types";
import { isSourceConfigReady } from "./source-config";
import { byStartTime, getRecordDurationSeconds } from "./time";

export type RunsResult = { runs: TimerRun[]; skipped: number };
type ColumnValue = { record_id: string | undefined; value: unknown };

/** Text, select, formula and autonumber values returned by the SDK. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cellText).join("");
  if (typeof value === "object") {
    if ("status" in value && value.status === "calculating") return "";
    if ("text" in value) return cellText(value.text);
    if ("value" in value) return cellText(value.value);
    if ("name" in value) return cellText(value.name);
  }
  return "";
}

function indexColumn(values: ColumnValue[]) {
  return new Map(values.filter(item => item.record_id).map(item => [item.record_id!, item.value]));
}

export async function readTableRuns(table: ITable, config: DataSourceConfig): Promise<RunsResult> {
  // Empty viewId means the whole table. A missing selected view is an error, never a fallback.
  const recordIds = config.viewId
    ? (await (await table.getViewById(config.viewId)).getVisibleRecordIdList()).filter((id): id is string => Boolean(id))
    : await table.getRecordIdList();
  if (!recordIds.length) return { runs: [], skipped: 0 };
  const ids = [config.taskNameFieldId, config.startTimeFieldId, config.endTimeFieldId, config.durationSecondsFieldId];
  const columns = await Promise.all(ids.map(async id => id
    ? indexColumn(await (await table.getFieldById(id)).getFieldValueList())
    : new Map<string, unknown>()));
  const [names, starts, ends, durations] = columns;
  const runs: TimerRun[] = [];
  let skipped = 0;
  for (const id of recordIds) {
    const taskName = cellText(names.get(id)).trim();
    const start = starts.get(id);
    const end = ends.get(id);
    // Date fields contain milliseconds. Never infer seconds or parse their display format.
    if (!taskName || typeof start !== "number" || typeof end !== "number" ||
        !Number.isFinite(start) || !Number.isFinite(end) ||
        Math.abs(start) > 8.64e15 || Math.abs(end) > 8.64e15 || end < start) {
      skipped++;
      continue;
    }
    const durationValue = durations.get(id);
    const durationText = Array.isArray(durationValue) && durationValue.length !== 1 ? "" : cellText(durationValue);
    runs.push({ id, tableId: table.id, viewId: config.viewId || undefined, taskName, start, end,
      durationSeconds: getRecordDurationSeconds(start, end, durationText) });
  }
  return { runs: runs.sort(byStartTime), skipped };
}

export async function loadLarkRuns(config: DataSourceConfig): Promise<RunsResult> {
  if (!isSourceConfigReady(config)) throw new Error("请先选择数据表和必需字段");
  const { base } = await import("@lark-base-open/js-sdk");
  return readTableRuns(await base.getTableById(config.tableId), config);
}
