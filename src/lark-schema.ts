import type { IFieldMeta, ITable } from "@lark-base-open/js-sdk";
import type { BaseSchema, DataSourceConfig, LegacyFieldMapping } from "./types";
import { normalizeSourceConfig } from "./source-config";
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
  const tableId = config.tableId || tableOptions.find((item) => item.name === legacyMapping.tableName)?.id || tableOptions[0]?.id || "";
  const table = tables.find((item) => item.id === tableId);

  if (!table) {
    if (tableOptions.length) return { schema: { tables: tableOptions, views: [], fields: [] }, config };
    throw new Error("当前 Base 没有可读取的数据表");
  }

  const viewOptions = await Promise.all(
    (await table.getViewList()).map(async (view) => ({
      id: view.id,
      name: await view.getName()
    }))
  );
  const fieldOptions = (await table.getFieldMetaList()).map((field: IFieldMeta) => ({
    id: field.id,
    name: field.name,
    type: field.type
  }));
  const schema = { tables: tableOptions, views: viewOptions, fields: fieldOptions };

  return { schema, config: normalizeSourceConfig({ ...config, tableId: table.id }, schema, legacyMapping) };
}

