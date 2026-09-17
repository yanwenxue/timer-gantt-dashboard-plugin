import type { IConfig, IDataCondition, ISeries, SourceType } from "@lark-base-open/js-sdk";
import type { DataSourceConfig, LegacyFieldMapping } from "./types";
import { t } from "./i18n";
import { emptySourceConfig, isSourceConfigReady } from "./source-config";

export type SavedConfig = { sourceConfig?: Partial<DataSourceConfig>; fieldMapping?: Partial<LegacyFieldMapping>; themeColor?: unknown };
const roles = ["taskNameFieldId", "startTimeFieldId", "endTimeFieldId", "durationSecondsFieldId"] as const;

/** The host supports one condition and remaps its table/view IDs when copying a Base. */
export function makeDashboardConfig(source: DataSourceConfig, themeColor?: string): IConfig {
  const condition: IDataCondition = {
    tableId: source.tableId,
    dataRange: source.viewId ? { type: "VIEW" as SourceType.VIEW, viewId: source.viewId, viewName: "" } : { type: "ALL" as SourceType.ALL },
    groups: source.identityFieldId ? [{ fieldId: source.identityFieldId }] : [],
    // Field-level COUNTA is not supported by the pinned SDK/host. Count records instead.
    series: "COUNTA"
  };
  // Field IDs are retained within the copied table; never persist the source table ID here.
  return { dataConditions: [condition], customConfig: { version: 3, themeColor,
    sourceFields: Object.fromEntries(roles.map(role => [role, source[role]])) } };
}

export function readDashboardConfig(config: IConfig, { allowIncomplete = false } = {}): SavedConfig {
  const custom = config.customConfig ?? {};
  if (custom.version !== 3 && !allowIncomplete) {
    throw new Error(t("旧配置需要升级：请打开组件配置，选择记录唯一标识并保存。"));
  }
  if (custom.version !== 2 && custom.version !== 3) return custom as SavedConfig;
  const conditions = Array.isArray(config.dataConditions) ? config.dataConditions : [config.dataConditions];
  const condition = conditions[0];
  const indices = custom.sourceRoles as Record<string, number> | undefined;
  const sourceFields = custom.sourceFields as Record<string, unknown> | undefined;
  const series: ISeries[] = Array.isArray(condition?.series) ? condition.series : [];
  const source = { ...emptySourceConfig, tableId: condition?.tableId ?? "",
    viewId: condition?.dataRange?.type === "VIEW" ? condition.dataRange.viewId : "",
    identityFieldId: condition?.groups?.[0]?.fieldId ?? "" };
  for (const role of roles) {
    const index = indices?.[role] ?? -1;
    source[role] = custom.version === 3
      ? (typeof sourceFields?.[role] === "string" ? sourceFields[role] : "")
      : series[index]?.fieldId ?? "";
  }
  // An editor can repair missing fields; a viewer must never bypass dashboard filtering.
  if (!allowIncomplete && (!isSourceConfigReady(source) || !source.identityFieldId)) throw new Error(t("仪表盘配置不完整，请重新配置字段"));
  return { themeColor: custom.themeColor, sourceConfig: source };
}
