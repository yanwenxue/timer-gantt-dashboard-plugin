import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {loadModule} from './load-module.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {useTimerRuns}=await loadModule('hooks.ts',{'@lark-base-open/js-sdk':'export const dashboard={onDataChange:callback=>{globalThis.testDataChange=callback;return()=>{};}}; export const base={getTableById:async()=>({onRecordModify:callback=>{globalThis.testRecordChange=callback;return()=>{globalThis.testRecordOff=(globalThis.testRecordOff||0)+1;};}})};', './lark-data':'export const loadLarkRuns = (config,data) => globalThis.testLoadRuns(config,data);'});
const config={tableId:'A',viewId:'',identityFieldId:'id',taskNameFieldId:'n',startTimeFieldId:'s',endTimeFieldId:'e',durationSecondsFieldId:''};
const run=id=>({id,tableId:id,taskName:id,start:1000,end:2000,durationSeconds:1});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
test('real hook ignores late old requests, including old errors and loading completion',async()=>{
 const a=deferred(),b=deferred();globalThis.testLoadRuns=c=>c.tableId==='A'?a.promise:b.promise;
 let state,root;function Probe({config}){state=useTimerRuns(config,true,false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe,{config}));});
 await act(async()=>{root.update(React.createElement(Probe,{config:{...config,tableId:'B'}}));});
 await act(async()=>{b.resolve({runs:[run('B')],skipped:0});});
 await act(async()=>{a.reject(Error('old permission failure'));});
 assert.equal(state.runs[0].tableId,'B');assert.equal(state.mode,'lark');assert.equal(state.loading,false);
 await act(async()=>root.unmount());
});
test('empty and failed live loads never insert demo records; retry recovers',async()=>{
 globalThis.testLoadRuns=async()=>({runs:[],skipped:0});let state,root;
 function Probe(){state=useTimerRuns(config,true,false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 assert.equal(state.runs.length,0);assert.equal(state.mode,'lark');
 globalThis.testLoadRuns=async()=>{throw Error('permission denied');};
 await act(async()=>{await state.reload();});
 assert.equal(state.runs.length,0);assert.equal(state.mode,'error');assert.match(state.message,/permission denied/);
 globalThis.testLoadRuns=async()=>({runs:[run('A')],skipped:2});await act(async()=>{await state.reload();});
 assert.equal(state.runs.length,1);assert.match(state.message,/2/);await act(async()=>root.unmount());
});
test('two refreshes accept only the latest result and unmount invalidates pending work',async()=>{
 globalThis.testLoadRuns=async()=>({runs:[run('initial')],skipped:0});let state,root;
 function Probe(){state=useTimerRuns(config,true,false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 const old=deferred(),latest=deferred();let call=0;globalThis.testLoadRuns=()=>++call===1?old.promise:latest.promise;
 let p1,p2;await act(async()=>{p1=state.reload();p2=state.reload();});
 await act(async()=>{old.resolve({runs:[run('old')],skipped:0});await p1;});assert.equal(state.loading,true);
 await act(async()=>{latest.resolve({runs:[run('latest')],skipped:0});await p2;});assert.equal(state.runs[0].id,'latest');
 const pending=deferred();globalThis.testLoadRuns=()=>pending.promise;let p;
 await act(async()=>{p=state.reload();});await act(async()=>root.unmount());await act(async()=>{pending.resolve({runs:[run('late')],skipped:0});await p;});
});

test('data-change listener passes the event snapshot rather than re-reading stale host data',async()=>{
 const snapshot=[[{value:'identity'}],[{value:'new'},{value:1}]];
 let state,root;
 globalThis.testLoadRuns=async(_config,data)=>({runs:[run(data===snapshot?'new':'cached')],skipped:0});
 function Probe(){state=useTimerRuns(config,true,false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 try {
  assert.equal(state.runs[0].id,'cached');
  await act(async()=>{globalThis.testDataChange({data:snapshot});});
  assert.equal(state.runs[0].id,'new');
 }finally{await act(async()=>root.unmount());}
});

test('raw record modifications refresh details using the latest filtered snapshot and unsubscribe on unmount',async()=>{
 const snapshot=[[{value:'identity'}],[{value:'new'},{value:1}]];
 let state,root,revision=0;
 globalThis.testRecordOff=0;
 globalThis.testLoadRuns=async(_config,data)=>({runs:[run((data===snapshot?'filtered':'cached')+revision)],skipped:0});
 function Probe(){state=useTimerRuns(config,true,false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 await act(async()=>{globalThis.testDataChange({data:snapshot});});
 revision=1;
 await act(async()=>{globalThis.testRecordChange();});
 assert.equal(state.runs[0].id,'filtered1');
 await act(async()=>root.unmount());assert.equal(globalThis.testRecordOff,1);
});
