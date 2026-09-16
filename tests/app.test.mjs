import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { loadModule } from './load-module.mjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.window = {
  self: {}, top: {}, localStorage: { getItem: () => null, setItem() {} },
  setInterval, clearInterval, setTimeout, clearTimeout
};
const sdk = { dashboard: {}, base: {} };
globalThis.appTestSdk = sdk;
const { App } = await loadModule('App.tsx', {
  '@lark-base-open/js-sdk': `export const dashboard=globalThis.appTestSdk.dashboard;
    export const base=globalThis.appTestSdk.base;
    export const DashboardState={Create:'Create',Config:'Config',View:'View',FullScreen:'FullScreen'};
    export const ui={showToast:async()=>true}; export const ToastType={success:'success'};`,
  './lark-data': 'export const loadLarkRuns=config=>globalThis.appTestLoadRuns(config);',
  './TimelineChart': 'export const TimelineChart=()=>null; export const taskColor=()=>"#abc";'
});
const { isSourceConfigValid } = await loadModule('source-config.ts');
const config = id => ({ tableId: id, viewId: '', taskNameFieldId: id + '_name',
  startTimeFieldId: id + '_start', endTimeFieldId: id + '_end', durationSecondsFieldId: '' });
const fields = id => [
  { id: id + '_name', name: '任务名称结构化', type: 1 },
  { id: id + '_start', name: '执行开始时间', type: 5 },
  { id: id + '_end', name: '执行结束时间', type: 5 }
];
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = () => act(async () => { await new Promise(done => setImmediate(done)); });
const select = (root, label) => root.root.findAllByType('select').find(node => node.props['aria-label'] === label);
const refresh = root => root.root.findAllByType('button').find(node => node.props.title === '刷新数据');
const save = root => root.root.findAllByType('button').find(node => node.props.className === 'save-button');
async function mount() {
  let root;
  await act(async () => { root = TestRenderer.create(React.createElement(App)); });
  await flush();
  return root;
}
function setup(mode = 'Config') {
  const listeners = new Set(), loaded = [], saved = [];
  const tables = ['A', 'B'].map(id => ({ id, getName: async () => id,
    getViewList: async () => [], getFieldMetaList: async () => fields(id) }));
  Object.assign(sdk.dashboard, {
    state: mode, getConfig: async () => ({ customConfig: { sourceConfig: config('A') } }),
    setRendered: async () => true,
    saveConfig: async value => { saved.push(value); return true; },
    onConfigChange: callback => { listeners.add(callback); return () => listeners.delete(callback); }
  });
  sdk.base.getTableList = async () => tables;
  globalThis.appTestLoadRuns = async value => { loaded.push(value); return { runs: [], skipped: 0 }; };
  return { tables, listeners, loaded, saved };
}

