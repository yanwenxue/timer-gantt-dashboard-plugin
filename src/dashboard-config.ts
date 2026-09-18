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
    groups: [],
    // Keep table/view references remappable when the host copies this widget.
    series: "COUNTA"
  };
  // Field IDs are retained within the copied table; never persist the source table ID here.
  return { dataConditions: [condition], customConfig: { version: 3, themeColor,
    sourceFields: Object.fromEntries(roles.map(role => [role, source[role]])) } };
}

export function readDashboardConfig(config: IConfig, { allowIncomplete = false } = {}): SavedConfig {
  const custom = config.customConfig ?? {};
  if (custom.version === undefined) {
    // Earlier releases stored explicit IDs or field names in customConfig.
    // Ignore retired settings such as identityFieldId when reading them.
    const previous = custom.sourceConfig as Partial<DataSourceConfig> | undefined;
    const sourceConfig = previous ? Object.fromEntries(Object.keys(emptySourceConfig).map(key =>
      [key, previous[key as keyof DataSourceConfig] ?? ""])) as DataSourceConfig : undefined;
    const fieldMapping = custom.fieldMapping as Partial<LegacyFieldMapping> | undefined;
    if (!allowIncomplete && !fieldMapping && (!sourceConfig || !isSourceConfigReady(sourceConfig))) {
      throw new Error(t("仪表盘配置不完整，请重新配置字段"));
    }
    return { sourceConfig, fieldMapping, themeColor: custom.themeColor };
  }
  if (custom.version !== 2 && custom.version !== 3) throw new Error(t("仪表盘配置不完整，请重新配置字段"));
  const conditions = Array.isArray(config.dataConditions) ? config.dataConditions : [config.dataConditions];
  const condition = conditions[0];
  const indices = custom.sourceRoles as Record<string, number> | undefined;
  const sourceFields = custom.sourceFields as Record<string, unknown> | undefined;
  const series: ISeries[] = Array.isArray(condition?.series) ? condition.series : [];
  const source = { ...emptySourceConfig, tableId: condition?.tableId ?? "",
    viewId: condition?.dataRange?.type === "VIEW" ? condition.dataRange.viewId : "" };
  for (const role of roles) {
    const index = indices?.[role] ?? -1;
    source[role] = custom.version === 3
      ? (typeof sourceFields?.[role] === "string" ? sourceFields[role] : "")
      : series[index]?.fieldId ?? "";
  }
  // Editors may repair incomplete settings; viewers need the required field mappings.
  if (!allowIncomplete && !isSourceConfigReady(source)) throw new Error(t("仪表盘配置不完整，请重新配置字段"));
  return { themeColor: custom.themeColor, sourceConfig: source };
}
