import { t } from "./i18n";
import type { IRecord, ITable } from "@lark-base-open/js-sdk";
import type { DataSourceConfig, TimerRun } from "./types";
import { makeDashboardConfig } from "./dashboard-config";
import { isSourceConfigReady } from "./source-config";
import { byStartTime, getRecordDurationSeconds } from "./time";

export type RunsResult = { runs: TimerRun[]; skipped: number };

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

async function readRecords(table: ITable, viewId: string): Promise<IRecord[]> {
  // Validate an explicit view instead of silently falling back to the whole table.
  if (viewId) await table.getViewById(viewId);
  const records: IRecord[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  do {
    // This SDK version exposes getRecords, not the newer getRecordsByPage API.
    const page = await table.getRecords({ pageSize: 200, pageToken, viewId: viewId || undefined });
    for (const record of page.records) records.push(record);
    if (!page.hasMore) return records;
    if (!page.pageToken || seenTokens.has(page.pageToken)) {
      throw new Error(t("记录分页异常，请刷新重试"));
    }
    seenTokens.add(page.pageToken);
    pageToken = page.pageToken;
  } while (true);
}

export async function readTableRuns(table: ITable, config: DataSourceConfig): Promise<RunsResult> {
  const records = await readRecords(table, config.viewId);
  const runs: TimerRun[] = [];
  let skipped = 0;
  for (const { recordId: id, fields } of records) {
    const taskName = cellText(fields[config.taskNameFieldId]).trim();
    const start = fields[config.startTimeFieldId];
    const end = fields[config.endTimeFieldId];
    // Date fields contain milliseconds. Never infer seconds or parse their display format.
    if (!taskName || typeof start !== "number" || typeof end !== "number" ||
        !Number.isFinite(start) || !Number.isFinite(end) ||
        Math.abs(start) > 8.64e15 || Math.abs(end) > 8.64e15 || end < start) {
      skipped++;
      continue;
    }
    const durationValue = fields[config.durationSecondsFieldId];
    const durationText = Array.isArray(durationValue) && durationValue.length !== 1 ? "" : cellText(durationValue);
    runs.push({ id, tableId: table.id, viewId: config.viewId || undefined, taskName, start, end,
      durationSeconds: getRecordDurationSeconds(start, end, durationText) });
  }
  return { runs: runs.sort(byStartTime), skipped };
}

export async function loadLarkRuns(config: DataSourceConfig): Promise<RunsResult> {
  if (!isSourceConfigReady(config)) throw new Error(t("请先选择数据表和必需字段"));
  const { base } = await import("@lark-base-open/js-sdk");
  return readTableRuns(await base.getTableById(config.tableId), config);
}
