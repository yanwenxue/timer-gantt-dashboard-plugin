import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './load-module.mjs';
const { makeDashboardConfig, readDashboardConfig } = await loadModule('dashboard-config.ts');
const source = { tableId:'table', viewId:'view', identityFieldId:'identity', taskNameFieldId:'task',
  startTimeFieldId:'start', endTimeFieldId:'end', durationSecondsFieldId:'duration' };

test('copy mapping uses the host table/view and keeps field IDs within the copied table', () => {
  const saved = makeDashboardConfig(source, '#58b7a4');
  assert.equal(saved.dataConditions.length, 1);
  assert.equal(saved.dataConditions[0].series, 'COUNTA');
  assert.equal(saved.customConfig.sourceConfig, undefined);
  assert.equal(saved.customConfig.sourceFields.tableId, undefined);
  const copied = structuredClone(saved), condition=copied.dataConditions[0];
  condition.tableId='copy-table'; condition.dataRange.viewId='copy-view';
  copied.customConfig.sourceConfig=source;
  assert.deepEqual(readDashboardConfig(copied).sourceConfig,{...source,tableId:'copy-table',viewId:'copy-view'});
  assert.equal(readDashboardConfig(copied).themeColor, '#58b7a4');
});
test('optional duration and reused fields round-trip; legacy configs remain readable', () => {
  const config={...source,viewId:'',durationSecondsFieldId:'',endTimeFieldId:'start'};
  assert.deepEqual(readDashboardConfig(makeDashboardConfig(config)).sourceConfig,config);
  const legacy={dataConditions:[],customConfig:{sourceConfig:source}};
  assert.deepEqual(readDashboardConfig(legacy,{allowIncomplete:true}).sourceConfig,source);
  assert.throws(()=>readDashboardConfig(legacy),/旧配置需要升级/);
});

const rows = { r1:{identity:[{text:'RUN-001'}],task:'same task',start:1000.125,end:2000.5,duration:0},
  r2:{identity:{value:'RUN-002'},task:'same task',start:1000.125,end:2000.5,duration:1.000375} };
function table(values = rows) { return { id:'table', getRecords:async()=>({hasMore:false,
  records:Object.entries(values).map(([recordId,fields])=>({recordId,fields}))}) }; }
const data = (...keys) => [[{value:'identity',text:'identity'}],...keys.map(key=>[{value:key,text:String(key)},{value:1,text:'1'}])];
const sdk = { base:{getTableById:async()=>table()}, dashboard:{} };
globalThis.dashboardDataSdk=sdk;
const { loadLarkRuns,readTableRuns } = await loadModule('lark-data.ts',{
  '@lark-base-open/js-sdk': `export const base=globalThis.dashboardDataSdk.base; export const dashboard=globalThis.dashboardDataSdk.dashboard;
   export const DashboardState={Create:'Create',Config:'Config',View:'View',FullScreen:'FullScreen'};`
});
const config = {...source,viewId:''};
test('create/config use preview; view/fullscreen use saved data and preserve exact records after global filtering', async()=>{
 for(const state of ['Create','Config','View','FullScreen']) {
  let preview=0,live=0;
  Object.assign(sdk.dashboard,{state,getPreviewData:async conditions=>{
   preview++;assert.deepEqual(conditions,makeDashboardConfig(config).dataConditions);return data('RUN-002');
  },getData:async()=>{live++;return data('RUN-002');}});
  const result=await loadLarkRuns(config);
  assert.equal(preview,state==='Create'||state==='Config'?1:0);assert.equal(live,1-preview);
  assert.equal(result.runs.length,1);assert.equal(result.runs[0].id,'r2');
  assert.equal(result.runs[0].start,1000.125);assert.equal(result.runs[0].end,2000.5);
 }
 const all=await readTableRuns(table(),config,data('RUN-001','RUN-002'));
 assert.equal(all.runs.length,2);assert.equal(all.runs[0].durationSeconds,0);
 assert.deepEqual(await readTableRuns(table(),config,data()),{runs:[],skipped:0});
});
test('duplicate/blank identities, unmapped results and API errors never fall back to unfiltered data',async()=>{
 await assert.rejects(readTableRuns(table({a:rows.r1,b:rows.r1}),config,data('RUN-001')),/非空且不重复/);
 await assert.rejects(readTableRuns(table({a:{...rows.r1,identity:''}}),config,data()),/非空且不重复/);
 await assert.rejects(readTableRuns(table(),config,data('missing')),/数据已变化/);
 sdk.dashboard.state='View';sdk.dashboard.getData=async()=>{throw Error('permission denied');};
 await assert.rejects(loadLarkRuns(config),/permission denied/);
});
test('numeric identity values match the unformatted group value',async()=>{
 const result=await readTableRuns(table({a:{...rows.r1,identity:1234}}),config,
   [[{value:'id',text:'id'}],[{value:1234,text:'1,234'},{value:1,text:'1'}]]);
 assert.equal(result.runs[0].id,'a');
});

