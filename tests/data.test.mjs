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
  return {id:'t',calls,
    getViewById:async id=>{if(id!=='v')throw Error('view missing');return {id};},
    getRecords:async params=>{
      calls.push(params);
      assert(params.pageSize <= 200);
      const ids=params.viewId ? visible : Object.keys(rows);
      const offset=params.pageToken ? Number(params.pageToken.slice(5)) : 0;
      const next=offset+params.pageSize;
      return {records:ids.slice(offset,next).map(recordId=>({recordId,fields:rows[recordId]})),
        total:ids.length,hasMore:next<ids.length,pageToken:next<ids.length ? 'next:'+next : undefined};
    }};
}
test('batch read preserves milliseconds, supported task names and computes missing durations',async()=>{
 const t=table({a:{name:[{text:'订单'},{text:'同步'}],start,end},b:{name:{text:'库存'},start,end:start+1}});
 const result=await readTableRuns(t,config);
 assert.equal(result.skipped,0);assert.equal(result.runs[0].start,start);assert.equal(result.runs[0].durationSeconds,61.25);
 assert.equal(result.runs[1].durationSeconds,.001);assert.equal(result.runs[0].taskName,'订单同步');assert.equal(t.calls.length,1);
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
test('1000 records use five bounded pages instead of per-cell requests',async()=>{
 const t=table(Object.fromEntries(Array.from({length:1000},(_,i)=>[String(i),{name:'A',start,end,duration:60}])));
 assert.equal((await readTableRuns(t,{...config,durationSecondsFieldId:'duration'})).runs.length,1000);
 assert.equal(t.calls.length,5);
 assert.deepEqual(t.calls.map(call=>call.pageToken),[undefined,'next:200','next:400','next:600','next:800']);
});
test('empty table stops at the first page',async()=>{
 const t=table({});assert.deepEqual(await readTableRuns(t,config),{runs:[],skipped:0});assert.equal(t.calls.length,1);
});
test('records load completely across pages for the whole table and a selected view',async()=>{
 const rows=Object.fromEntries(Array.from({length:402},(_,i)=>['r'+i,{name:'A',start,end,identity:'RUN-'+i}]));
 const visible=Object.keys(rows).slice(201);
 for(const viewId of ['', 'v']) {
  const t=table(rows,visible),ids=viewId ? visible : Object.keys(rows);
  const legacy=await readTableRuns(t,{...config,viewId});
  assert.equal(legacy.runs.length,ids.length);assert.equal(legacy.skipped,0);
  assert(t.calls.every(call=>call.viewId===(viewId||undefined)));

 }
});
test('a later page failure or broken cursor fails the whole load rather than returning partial records',async()=>{
 const first={records:[{recordId:'a',fields:{name:'A',start,end}}],hasMore:true,pageToken:'next'};
 let calls=0;
 await assert.rejects(readTableRuns({getRecords:async()=>{if(++calls===1)return first;throw Error('page denied');}},config),/page denied/);
 await assert.rejects(readTableRuns({getRecords:async()=>({...first,pageToken:undefined})},config),/分页异常/);
 calls=0;
 await assert.rejects(readTableRuns({getRecords:async()=>{calls++;return first;}},config),/分页异常/);
 assert.equal(calls,2);
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
