import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from './load-module.mjs';
const { makeDashboardConfig, readDashboardConfig } = await loadModule('dashboard-config.ts');
const source = { tableId:'table', viewId:'view', taskNameFieldId:'task',
 startTimeFieldId:'start', endTimeFieldId:'end', durationSecondsFieldId:'duration' };

test('saving needs no unique field and copies use the remapped table/view',()=>{
 const saved=makeDashboardConfig(source,'#58b7a4');
 assert.equal(saved.dataConditions.length,1);
 assert.deepEqual(saved.dataConditions[0].groups,[]);
 assert.equal(saved.customConfig.sourceConfig,undefined);
 assert.equal(saved.customConfig.sourceFields.tableId,undefined);
 const copy=structuredClone(saved);
 copy.dataConditions[0].tableId='copy';copy.dataConditions[0].dataRange.viewId='copy-view';
 copy.customConfig.sourceConfig=source;
 assert.deepEqual(readDashboardConfig(copy),{sourceConfig:{...source,tableId:'copy',viewId:'copy-view'},themeColor:'#58b7a4'});
});

test('legacy IDs, name mappings and v2/v3 configs remain readable without an upgrade',()=>{
 const legacy={dataConditions:[],customConfig:{sourceConfig:{...source,identityFieldId:'retired'},themeColor:'#123456'}};
 assert.deepEqual(readDashboardConfig(legacy).sourceConfig,source);
 assert.equal(readDashboardConfig(legacy).themeColor,'#123456');
 const mapping={tableName:'old table',taskName:'task',startTime:'start',endTime:'end',durationSeconds:'duration'};
 assert.deepEqual(readDashboardConfig({customConfig:{fieldMapping:mapping}}).fieldMapping,mapping);
 const v2={dataConditions:[{tableId:'table',dataRange:{type:'VIEW',viewId:'view'},
 groups:[{fieldId:'deleted-identity'}],series:['task','start','end','duration'].map(fieldId=>({fieldId,rollup:'COUNTA'}))}],
 customConfig:{version:2,sourceRoles:{taskNameFieldId:0,startTimeFieldId:1,endTimeFieldId:2,durationSecondsFieldId:3}}};
 assert.deepEqual(readDashboardConfig(v2).sourceConfig,source);
 const v3=makeDashboardConfig(source);v3.dataConditions[0].groups=[{fieldId:'deleted-identity'}];
 assert.deepEqual(readDashboardConfig(v3).sourceConfig,source);
 const optional={...source,viewId:'',durationSecondsFieldId:'',endTimeFieldId:'start'};
 assert.deepEqual(readDashboardConfig(makeDashboardConfig(optional)).sourceConfig,optional);
});

test('missing required fields remain repairable in the editor',()=>{
 const saved=makeDashboardConfig(source,'#123456');saved.customConfig.sourceFields.startTimeFieldId='';
 assert.throws(()=>readDashboardConfig(saved));
 assert.deepEqual(readDashboardConfig(saved,{allowIncomplete:true}),{sourceConfig:{...source,startTimeFieldId:''},themeColor:'#123456'});
 assert.throws(()=>readDashboardConfig({customConfig:{}}));
});

const rows={r1:{task:'same task',start:1000.125,end:2000.5,duration:0},
 r2:{task:'same task',start:1000.125,end:2000.5,duration:1.000375}};
const sdk={base:{},dashboard:{}};globalThis.dashboardDataSdk=sdk;
const {loadLarkRuns}=await loadModule('lark-data.ts',{'@lark-base-open/js-sdk':
 'export const base=globalThis.dashboardDataSdk.base; export const dashboard=globalThis.dashboardDataSdk.dashboard;'});

test('all lifecycle states read records without user-defined keys or merging identical executions',async()=>{
 sdk.dashboard.getData=sdk.dashboard.getPreviewData=async()=>{throw Error('aggregation must not be read');};
 sdk.base.getTableById=async()=>({id:'table',getViewById:async id=>{assert.equal(id,'view');return {id};},
 getRecords:async options=>{assert.equal(options.viewId,'view');return {hasMore:false,
 records:Object.entries(rows).map(([recordId,fields])=>({recordId,fields}))};}});
 for(const state of ['Create','Config','View','FullScreen']) {
  sdk.dashboard.state=state;
  const result=await loadLarkRuns(source);
  assert.deepEqual(result.runs.map(run=>run.id),['r1','r2']);
  assert.equal(result.runs[0].durationSeconds,0);
  assert.equal(result.runs[1].durationSeconds,1.000375);
  assert.equal(result.runs[0].start,1000.125);
 }
 sdk.base.getTableById=async()=>{throw Error('permission denied');};
 await assert.rejects(loadLarkRuns(source),/permission denied/);
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