test('field selectors use selected-view order while retaining hidden fields', async()=>{
 const fields=[{id:'a',name:'a',type:1},{id:'b',name:'b',type:5},{id:'c',name:'c',type:5}];
 const view=id=>({id,getName:async()=>id,getFieldMetaList:async()=>[fields[2],fields[0]]});
 const schemaSdk={getTableList:async()=>[{id:'table',getName:async()=> 'table',getViewList:async()=>[view('view')],getFieldMetaList:async()=>fields}]};
 globalThis.schemaSdk=schemaSdk;
 const {loadBaseSchema}=await loadModule('lark-schema.ts',{'@lark-base-open/js-sdk':'export const base=globalThis.schemaSdk;'});
 const result=await loadBaseSchema(source,{tableName:'',taskName:'',startTime:'',endTime:'',durationSeconds:''});
 assert.deepEqual(result.schema.fields.map(field=>field.id),['c','a','b']);
});
test('a missing remapped identity field fails closed instead of disabling global filters',()=>{
 const saved=makeDashboardConfig(source);saved.dataConditions[0].groups=[];
 assert.throws(()=>readDashboardConfig(saved),/配置不完整/);
});
test('editors can recover incomplete remapped settings while preserving usable fields and theme',()=>{
 const saved=makeDashboardConfig(source,'#58b7a4');saved.dataConditions[0].groups=[];
 const recovered=readDashboardConfig(saved,{allowIncomplete:true});
 assert.deepEqual(recovered.sourceConfig,{...source,identityFieldId:''});
 assert.equal(recovered.themeColor,'#58b7a4');
 assert.throws(()=>readDashboardConfig(saved),/配置不完整/);
});
test('zero-count groups and missing API responses cannot expose unfiltered records',async()=>{
 const zero=[[{value:'key',text:'key'}],[{value:'RUN-001',text:'RUN-001'},{value:0,text:'0'}]];
 assert.equal((await readTableRuns(table(),config,zero)).runs.length,0);
 sdk.dashboard.state='View';sdk.dashboard.getData=async()=>undefined;
 await assert.rejects(loadLarkRuns(config),/缺少记录标识/);
});

test('no dashboard lifecycle may fall back to raw records when the unique key is missing',async()=>{
 const original=sdk.base.getTableById;
 let reads=0;sdk.base.getTableById=async()=>{reads++;return table();};
 try {
  for(const state of ['Create','Config','View','FullScreen']) {
   sdk.dashboard.state=state;
   await assert.rejects(loadLarkRuns({...config,identityFieldId:''}),/请选择记录唯一标识/);
  }
  assert.equal(reads,0);
 }finally{sdk.base.getTableById=original;}
});

test('older field-count configs require resaving but retain every field in the editor',()=>{
 const config={dataConditions:[{tableId:'table',dataRange:{type:'VIEW',viewId:'view'},
  groups:[{fieldId:'identity'}],series:['task','start','end','duration'].map(fieldId=>({fieldId,rollup:'COUNTA'}))}],
  customConfig:{version:2,themeColor:'#58b7a4',sourceRoles:{taskNameFieldId:0,startTimeFieldId:1,endTimeFieldId:2,durationSecondsFieldId:3}}};
 assert.throws(()=>readDashboardConfig(config),/旧配置需要升级/);
 assert.deepEqual(readDashboardConfig(config,{allowIncomplete:true}),{sourceConfig:source,themeColor:'#58b7a4'});
});

test('view data-change snapshots override a stale host getData cache, while editors still preview current selections',async()=>{
 sdk.dashboard.state='View';
 sdk.dashboard.getData=async()=>data('RUN-001');
 assert.equal((await loadLarkRuns(config,data('RUN-002'))).runs[0].id,'r2');
 assert.equal((await loadLarkRuns(config,data())).runs.length,0);
 sdk.dashboard.state='Config';sdk.dashboard.getPreviewData=async()=>data('RUN-001');
 assert.equal((await loadLarkRuns(config,data('RUN-002'))).runs[0].id,'r1');
});
