import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Clock3, ListTree, RefreshCw, TimerReset } from "lucide-react";
import { createTheme } from "./theme";
import { applyDashboardTheme, loadThemePreference, selectThemeColor } from "./theme-preference";
import type { TimerRun, DataSourceConfig, LegacyFieldMapping, TimeWindow, TimeRange } from "./types";
import { emptySourceConfig, defaultLegacyMapping, fieldOptionsForRole, toFieldSelectOptions, isSourceConfigReady, isSameSourceConfig } from "./source-config";
import { getTodayInputRange, getTimeWindowBounds, isValidTimeRange, runOverlapsWindow, formatDuration, formatTime, timeWindowOptions, parseTime } from "./time";
import { ConfigSelect, ThemePicker } from "./ConfigControls";
import { TimelineChart, taskColor } from "./TimelineChart";
import { useDashboardConfig, useBaseSchema, useTimerRuns } from "./hooks";
export function App() {
  const [themePreference, setThemePreference] = useState(loadThemePreference);
  const themeColor = themePreference.color;
  const setThemeColor = useCallback((color: string) => {
    setThemePreference(selectThemeColor(color));
  }, []);
  const theme = useMemo(() => createTheme(themeColor), [themeColor]);
  const [sourceConfig, setSourceConfig] = useState<DataSourceConfig>(emptySourceConfig);
  const [legacyMapping, setLegacyMapping] = useState<LegacyFieldMapping>(defaultLegacyMapping);
  const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(() => new Set());
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("today");
  const [customRangeDraft, setCustomRangeDraft] = useState<TimeRange>(() => getTodayInputRange());
  const [customRange, setCustomRange] = useState<TimeRange>(() => getTodayInputRange());
  const { dashboardMode, saveMessage, saveConfig, saved, preview, configError, saving } = useDashboardConfig();
  const [configReady, setConfigReady] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!saved) return;
    setSourceConfig({ ...emptySourceConfig, ...saved.sourceConfig });
    setLegacyMapping({ ...defaultLegacyMapping, ...saved.fieldMapping });
    setThemePreference(current => applyDashboardTheme(current, saved.themeColor));
    setConfigReady(true);
  }, [saved]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const resolveConfig = useCallback((expected: DataSourceConfig, resolved: DataSourceConfig) => {
    setSourceConfig(current => isSameSourceConfig(current, expected) ? resolved : current);
  }, []);
  const { schema, loading: schemaLoading, message: schemaMessage } = useBaseSchema(
    sourceConfig,
    legacyMapping,
    resolveConfig,
    configReady && !preview
  );
  const { runs, mode, message, loading, reload } = useTimerRuns(sourceConfig, configReady, preview);
  const refresh = () => { setNow(Date.now()); void reload(); };
  const taskFieldOptions = fieldOptionsForRole(schema.fields, "taskName");
  const dateFieldOptions = fieldOptionsForRole(schema.fields, "startTime");
  const durationFieldOptions = fieldOptionsForRole(schema.fields, "durationSeconds");
  const taskSelectOptions = toFieldSelectOptions(taskFieldOptions);
  const dateSelectOptions = toFieldSelectOptions(dateFieldOptions);
  const durationSelectOptions = toFieldSelectOptions(durationFieldOptions);
  const allTaskNames = useMemo(() => Array.from(new Set(runs.map((run) => run.taskName))), [runs]);
  const dataMin = runs.length ? Math.min(...runs.map((run) => parseTime(run.start))) : undefined;
  const dataMax = runs.length ? Math.max(...runs.map((run) => parseTime(run.end))) : undefined;
  const [activeStart, activeEnd] = getTimeWindowBounds(timeWindow, dataMin, dataMax, customRange, now);
  const hasValidCustomRangeDraft = isValidTimeRange(customRangeDraft);
  const runsInWindow = useMemo(() => runs.filter(
    (run) => timeWindow === "all" || (activeEnd > activeStart && runOverlapsWindow(run, activeStart, activeEnd))
  ), [runs, timeWindow, activeStart, activeEnd]);
  const taskNames = useMemo(() => Array.from(new Set(runsInWindow.map((run) => run.taskName))), [runsInWindow]);
  const visibleRuns = useMemo(() => runsInWindow.filter((run) => !hiddenTasks.has(run.taskName)), [runsInWindow, hiddenTasks]);
  const visibleTaskNames = Array.from(new Set(visibleRuns.map((run) => run.taskName)));
  const maxDuration = visibleRuns.length ? Math.max(...visibleRuns.map((run) => run.durationSeconds)) : 0;
  const totalDuration = visibleRuns.reduce((sum, run) => sum + run.durationSeconds, 0);

  useEffect(() => {
    setHiddenTasks((current) => {
      const next = new Set([...current].filter((taskName) => allTaskNames.includes(taskName)));
      return next.size === current.size ? current : next;
    });
  }, [allTaskNames]);

  useEffect(() => {
    if (timeWindow !== "custom" || !hasValidCustomRangeDraft) return;
    const timer = window.setTimeout(() => setCustomRange(customRangeDraft), 280);
    return () => window.clearTimeout(timer);
  }, [customRangeDraft, hasValidCustomRangeDraft, timeWindow]);

  const toggleTask = (taskName: string) => {
    setHiddenTasks((current) => {
      const next = new Set(current);
      if (next.has(taskName)) {
        next.delete(taskName);
      } else {
        next.add(taskName);
      }
      return next;
    });
  };

  const applyCustomRange = () => {
    setTimeWindow("custom");
    if (isValidTimeRange(customRangeDraft)) {
      setCustomRange(customRangeDraft);
    }
  };

  const updateSourceConfig = (patch: Partial<DataSourceConfig>) => {
    setSourceConfig((current) => ({ ...current, ...patch }));
  };

  const updateTable = (tableId: string) => {
    setSourceConfig({
      ...emptySourceConfig,
      tableId
    });
  };

  const openRecordDetail = useCallback(async (run: TimerRun) => {
    try {
      if (!run.tableId) {
        throw new Error("示例数据没有对应的多维表格行");
      }

      const { ui } = await import("@lark-base-open/js-sdk");
      const opened = await ui.showRecordDetailDialog({
        tableId: run.tableId,
        recordId: run.id
      });
      if (!opened) {
        throw new Error("打开行详情失败");
      }
    } catch (error) {
      console.warn(error);
      try {
        if (!run.tableId) {
          throw error;
        }

        const { base, bridge, ui, ToastType } = await import("@lark-base-open/js-sdk");
        const viewId = run.viewId ?? await base
          .getTableById(run.tableId)
          .then((table) => table.getViewList())
          .then((views) => views[0]?.id);
        if (!viewId) {
          throw error;
        }

        const url = await bridge.getBitableUrl({
          tableId: run.tableId,
          viewId,
          recordId: run.id,
          fieldId: null
        });
        window.open(url, "_blank", "noopener,noreferrer");
        await ui.showToast({
          toastType: ToastType.info,
          message: "已打开对应行链接"
        });
      } catch {
        window.alert("当前无法打开行详情，请确认在飞书仪表盘环境中使用");
      }
    }
  }, []);

  return (
    <main className={dashboardMode === "view" ? "plugin-shell view-only" : "plugin-shell"} style={theme.style}>
      <section className="visual-pane">
        <header className="topbar">
          <div>
            <span className="eyebrow">Timer Execution Timeline</span>
            <h1>秒级甘特图</h1>
            {(configError || message) && <p role={configError || mode === "error" ? "alert" : "status"}>{configError || message}</p>}
          </div>
          <div className="topbar-actions">
            <ThemePicker color={themeColor} onChange={setThemeColor} dashboardMode={dashboardMode} persistence={themePreference.persistence} />
            <button className="icon-button" onClick={refresh} title="刷新数据" type="button">
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
          </div>
        </header>

        <div className="metrics">
          <div className="metric-card">
            <TimerReset size={16} />
            <span>
              <b>{visibleRuns.length} / {runsInWindow.length}</b>
              <small>执行记录</small>
            </span>
          </div>
          <div className="metric-card">
            <ListTree size={16} />
            <span>
              <b>{visibleTaskNames.length} / {taskNames.length}</b>
              <small>任务类型</small>
            </span>
          </div>
          <div className="metric-card">
            <CalendarClock size={16} />
            <span>
              <b>{formatDuration(maxDuration)}</b>
              <small>最长耗时</small>
            </span>
          </div>
          <div className="metric-card">
            <Clock3 size={16} />
            <span>
              <b>{formatDuration(totalDuration)}</b>
              <small>累计耗时</small>
            </span>
          </div>
          <div className={`runtime ${mode}`}>{mode === "lark" ? "飞书数据" : mode === "error" ? "读取失败" : "演示数据"}</div>
        </div>

        <div className="range-bar">
          <span>{`${formatTime(activeStart)} - ${formatTime(activeEnd)}`}</span>
          <div className="window-switcher" aria-label="时间范围">
            {timeWindowOptions.map((option) => (
              <button
                key={option.key}
                className={timeWindow === option.key ? "active" : ""}
                onClick={() => setTimeWindow(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="custom-range" aria-label="自选时间范围">
            <input
              aria-label="开始时间"
              type="datetime-local"
              step={1}
              value={customRangeDraft.start}
              onBlur={applyCustomRange}
              onChange={(event) => {
                setCustomRangeDraft((current) => ({ ...current, start: event.target.value }));
                setTimeWindow("custom");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyCustomRange();
                  event.currentTarget.blur();
                }
              }}
            />
            <span>至</span>
            <input
              aria-label="结束时间"
              type="datetime-local"
              step={1}
              value={customRangeDraft.end}
              onBlur={applyCustomRange}
              onChange={(event) => {
                setCustomRangeDraft((current) => ({ ...current, end: event.target.value }));
                setTimeWindow("custom");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyCustomRange();
                  event.currentTarget.blur();
                }
              }}
            />
            {timeWindow === "custom" && !hasValidCustomRangeDraft && <em>结束时间需晚于开始时间</em>}
          </div>
          <div className="legend-strip" role="list" aria-label="任务类型筛选">
            {taskNames.map((taskName) => (
              <button
                key={taskName}
                className={hiddenTasks.has(taskName) ? "legend-item off" : "legend-item"}
                onClick={() => toggleTask(taskName)}
                type="button"
                title={hiddenTasks.has(taskName) ? "点击显示该任务" : "点击隐藏该任务"}
              >
                <i style={{ background: taskColor(taskName, taskNames, theme) }} />
                {taskName}
              </button>
            ))}
          </div>
        </div>

        <TimelineChart
          runs={visibleRuns}
          theme={theme}
          colorTasks={taskNames}
          timeWindow={timeWindow}
          windowStart={activeStart}
          windowEnd={activeEnd}
          resetKey={`${sourceConfig.tableId}:${sourceConfig.viewId}:${timeWindow}:${timeWindow === "custom" ? `${customRange.start}:${customRange.end}` : ""}`}
          onOpenRecord={openRecordDetail}
        />
      </section>

      {dashboardMode === "edit" && <aside className="config-pane">
        <div className="config-head">
          <h2>数据配置</h2>
          <p>点击每项右侧箭头，下拉选择当前多维表格里的数据表、视图和字段</p>
        </div>
        <ConfigSelect
          disabled={!schema.tables.length}
          emptyLabel="暂无可选数据表"
          label="数据表"
          options={schema.tables}
          value={sourceConfig.tableId}
          onChange={updateTable}
        />
        <ConfigSelect
          disabled={!schema.views.length}
          emptyLabel="全部记录"
          label="视图"
          options={schema.views}
          value={sourceConfig.viewId}
          onChange={(viewId) => updateSourceConfig({ viewId })}
        />
        <ConfigSelect
          disabled={!taskSelectOptions.length}
          emptyLabel="未找到文本/单选字段"
          label="任务名称字段"
          options={taskSelectOptions}
          value={sourceConfig.taskNameFieldId}
          onChange={(taskNameFieldId) => updateSourceConfig({ taskNameFieldId })}
        />
        <ConfigSelect
          disabled={!dateSelectOptions.length}
          emptyLabel="未找到日期时间字段"
          label="开始时间字段"
          options={dateSelectOptions}
          value={sourceConfig.startTimeFieldId}
          onChange={(startTimeFieldId) => updateSourceConfig({ startTimeFieldId })}
        />
        <ConfigSelect
          disabled={!dateSelectOptions.length}
          emptyLabel="未找到日期时间字段"
          label="结束时间字段"
          options={dateSelectOptions}
          value={sourceConfig.endTimeFieldId}
          onChange={(endTimeFieldId) => updateSourceConfig({ endTimeFieldId })}
        />
        <ConfigSelect
          emptyLabel="按开始/结束时间计算"
          label="耗时字段"
          options={durationSelectOptions}
          value={sourceConfig.durationSecondsFieldId}
          onChange={(durationSecondsFieldId) => updateSourceConfig({ durationSecondsFieldId })}
        />
        {schemaMessage && <p className="save-message error">{schemaMessage}</p>}
        {schemaLoading && <p className="save-message">正在读取字段...</p>}
        <button
          className="save-button"
          disabled={saving || schemaLoading || !isSourceConfigReady(sourceConfig)}
          onClick={() => void saveConfig(sourceConfig, themeColor)}
          type="button"
        >
          <Check size={16} />
          保存到仪表盘
        </button>
        {saveMessage && <p className="save-message">{saveMessage}</p>}
        <div className="config-note">
          <strong>使用方式</strong>
          <span>保存后回到仪表盘页面，组件会以展示态加载，只保留左侧图表。</span>
        </div>
      </aside>}
    </main>
  );
}

