import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './load-module.mjs';

const { emptySourceConfig, defaultLegacyMapping } = await loadModule('source-config.ts');
globalThis.schemaDiscoverySdk = { getTableList: async () => [] };
const { loadBaseSchema } = await loadModule('lark-schema.ts', {
  '@lark-base-open/js-sdk': 'export const base=globalThis.schemaDiscoverySdk;'
});
const fields = [
  { id:'task', name:'任务名称结构化', type:1 },
  { id:'start', name:'执行开始时间', type:5 },
  { id:'end', name:'执行结束时间', type:5 },
  { id:'identity', name:'ID', type:1005 }
];
function table(id, schema) {
  return { id, reads:0, getName:async()=>id, getViewList:async()=>[],
    async getFieldMetaList() { this.reads++; return schema; } };
}

test('initialization skips unsuitable tables and reuses metadata from the suitable table',async()=>{
  const tables=[table('notes',fields.slice(0,1)),table('one-date',fields.slice(0,2)),table('executions',fields),table('later',fields)];
  globalThis.schemaDiscoverySdk.getTableList=async()=>tables;
  const result=await loadBaseSchema(emptySourceConfig,defaultLegacyMapping);
  assert.equal(result.config.tableId,'executions');
  assert.equal(result.config.startTimeFieldId,'start');
  assert.equal(result.config.endTimeFieldId,'end');
  assert.equal(result.config.identityFieldId,'identity');
  assert.deepEqual(tables.map(item=>item.reads),[1,1,1,0]);
  assert.equal(result.schema.tables.length,4);
});

test('explicit table IDs and legacy table names take precedence over automatic discovery',async()=>{
  for (const explicit of [true,false]) {
    const tables=[table('suitable',fields),table('selected',fields.slice(0,1))];
    globalThis.schemaDiscoverySdk.getTableList=async()=>tables;
    const result=await loadBaseSchema({...emptySourceConfig,tableId:explicit?'selected':''},
      {...defaultLegacyMapping,tableName:explicit?'suitable':'selected'});
    assert.equal(result.config.tableId,'selected');
    assert.deepEqual(tables.map(item=>item.reads),[0,1]);
  }
});

test('no suitable table leaves the first table editable; a deleted saved table is not replaced',async()=>{
  const tables=[table('notes',fields.slice(0,1)),table('numbers',[{id:'n',name:'Count',type:2}])];
  globalThis.schemaDiscoverySdk.getTableList=async()=>tables;
  const first=await loadBaseSchema(emptySourceConfig,defaultLegacyMapping);
  assert.equal(first.config.tableId,'notes');
  assert.equal(first.config.startTimeFieldId,'');
  const missing=await loadBaseSchema({...emptySourceConfig,tableId:'deleted'},defaultLegacyMapping);
  assert.equal(missing.config.tableId,'deleted');
  assert.equal(missing.schema.fields.length,0);
  assert.equal(missing.schema.tables.length,2);
});
