import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {readFile} from 'node:fs/promises';
import {loadModule} from './load-module.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {t,setLanguage,getLanguage,translations}=await loadModule('i18n.ts');
test('all authored UI translation keys have English/Japanese entries and matching placeholders',async()=>{
 const files=['App.tsx','ConfigControls.tsx','TimelineChart.tsx','hooks.ts','lark-data.ts','lark-schema.ts','dashboard-config.ts'];
 for(const file of files){
  const source=await readFile(new URL('../src/'+file,import.meta.url),'utf8');
  for(const match of source.matchAll(/(?:t|setMessage|setSaveMessage|setConfigError)\("([^"\n]+)"/g)) {
   if(!match[1]||!/[\p{Script=Han}]/u.test(match[1]))continue;
   assert(translations[match[1]],file+': '+match[1]);
  }
 }
 const params=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
 for(const [key,values]of Object.entries(translations))for(const value of values){assert(value.trim());assert.deepEqual(params(value),params(key),key);}
 setLanguage('en');assert.equal(t('秒级甘特图'),'Second-level Gantt Chart');
 assert.equal(t('已跳过 {count} 条名称或时间无效的记录',{count:2}),'Skipped 2 records with invalid names or times');
 setLanguage('ja-JP');assert.equal(getLanguage(),'ja-JP');assert.equal(t('秒级甘特图'),'秒単位ガントチャート');
 setLanguage('zh-HK');assert.equal(t('秒级甘特图'),'秒级甘特图');
});

const bridge={};globalThis.appearanceSdk={bridge,dashboard:{state:'View'}};
const {useHostAppearance}=await loadModule('host.ts',{'@lark-base-open/js-sdk':`export const bridge=globalThis.appearanceSdk.bridge;export const dashboard=globalThis.appearanceSdk.dashboard;export const DashboardState={FullScreen:'FullScreen'};`});
test('host language/theme load, theme events beat late reads, listeners are cleaned up; fullscreen is dark',async()=>{
 let callback,resolveTheme,state,root,off=0;
 bridge.getLanguage=async()=> 'ja';bridge.getTheme=()=>new Promise(resolve=>{resolveTheme=resolve;});
 bridge.onThemeChange=fn=>{callback=fn;return()=>{off++;};};
 function Probe(){state=useHostAppearance(false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 assert.equal(state.language,'ja-JP');
 assert.equal(state.ready,false);
 await act(async()=>callback({data:{theme:'DARK'}}));
 await act(async()=>resolveTheme('LIGHT'));assert.equal(state.dark,true);assert.equal(state.ready,true);
 await act(async()=>root.unmount());assert.equal(off,1);
 globalThis.appearanceSdk.dashboard.state='FullScreen';bridge.getTheme=async()=> 'LIGHT';
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 assert.equal(state.fullScreen,true);assert.equal(state.dark,true);await act(async()=>root.unmount());
});

test('a failed theme subscription does not prevent language loading or readiness',async()=>{
 let state,root;globalThis.appearanceSdk.dashboard.state='View';
 bridge.onThemeChange=()=>{throw Error('theme events unavailable');};
 bridge.getTheme=async()=>{throw Error('theme unavailable');};
 bridge.getLanguage=async()=> 'en';
 function Probe(){state=useHostAppearance(false);return null;}
 await act(async()=>{root=TestRenderer.create(React.createElement(Probe));});
 try {assert.equal(state.ready,true);assert.equal(state.language,'en-US');assert.equal(state.dark,false);}
 finally{await act(async()=>root.unmount());}
});
test('search filters options without changing the selected field; type symbols remain visible',async()=>{
 const {ConfigSelect}=await loadModule('ConfigControls.tsx');let selected,root;
 await act(async()=>{root=TestRenderer.create(React.createElement(ConfigSelect,{label:'字段',value:'a',onChange:id=>{selected=id;},options:[
  {id:'a',name:'Name',type:1},{id:'b',name:'Start time',type:5},{id:'c',name:'End time',type:5}
 ]}));});
 try{
  const search=root.root.findByType('input');
  await act(async()=>search.props.onChange({target:{value:'End'}}));
  assert.deepEqual(root.root.findAllByType('option').map(node=>node.props.value),['a','c']);
  assert.equal(selected,undefined);assert.match(JSON.stringify(root.toJSON()),/◷/);
  await act(async()=>root.root.findByType('select').props.onChange({target:{value:'c'}}));assert.equal(selected,'c');
 }finally{await act(async()=>root.unmount());}
});
test('dark themes preserve accent choice while changing surfaces and readable chart labels',async()=>{
 const {createTheme}=await loadModule('theme.ts');const light=createTheme('#58b7a4'),dark=createTheme('#58b7a4',true);
 assert.equal(dark.color,light.color);assert.notEqual(dark.text,light.text);
 assert.notEqual(dark.style['--theme-surface'],light.style['--theme-surface']);
});
