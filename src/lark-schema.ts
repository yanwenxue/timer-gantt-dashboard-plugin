import { t } from "./i18n";
import type { IFieldMeta, ITable } from "@lark-base-open/js-sdk";
import type { BaseSchema, DataSourceConfig, LegacyFieldMapping } from "./types";
import { fieldMatchesRole, normalizeSourceConfig } from "./source-config";
export async function loadBaseSchema(
  config: DataSourceConfig,
  legacyMapping: LegacyFieldMapping
): Promise<{ schema: BaseSchema; config: DataSourceConfig }> {
  const sdk = await import("@lark-base-open/js-sdk");
  const tableList = await sdk.base.getTableList();
  const tables = tableList as ITable[];
  const tableOptions = await Promise.all(
    tables.map(async (item) => ({
      id: item.id,
      name: await item.getName()
    }))
  );
  let tableId = config.tableId || tableOptions.find((item) => item.name === legacyMapping.tableName)?.id || "";
  const fieldCache = new Map<string, IFieldMeta[]>();
  if (!tableId) {
    for (const candidate of tables) {
      const fields = await candidate.getFieldMetaList();
      fieldCache.set(candidate.id, fields);
      if (fields.some(field => fieldMatchesRole(field, "taskName")) &&
          fields.filter(field => fieldMatchesRole(field, "startTime")).length >= 2) {
        tableId = candidate.id;
        break;
      }
    }
    tableId ||= tableOptions[0]?.id || "";
  }
  const table = tables.find((item) => item.id === tableId);

  if (!table) {
    if (tableOptions.length) return { schema: { tables: tableOptions, views: [], fields: [] }, config };
    throw new Error(t("当前 Base 没有可读取的数据表"));
  }

  const views = await table.getViewList();
  const viewOptions = await Promise.all(
    views.map(async (view) => ({
      id: view.id,
      name: await view.getName()
    }))
  );
  const selectedView = config.viewId ? views.find(view => view.id === config.viewId) : views[0];
  // The view preserves the user-defined field order. Keep hidden fields selectable as well.
  const allFields = fieldCache.get(table.id) ?? await table.getFieldMetaList();
  const ordered = selectedView ? await selectedView.getFieldMetaList() : allFields;
  const orderedIds = new Set(ordered.map(field => field.id));
  const fieldOptions = [...ordered, ...allFields.filter(field => !orderedIds.has(field.id))].map((field: IFieldMeta) => ({
    id: field.id,
    name: field.name,
    type: field.type
  }));
  const schema = { tables: tableOptions, views: viewOptions, fields: fieldOptions };

  return { schema, config: normalizeSourceConfig({ ...config, tableId: table.id }, schema, legacyMapping) };
}
