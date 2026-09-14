import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadModule} from './load-module.mjs';
const {readTableRuns,cellText} = await loadModule('lark-data.ts');
const {normalizeSourceConfig,emptySourceConfig,defaultLegacyMapping} = await loadModule('source-config.ts');
const time = await loadModule('time.ts');
const config = {...emptySourceConfig,tableId:'t',taskNameFieldId:'name',startTimeFieldId:'start',endTimeFieldId:'end'};
const start=Date.UTC(2026,8,14,2,0,9,125), end=start+61_250;
function table(rows,visible=Object.keys(rows)) {
  const calls=[];
  return {id:'t',calls,getRecordIdList:async()=>Object.keys(rows),
    getViewById:async id=>{calls.push('view:'+id);if(id!=='v')throw Error('view missing');return {getVisibleRecordIdList:async()=>visible};},
    getFieldById:async field=>({getCellString(){throw Error('must read raw values');},getFieldValueList:async()=>{
      calls.push('column:'+field);return Object.entries(rows).map(([id,row])=>({record_id:id,value:row[field]}));
    }})};
}
test('batch read preserves milliseconds, supported task names and computes missing durations',async()=>{
 const t=table({a:{name:[{text:'订单'},{text:'同步'}],start,end},b:{name:{text:'库存'},start,end:start+1}});
 const result=await readTableRuns(t,config);
 assert.equal(result.skipped,0);assert.equal(result.runs[0].start,start);assert.equal(result.runs[0].durationSeconds,61.25);
 assert.equal(result.runs[1].durationSeconds,.001);assert.equal(result.runs[0].taskName,'订单同步');assert.equal(t.calls.length,3);
});
test('whole-table and filtered views remain distinct; deleted view is an error',async()=>{
 const t=table({a:{name:'A',start,end},b:{name:'B',start,end}},['a']);
 assert.equal((await readTableRuns(t,config)).runs.length,2);
 assert.equal((await readTableRuns(t,{...config,viewId:'v'})).runs.length,1);
 await assert.rejects(readTableRuns(t,{...config,viewId:'missing'}),/view missing/);
});
test('blank duration computes interval, explicit zero and numeric formula are respected',async()=>{
 const t=table({a:{name:'A',start,end,duration:''},b:{name:'B',start,end,duration:0},c:{name:'C',start,end,duration:[12.5]},d:{name:'D',start,end,duration:-1}});
 const result=await readTableRuns(t,{...config,durationSecondsFieldId:'duration'});
 assert.deepEqual(result.runs.map(r=>r.durationSeconds),[61.25,0,12.5,61.25]);
});
test('invalid names/dates and reversed intervals are counted, never replaced by now',async()=>{
 const t=table({a:{name:'A',start:'2026/09/14',end},b:{name:'B',start,end:start-1},c:{name:'',start,end},d:{name:'D',start:Infinity,end},e:{name:'E',start,end}});
 const result=await readTableRuns(t,config);assert.equal(result.skipped,4);assert.equal(result.runs.length,1);
 assert(Number.isNaN(time.parseTime('bad date')));assert(Number.isNaN(time.parseTime('')));
 assert.equal(time.parseTime('2026-09-14T10:00:09.125+08:00'),start);
});
test('1000 records require four column calls, not 4000 cell calls',async()=>{
 const t=table(Object.fromEntries(Array.from({length:1000},(_,i)=>[String(i),{name:'A',start,end,duration:60}])));
 assert.equal((await readTableRuns(t,{...config,durationSecondsFieldId:'duration'})).runs.length,1000);
 assert.equal(t.calls.length,4);
});
test('empty table stays empty and does not read columns',async()=>{
 const t=table({});assert.deepEqual(await readTableRuns(t,config),{runs:[],skipped:0});assert.equal(t.calls.length,0);
});
test('saved empty options and missing selected ids are not silently replaced',()=>{
 const schema={tables:[{id:'t'}],views:[{id:'v'}],fields:[{id:'name',type:1},{id:'start',type:5},{id:'end',type:5},{id:'retries',type:2}]};
 assert.deepEqual(normalizeSourceConfig(config,schema,defaultLegacyMapping),config);
 const missing={...config,viewId:'deleted',durationSecondsFieldId:'deleted',taskNameFieldId:'deleted'};
 assert.deepEqual(normalizeSourceConfig(missing,schema,defaultLegacyMapping),missing);
});
test('autonumber and formula cell shapes are supported',()=>{
 assert.equal(cellText({value:'RUN-001',status:'completed'}),'RUN-001');assert.equal(cellText([{text:'订单'},12]),'订单12');
});
test('today and rolling windows advance with the supplied shared clock',()=>{
 const first=new Date(2026,8,14,12).getTime(),next=new Date(2026,8,15,12).getTime();
 assert.equal(new Date(time.getTimeWindowBounds('today',undefined,undefined,undefined,next)[0]).getDate(),15);
 assert.equal(time.getTimeWindowBounds('3d',undefined,undefined,undefined,next)[1],next);
 assert.notEqual(time.getTimeWindowBounds('today',undefined,undefined,undefined,first)[0],time.getTimeWindowBounds('today',undefined,undefined,undefined,next)[0]);
});
