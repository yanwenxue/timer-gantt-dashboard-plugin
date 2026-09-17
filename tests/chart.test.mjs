import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {loadModule} from './load-module.mjs';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createTheme}=await loadModule('theme.ts');
const {zoomForBounds}=await loadModule('chart-state.ts');
const {TimelineChart}=await loadModule('TimelineChart.tsx',{'./echarts':'export const init = element => globalThis.testInitChart(element); export const graphic={};'});
test('chart survives rerenders, preserves zoom, resets on new range and escapes tooltip',async()=>{
 let inits=0,disposes=0,observed=0,rendered=0,root;const handlers=new Map(),options=[];
 const chart={setOption(o){options.push(o);},getOption(){return {dataZoom:[{start:20,end:70,startValue:2000,endValue:7000}]};},
 on(name,fn){handlers.set(name,fn);},off(name){handlers.delete(name);},resize(){},dispose(){disposes++;}};
 globalThis.testInitChart=()=>{inits++;return chart;};
 globalThis.ResizeObserver=class{observe(){observed++;}disconnect(){observed--;}};
 const node={clientWidth:800,addEventListener(){},removeEventListener(){}};
 const run={id:'r',taskName:'<img src=x onerror="evil()"> & test',start:1000,end:9000,durationSeconds:8};
 const props={runs:[run],colorTasks:[run.taskName],theme:createTheme('#58b7a4'),timeWindow:'custom',windowStart:0,windowEnd:10000,resetKey:'rangeA',onRendered:()=>{rendered++;}};
 await act(async()=>{root=TestRenderer.create(React.createElement(TimelineChart,props),{createNodeMock:()=>node});});
 assert.equal(rendered,0);handlers.get('finished')();handlers.get('finished')();assert.equal(rendered,1);
 const html=options.at(-1).tooltip.formatter({value:[1000,9000,0,run]});assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(html.includes('&amp;'));
 await act(async()=>handlers.get('datazoom')());
 await act(async()=>root.update(React.createElement(TimelineChart,{...props,runs:[run],theme:createTheme('#4285e6')})));
 assert.equal(inits,1);assert.equal(disposes,0);assert.equal(options.at(-1).dataZoom[1].startValue,2000);assert.equal(options.at(-1).dataZoom[1].endValue,7000);
 await act(async()=>root.update(React.createElement(TimelineChart,{...props,resetKey:'rangeB',windowStart:10000,windowEnd:20000})));
 assert.equal(options.at(-1).xAxis.min,10000);assert.equal(options.at(-1).dataZoom[1].startValue,10000);
 await act(async()=>root.update(React.createElement(TimelineChart,{...props,runs:[]})));
 assert.equal(options.at(-1).series.length,0);
 await act(async()=>root.update(React.createElement(TimelineChart,props)));
 assert.equal(options.at(-1).yAxis.show,true);assert.deepEqual(options.at(-1).graphic,[]);
 await act(async()=>root.unmount());assert.equal(disposes,1);assert.equal(observed,0);assert.equal(handlers.size,0);
});
test('zoom is clamped when data bounds shrink or no longer overlap',()=>{
 assert.deepEqual(zoomForBounds({startValue:10,endValue:50},20,100),{startValue:20,endValue:50});
 assert.deepEqual(zoomForBounds({startValue:10,endValue:50},60,100),{startValue:60,endValue:100});
});
