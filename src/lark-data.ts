import { t } from "./i18n";
import type { IData, IRecord, ITable } from "@lark-base-open/js-sdk";
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

export async function readTableRuns(table: ITable, config: DataSourceConfig, data?: IData): Promise<RunsResult> {
  const records = await readRecords(table, config.viewId);
  let allowedIds: Set<string> | undefined;
  if (data) {
    const keyToId = new Map<string, string>();
    for (const record of records) {
      const key = cellText(record.fields[config.identityFieldId!]);
      if (!key.trim() || keyToId.has(key)) throw new Error(t("记录唯一标识必须非空且不重复，请选择自动编号或唯一文本字段"));
      keyToId.set(key, record.recordId);
    }
    allowedIds = new Set();
    for (const row of data.slice(1)) {
      // A retained group with zero counts is not a matching execution.
      if (!row.slice(1).some(cell => typeof cell.value === "number" && cell.value > 0)) continue;
      const key = row[0]?.value;
      if (key == null) throw new Error(t("筛选结果缺少记录标识，请检查唯一标识字段"));
      const id = keyToId.get(String(key));
      // Fail closed if reads straddle a data change; never show unfiltered records.
      if (!id) throw new Error(t("数据已变化或标识格式不匹配，请刷新重试"));
      allowedIds.add(id);
    }
  }
  const runs: TimerRun[] = [];
  let skipped = 0;
  for (const { recordId: id, fields } of records) {
    if (allowedIds && !allowedIds.has(id)) continue;
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

export async function loadLarkRuns(config: DataSourceConfig, changedData?: IData): Promise<RunsResult> {
  if (!isSourceConfigReady(config)) throw new Error(t("请先选择数据表和必需字段"));
  if (!config.identityFieldId) throw new Error(t("请选择记录唯一标识，预览并保存后即可应用仪表盘筛选。"));
  const { base, dashboard, DashboardState } = await import("@lark-base-open/js-sdk");
  const data = await (dashboard.state === DashboardState.Create || dashboard.state === DashboardState.Config
    ? dashboard.getPreviewData(makeDashboardConfig(config).dataConditions) : changedData ?? dashboard.getData());
  if (!Array.isArray(data)) throw new Error(t("筛选结果缺少记录标识，请检查唯一标识字段"));
  return readTableRuns(await base.getTableById(config.tableId), config, data);
}
