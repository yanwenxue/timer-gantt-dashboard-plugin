import { t } from "./i18n";
import type { BaseSchema, DataSourceConfig, LegacyFieldMapping, FieldOption, FieldRole, SelectOption } from "./types";
export const emptySourceConfig: DataSourceConfig = {
  tableId: "",
  viewId: "",
  identityFieldId: "",
  taskNameFieldId: "",
  startTimeFieldId: "",
  endTimeFieldId: "",
  durationSecondsFieldId: ""
};

export const defaultLegacyMapping: LegacyFieldMapping = {
  tableName: "日统计",
  taskName: "任务名称结构化",
  startTime: "执行开始时间",
  endTime: "执行结束时间",
  durationSeconds: "耗时秒"
};

export const textLikeFieldTypes = new Set([1, 3, 20, 1005]);
export const dateLikeFieldTypes = new Set([5, 1001, 1002]);
export const numberLikeFieldTypes = new Set([2, 20]);
export function isSourceConfigReady(config: DataSourceConfig): boolean {
  return Boolean(config.tableId && config.taskNameFieldId && config.startTimeFieldId && config.endTimeFieldId);
}

/** Validate against the currently loaded table before persisting a selection. */
export function isSourceConfigValid(config: DataSourceConfig, schema: BaseSchema): boolean {
  const hasField = (id: string, role: FieldRole) => schema.fields.some(field => field.id === id && fieldMatchesRole(field, role));
  return schema.tables.some(table => table.id === config.tableId)
    && (!config.viewId || schema.views.some(view => view.id === config.viewId))
    && hasField(config.taskNameFieldId, "taskName")
    && hasField(config.startTimeFieldId, "startTime")
    && hasField(config.endTimeFieldId, "endTime")
    && (!config.durationSecondsFieldId || hasField(config.durationSecondsFieldId, "durationSeconds"));
}

export function fieldMatchesRole(field: FieldOption, role: FieldRole): boolean {
  if (role === "startTime" || role === "endTime") {
    return dateLikeFieldTypes.has(field.type);
  }

  if (role === "durationSeconds") {
    return numberLikeFieldTypes.has(field.type);
  }

  return textLikeFieldTypes.has(field.type);
}

export function fieldOptionsForRole(fields: FieldOption[], role: FieldRole): FieldOption[] {
  return fields.filter((field) => fieldMatchesRole(field, role));
}

export function fieldTypeLabel(type: number): string {
  const labels: Record<number, string> = {
    1: "文本",
    2: "数字",
    3: "单选",
    5: "日期时间",
    20: "公式",
    1001: "创建时间",
    1002: "更新时间",
    1005: "自动编号"
  };

  return labels[type] ? t(labels[type]) : t("类型 {type}", { type });
}

export function toFieldSelectOptions(fields: FieldOption[]): SelectOption[] {
  return fields.map((field) => ({
    id: field.id,
    name: field.name,
    meta: fieldTypeLabel(field.type),
    type: field.type
  }));
}

export function findFieldByName(fields: FieldOption[], name: string, role: FieldRole): string {
  return fields.find((field) => field.name === name && fieldMatchesRole(field, role))?.id ?? "";
}

export function normalizeSourceConfig(
  current: DataSourceConfig,
  schema: BaseSchema,
  legacyMapping: LegacyFieldMapping
): DataSourceConfig {
  const taskFields = fieldOptionsForRole(schema.fields, "taskName");
  const dateFields = fieldOptionsForRole(schema.fields, "startTime");
  const firstDateFieldId = dateFields[0]?.id ?? "";
  const secondDateFieldId = dateFields.find((field) => field.id !== firstDateFieldId)?.id ?? firstDateFieldId;

  return {
    identityFieldId: current.identityFieldId || (!current.taskNameFieldId ? schema.fields.find(field => field.type === 1005)?.id : "") || "",
    tableId: current.tableId || schema.tables[0]?.id || "",
    viewId: current.viewId,
    taskNameFieldId:
      current.taskNameFieldId ||
      findFieldByName(schema.fields, legacyMapping.taskName, "taskName") ||
      taskFields[0]?.id ||
      "",
    startTimeFieldId:
      current.startTimeFieldId ||
      findFieldByName(schema.fields, legacyMapping.startTime, "startTime") ||
      firstDateFieldId,
    endTimeFieldId:
      current.endTimeFieldId ||
      findFieldByName(schema.fields, legacyMapping.endTime, "endTime") ||
      secondDateFieldId,
    durationSecondsFieldId: current.durationSecondsFieldId || (!current.taskNameFieldId
      ? findFieldByName(schema.fields, legacyMapping.durationSeconds, "durationSeconds") : "")
  };
}

export function isSameSourceConfig(left: DataSourceConfig, right: DataSourceConfig): boolean {
  return (
    (left.identityFieldId || "") === (right.identityFieldId || "") &&
    left.tableId === right.tableId &&
    left.viewId === right.viewId &&
    left.taskNameFieldId === right.taskNameFieldId &&
    left.startTimeFieldId === right.startTimeFieldId &&
    left.endTimeFieldId === right.endTimeFieldId &&
    left.durationSecondsFieldId === right.durationSecondsFieldId
  );
}