test('first creation initializes fields and saves without reading an existing widget config', async () => {
  const env = setup('Create');
  let configReads = 0, renderNotifications = 0;
  sdk.dashboard.getConfig = async () => {
    configReads++;
    throw Error('currently in creation status, unable to invoke this API');
  };
  sdk.dashboard.setRendered = async () => { renderNotifications++; return true; };
  const root = await mount();
  try {
    assert.equal(configReads, 0);
    assert.equal(renderNotifications, 0);
    assert.equal(root.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(select(root, '数据表').props.value, 'A');
    assert.equal(select(root, '开始时间字段').props.value, 'A_start');
    assert.equal(save(root).props.disabled, false);
    await act(async () => save(root).props.onClick()); await flush();
    assert.deepEqual(env.saved[0].customConfig.sourceConfig, config('A'));
    assert.match(JSON.stringify(root.toJSON()), /已保存/);
  } finally { await act(async () => root.unmount()); }
});

test('table switches hide old fields while loading; only valid new-table selections can be saved', async () => {
  const env = setup(), gate = deferred();
  env.tables[1].getViewList = async () => { await gate.promise; return []; };
  const root = await mount();
  try {
    await act(async () => select(root, '数据表').props.onChange({ target: { value: 'B' } }));
    const start = select(root, '开始时间字段');
    assert.equal(start.props.disabled, true);
    assert(!start.findAllByType('option').some(option => option.props.value === 'A_start'));
    assert.equal(save(root).props.disabled, true);
    await act(async () => gate.resolve()); await flush();
    assert.equal(select(root, '开始时间字段').props.value, 'B_start');
    assert.equal(save(root).props.disabled, false);
    await act(async () => save(root).props.onClick()); await flush();
    assert.deepEqual(env.saved[0].customConfig.sourceConfig, config('B'));
    const schema = { tables: [{ id: 'B' }], fields: fields('B'), views: [] };
    assert.equal(isSourceConfigValid({ ...config('B'), startTimeFieldId: 'A_start' }, schema), false);
    assert.equal(isSourceConfigValid({ ...config('B'), startTimeFieldId: 'B_name' }, schema), false);
    assert.equal(isSourceConfigValid({ ...config('B'), viewId: 'deleted' }, schema), false);
    assert.equal(isSourceConfigValid({ ...config('B'), durationSecondsFieldId: 'deleted' }, schema), false);
  } finally { await act(async () => root.unmount()); }
});

test('unavailable saved fields are shown explicitly and cannot be saved', async () => {
  setup();
  sdk.dashboard.getConfig = async () => ({ customConfig: { sourceConfig: { ...config('A'), startTimeFieldId: 'deleted' } } });
  const root = await mount();
  try {
    assert.equal(save(root).props.disabled, true);
    const missing = select(root, '开始时间字段').findAllByType('option').find(node => node.props.value === 'deleted');
    assert.match(missing.children.join(''), /不可用/);
    await act(async () => select(root, '开始时间字段').props.onChange({ target: { value: 'A_start' } }));
    await flush();
    assert.equal(save(root).props.disabled, false);
  } finally { await act(async () => root.unmount()); }
});

test('live host configuration changes update the data source and unsubscribe on unmount', async () => {
  const env = setup('View'), root = await mount();
  try {
    assert.equal(env.listeners.size, 1);
    await act(async () => {
      for (const callback of env.listeners) callback({ data: { customConfig: { sourceConfig: config('B') } } });
    });
    await flush();
    await act(async () => refresh(root).props.onClick()); await flush();
    assert.equal(env.loaded.at(-1).tableId, 'B');
  } finally { await act(async () => root.unmount()); }
  assert.equal(env.listeners.size, 0);
});

test('an event received during the initial config read wins over its late response', async () => {
  const env = setup('View'), gate = deferred();
  sdk.dashboard.getConfig = () => gate.promise;
  const root = await mount();
  try {
    await act(async () => {
      for (const callback of env.listeners) callback({ data: { customConfig: { sourceConfig: config('B') } } });
    });
    await act(async () => gate.resolve({ customConfig: { sourceConfig: config('A') } }));
    await flush();
    assert.equal(env.loaded.at(-1).tableId, 'B');
  } finally { await act(async () => root.unmount()); }
});

test('edit mode keeps the local draft instead of subscribing to host view updates', async () => {
  const env = setup(), root = await mount();
  try {
    assert.equal(env.listeners.size, 0);
    await act(async () => select(root, '开始时间字段').props.onChange({ target: { value: 'A_end' } }));
    await flush();
    assert.equal(select(root, '开始时间字段').props.value, 'A_end');
  } finally { await act(async () => root.unmount()); }
});

test('refresh recovers a failed initial config read', async () => {
  setup(); let calls = 0;
  sdk.dashboard.getConfig = async () => {
    if (++calls === 1) throw Error('temporary config failure');
    return { customConfig: { sourceConfig: config('A') } };
  };
  const root = await mount();
  try {
    assert.equal(root.root.findAllByProps({ role: 'alert' }).length, 1);
    await act(async () => refresh(root).props.onClick()); await flush();
    assert.equal(calls, 2);
    assert.equal(root.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(select(root, '数据表').props.value, 'A');
  } finally { await act(async () => root.unmount()); }
});

test('refresh recovers failed schema initialization with no saved field configuration', async () => {
  const env = setup(); let calls = 0;
  sdk.dashboard.getConfig = async () => ({ customConfig: {} });
  sdk.base.getTableList = async () => { if (++calls === 1) throw Error('temporary schema failure'); return env.tables; };
  const root = await mount();
  try {
    assert.equal(select(root, '数据表').props.disabled, true);
    await act(async () => refresh(root).props.onClick()); await flush();
    assert(calls >= 2);
    assert.equal(select(root, '数据表').props.disabled, false);
    assert.equal(select(root, '开始时间字段').props.value, 'A_start');
    assert.equal(save(root).props.disabled, false);
  } finally { await act(async () => root.unmount()); }
});

test('150000 records can be summarized by App without spreading them into function arguments', async () => {
  setup();
  const start = Date.now(), end = start + 1000;
  globalThis.appTestLoadRuns = async () => ({ runs: Array.from({ length: 150000 }, (_, i) => ({
    id: String(i), taskName: 'job', start, end, durationSeconds: 1
  })), skipped: 0 });
  const root = await mount();
  try { assert.match(JSON.stringify(root.toJSON()), /150000/); }
  finally { await act(async () => root.unmount()); }
});
