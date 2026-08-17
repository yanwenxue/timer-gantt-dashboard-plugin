import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as echarts from "echarts";
import { CalendarClock, Check, Clock3, ListTree, RefreshCw, TimerReset } from "lucide-react";
import type { IField, IFieldMeta, ITable } from "@lark-base-open/js-sdk";
import "./styles.css";

type TimerRun = {
  id: string;
  tableId?: string;
  viewId?: string;
  taskName: string;
  start: string;
  end: string;
  durationSeconds: number;
};

type LegacyFieldMapping = {
  tableName: string;
  taskName: string;
  startTime: string;
  endTime: string;
  durationSeconds: string;
};

type DataSourceConfig = {
  tableId: string;
  viewId: string;
  taskNameFieldId: string;
  startTimeFieldId: string;
  endTimeFieldId: string;
  durationSecondsFieldId: string;
};

type TableOption = {
  id: string;
  name: string;
};

type ViewOption = {
  id: string;
  name: string;
};

type FieldOption = {
  id: string;
  name: string;
  type: number;
};

type BaseSchema = {
  tables: TableOption[];
  views: ViewOption[];
  fields: FieldOption[];
};

type RuntimeMode = "mock" | "lark" | "error";
type DashboardMode = "edit" | "view";
type TimeWindow = "today" | "3d" | "7d" | "all" | "custom";
type FieldRole = "taskName" | "startTime" | "endTime" | "durationSeconds";

const emptySourceConfig: DataSourceConfig = {
  tableId: "",
  viewId: "",
  taskNameFieldId: "",
  startTimeFieldId: "",
  endTimeFieldId: "",
  durationSecondsFieldId: ""
};

const defaultLegacyMapping: LegacyFieldMapping = {
  tableName: "日统计",
  taskName: "任务名称结构化",
  startTime: "执行开始时间",
  endTime: "执行结束时间",
  durationSeconds: "耗时秒"
};

const mockRuns: TimerRun[] = [
  {
    id: "mock-1",
    taskName: "【组装机】价格每日持久化",
    start: "2026-08-10 06:00:09",
    end: "2026-08-10 06:00:10",
    durationSeconds: 1
  },
  {
    id: "mock-2",
    taskName: "价格每日持久化",
    start: "2026-08-11 10:37:07",
    end: "2026-08-11 15:37:17",
    durationSeconds: 18010
  },
  {
    id: "mock-3",
    taskName: "价格每日持久化",
    start: "2026-08-11 10:42:21",
    end: "2026-08-11 11:09:04",
    durationSeconds: 1603
  }
];

const palette = ["#58b7a4", "#ff8a65", "#6ea8fe", "#f2c94c", "#b388ff", "#ef6f8a"];
const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const axisPaddingMs = 30 * 60 * 1000;
const textLikeFieldTypes = new Set([1, 3, 20, 1005]);
const dateLikeFieldTypes = new Set([5, 1001, 1002]);
const numberLikeFieldTypes = new Set([2, 20]);
const timeWindowOptions: Array<{ key: TimeWindow; label: string }> = [
  { key: "today", label: "今天" },
  { key: "3d", label: "最近3天" },
  { key: "7d", label: "最近7天" },
  { key: "all", label: "全部" },
  { key: "custom", label: "自选" }
];

function parseTime(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 100000000000 ? numeric : numeric * 1000;
  }
  const normalized = value.replace(/-/g, "/");
  const parsed = new Date(normalized).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function formatTime(ms: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(ms));
}

function formatAxisLabel(ms: number): string {
  const date = new Date(ms);
  const range = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return range.replace(" ", "\n");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h ? `${h} 小时` : "", m ? `${m} 分` : "", s ? `${s} 秒` : ""].filter(Boolean).join(" ");
}

function taskColor(taskName: string, tasks: string[]): string {
  const index = Math.max(0, tasks.indexOf(taskName));
  return palette[index % palette.length];
}

function dateRangeLabel(runs: TimerRun[]): string {
  if (!runs.length) return "暂无区间";
  const start = Math.min(...runs.map((run) => parseTime(run.start)));
  const end = Math.max(...runs.map((run) => parseTime(run.end)));
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function timeWindowLabel(window: TimeWindow, customRange?: TimeRange): string {
  const [start, end] = getTimeWindowBounds(window, undefined, undefined, customRange);
  return `${formatTime(start)} - ${formatTime(end)}`;
}

type TimeRange = {
  start: string;
  end: string;
};

function byStartTime(a: TimerRun, b: TimerRun) {
  return parseTime(a.start) - parseTime(b.start);
}

function getTodayInputRange(): TimeRange {
  const [start, end] = getTimeWindowBounds("today");
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end)
  };
}

function toDateTimeLocalValue(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes())
  ].join("");
}

function parseDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidTimeRange(range: TimeRange): boolean {
  const start = parseDateTimeLocal(range.start);
  const end = parseDateTimeLocal(range.end);
  return start !== null && end !== null && end > start;
}

function getTimeWindowBounds(window: TimeWindow, min?: number, max?: number, customRange?: TimeRange): [number, number] {
  const now = Date.now();
  if (window === "all") {
    return [min ?? now - dayMs, max ?? now];
  }

  if (window === "custom" && customRange) {
    const customStart = parseDateTimeLocal(customRange.start);
    const customEnd = parseDateTimeLocal(customRange.end);
    return [customStart ?? now, customEnd ?? customStart ?? now];
  }

  if (window === "today") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = todayStart.getTime() + dayMs - 1;
    return [todayStart.getTime(), todayEnd];
  }

  const duration = window === "3d" ? 3 * dayMs : 7 * dayMs;
  return [now - duration, now];
}

function runOverlapsWindow(run: TimerRun, start: number, end: number): boolean {
  return parseTime(run.start) <= end && parseTime(run.end) >= start;
}

function isSourceConfigReady(config: DataSourceConfig): boolean {
  return Boolean(config.tableId && config.taskNameFieldId && config.startTimeFieldId && config.endTimeFieldId);
}

function fieldMatchesRole(field: FieldOption, role: FieldRole): boolean {
  if (role === "startTime" || role === "endTime") {
    return dateLikeFieldTypes.has(field.type);
  }

  if (role === "durationSeconds") {
    return numberLikeFieldTypes.has(field.type);
  }

  return textLikeFieldTypes.has(field.type);
}

function fieldOptionsForRole(fields: FieldOption[], role: FieldRole): FieldOption[] {
  return fields.filter((field) => fieldMatchesRole(field, role));
}

function findFieldByName(fields: FieldOption[], name: string, role: FieldRole): string {
  return fields.find((field) => field.name === name && fieldMatchesRole(field, role))?.id ?? "";
}

function keepValidFieldId(fields: FieldOption[], fieldId: string, role: FieldRole): string {
  return fields.find((field) => field.id === fieldId && fieldMatchesRole(field, role))?.id ?? "";
}

function getRecordDurationSeconds(start: string, end: string, durationText: string): number {
  const fieldValue = Number(durationText || 0);
  if (Number.isFinite(fieldValue) && fieldValue >= 0) {
    return fieldValue;
  }

  const computed = Math.round((parseTime(end) - parseTime(start)) / 1000);
  return Number.isFinite(computed) && computed >= 0 ? computed : 0;
}

function normalizeSourceConfig(
  current: DataSourceConfig,
  schema: BaseSchema,
  legacyMapping: LegacyFieldMapping
): DataSourceConfig {
  const taskFields = fieldOptionsForRole(schema.fields, "taskName");
  const dateFields = fieldOptionsForRole(schema.fields, "startTime");
  const durationFields = fieldOptionsForRole(schema.fields, "durationSeconds");
  const firstDateFieldId = dateFields[0]?.id ?? "";
  const secondDateFieldId = dateFields.find((field) => field.id !== firstDateFieldId)?.id ?? firstDateFieldId;

  return {
    tableId: current.tableId || schema.tables[0]?.id || "",
    viewId: current.viewId || schema.views[0]?.id || "",
    taskNameFieldId:
      keepValidFieldId(schema.fields, current.taskNameFieldId, "taskName") ||
      findFieldByName(schema.fields, legacyMapping.taskName, "taskName") ||
      taskFields[0]?.id ||
      "",
    startTimeFieldId:
      keepValidFieldId(schema.fields, current.startTimeFieldId, "startTime") ||
      findFieldByName(schema.fields, legacyMapping.startTime, "startTime") ||
      firstDateFieldId,
    endTimeFieldId:
      keepValidFieldId(schema.fields, current.endTimeFieldId, "endTime") ||
      findFieldByName(schema.fields, legacyMapping.endTime, "endTime") ||
      secondDateFieldId,
    durationSecondsFieldId:
      keepValidFieldId(schema.fields, current.durationSecondsFieldId, "durationSeconds") ||
      findFieldByName(schema.fields, legacyMapping.durationSeconds, "durationSeconds") ||
      durationFields[0]?.id ||
      ""
  };
}

function isSameSourceConfig(left: DataSourceConfig, right: DataSourceConfig): boolean {
  return (
    left.tableId === right.tableId &&
    left.viewId === right.viewId &&
    left.taskNameFieldId === right.taskNameFieldId &&
    left.startTimeFieldId === right.startTimeFieldId &&
    left.endTimeFieldId === right.endTimeFieldId &&
    left.durationSecondsFieldId === right.durationSecondsFieldId
  );
}

async function loadBaseSchema(
  config: DataSourceConfig,
  legacyMapping: LegacyFieldMapping
): Promise<{ schema: BaseSchema; config: DataSourceConfig }> {
  const sdk = await import("@lark-base-open/js-sdk");
  const tableList = await sdk.base.getTableList();
  const tables = tableList as ITable[];
  const tableOptions = await Promise.all(
    tables.map(async (item) => ({
      id: item.id,
      name: await item.getName()
    }))
  );
  const tableId = config.tableId || tableOptions.find((item) => item.name === legacyMapping.tableName)?.id || tableOptions[0]?.id || "";
  const table = tables.find((item) => item.id === tableId) ?? tables[0];

  if (!table) {
    throw new Error("当前 Base 没有可读取的数据表");
  }

  const viewOptions = await Promise.all(
    (await table.getViewList()).map(async (view) => ({
      id: view.id,
      name: await view.getName()
    }))
  );
  const fieldOptions = (await table.getFieldMetaList()).map((field: IFieldMeta) => ({
    id: field.id,
    name: field.name,
    type: field.type
  }));
  const schema = { tables: tableOptions, views: viewOptions, fields: fieldOptions };

  return { schema, config: normalizeSourceConfig({ ...config, tableId: table.id }, schema, legacyMapping) };
}

async function loadLarkRuns(config: DataSourceConfig): Promise<TimerRun[]> {
  if (!isSourceConfigReady(config)) {
    throw new Error("请先选择数据表和字段");
  }

  const sdk = await import("@lark-base-open/js-sdk");
  const table = await sdk.base.getTableById(config.tableId);
  const taskField = await table.getFieldById<IField>(config.taskNameFieldId);
  const startField = await table.getFieldById<IField>(config.startTimeFieldId);
  const endField = await table.getFieldById<IField>(config.endTimeFieldId);
  const durationField = config.durationSecondsFieldId
    ? await table.getFieldById<IField>(config.durationSecondsFieldId)
    : undefined;
  const activeView = await table
    .getViewById(config.viewId)
    .catch(async () => (await table.getViewList())[0])
    .catch(() => undefined);
  const recordIds = activeView
    ? (await activeView.getVisibleRecordIdList()).filter((id): id is string => Boolean(id))
    : await table.getRecordIdList();
  const rows: TimerRun[] = [];

  for (const recordId of recordIds) {
    const taskName = await taskField.getCellString(recordId);
    const start = await startField.getCellString(recordId);
    const end = await endField.getCellString(recordId);
    const durationText = durationField ? await durationField.getCellString(recordId) : "";
    const durationSeconds = getRecordDurationSeconds(start, end, durationText);

    if (!taskName || !start || !end || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      continue;
    }

    rows.push({
      id: recordId,
      tableId: table.id,
      viewId: activeView?.id,
      taskName,
      start,
      end,
      durationSeconds
    });
  }

  return rows.sort(byStartTime);
}

function useTimerRuns(config: DataSourceConfig) {
  const [runs, setRuns] = useState<TimerRun[]>(mockRuns);
  const [mode, setMode] = useState<RuntimeMode>("mock");
  const [message, setMessage] = useState("本地预览，使用内置示例数据");
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const larkRuns = await loadLarkRuns(config);
      setRuns(larkRuns.length ? larkRuns : mockRuns);
      setMode(larkRuns.length ? "lark" : "mock");
      setMessage(larkRuns.length ? "" : "飞书返回为空，显示示例数据");
    } catch (error) {
      setRuns(mockRuns);
      setMode("mock");
      setMessage(error instanceof Error ? `未进入飞书插件环境：${error.message}` : "未进入飞书插件环境");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [
    config.tableId,
    config.viewId,
    config.taskNameFieldId,
    config.startTimeFieldId,
    config.endTimeFieldId,
    config.durationSecondsFieldId
  ]);

  return { runs, mode, message, loading, reload };
}

function useDashboardConfig() {
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("edit");
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      try {
        const { dashboard, DashboardState } = await import("@lark-base-open/js-sdk");
        if (!active) return;
        setDashboardMode(
          dashboard.state === DashboardState.View || dashboard.state === DashboardState.FullScreen ? "view" : "edit"
        );
        const config = await dashboard.getConfig();
        window.dispatchEvent(new CustomEvent("timer-plugin-config", {
          detail: {
            sourceConfig: config.customConfig?.sourceConfig,
            fieldMapping: config.customConfig?.fieldMapping
          }
        }));
        await dashboard.setRendered();
      } catch {
        setDashboardMode("edit");
      }
    }
    void loadConfig();
    return () => {
      active = false;
    };
  }, []);

  const saveConfig = async (config: DataSourceConfig) => {
    try {
      const { dashboard, ui, ToastType } = await import("@lark-base-open/js-sdk");
      await dashboard.saveConfig({
        dataConditions: [],
        customConfig: { sourceConfig: config }
      });
      await dashboard.setRendered();
      setSaveMessage("已保存，可回到仪表盘查看");
      await ui.showToast({ toastType: ToastType.success, message: "配置已保存" });
    } catch (error) {
      setSaveMessage("当前不在飞书仪表盘环境，配置仅本地预览生效");
      console.warn(error);
    }
  };

  return { dashboardMode, saveMessage, saveConfig };
}

function useBaseSchema(
  config: DataSourceConfig,
  legacyMapping: LegacyFieldMapping,
  onConfigResolved: (config: DataSourceConfig) => void
) {
  const [schema, setSchema] = useState<BaseSchema>({ tables: [], views: [], fields: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSchema() {
      setLoading(true);
      try {
        const result = await loadBaseSchema(config, legacyMapping);
        if (!active) return;
        setSchema(result.schema);
        setMessage("");
        if (!isSameSourceConfig(config, result.config)) {
          onConfigResolved(result.config);
        }
      } catch (error) {
        if (!active) return;
        setSchema({ tables: [], views: [], fields: [] });
        setMessage(error instanceof Error ? error.message : "无法读取多维表格结构");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadSchema();
    return () => {
      active = false;
    };
  }, [config.tableId, legacyMapping.tableName]);

  return { schema, loading, message };
}

function TimelineChart({
  runs,
  timeWindow,
  customRange,
  onOpenRecord
}: {
  runs: TimerRun[];
  timeWindow: TimeWindow;
  customRange: TimeRange;
  onOpenRecord?: (run: TimerRun) => void;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const sortedRuns = useMemo(() => [...runs].sort(byStartTime), [runs]);
  const tasks = useMemo(() => Array.from(new Set(sortedRuns.map((run) => run.taskName))), [sortedRuns]);
  const [windowStart, windowEnd] = useMemo(
    () => getTimeWindowBounds(timeWindow, undefined, undefined, customRange),
    [customRange, timeWindow]
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    if (!sortedRuns.length || !tasks.length) {
      chart.setOption({
        animation: false,
        backgroundColor: "transparent",
        graphic: {
          type: "text",
          left: "center",
          top: "middle",
          style: {
            text: "当前时间范围没有执行区间",
            fill: "#8f959e",
            fontSize: 14,
            fontWeight: 600
          }
        },
        grid: { left: 198, right: 26, top: 28, bottom: 70 },
        dataZoom: [
          {
            type: "inside",
            xAxisIndex: 0,
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: true
          },
          {
            type: "slider",
            xAxisIndex: 0,
            startValue: windowStart,
            endValue: windowEnd,
            height: 22,
            bottom: 24,
            borderColor: "#dbe5f2",
            fillerColor: "rgba(88, 183, 164, 0.2)",
            backgroundColor: "#edf7f4",
            handleStyle: { color: "#58b7a4" },
            textStyle: { color: "#646a73" },
            labelFormatter: (value: number) => formatTime(value)
          }
        ],
        xAxis: {
          type: "time",
          min: windowStart,
          max: windowEnd,
          axisLabel: {
            color: "#646a73",
            hideOverlap: true,
            formatter: (value: number) => formatAxisLabel(value)
          },
          axisLine: { lineStyle: { color: "#d7e1ee" } },
          axisTick: { lineStyle: { color: "#d7e1ee" } },
          splitLine: { show: true, lineStyle: { color: "#edf3f9" } }
        },
        yAxis: { show: false },
        series: []
      });
      const resize = () => chart.resize();
      window.addEventListener("resize", resize);
      return () => {
        window.removeEventListener("resize", resize);
        chart.dispose();
      };
    }

    const values = sortedRuns.map((run) => [parseTime(run.start), parseTime(run.end), tasks.indexOf(run.taskName), run]);
    const dataMin = Math.min(...sortedRuns.map((run) => parseTime(run.start)));
    const dataMax = Math.max(...sortedRuns.map((run) => parseTime(run.end)));
    const min = timeWindow === "all" ? dataMin - axisPaddingMs : windowStart;
    const max = timeWindow === "all" ? dataMax + axisPaddingMs : windowEnd;

    chart.setOption({
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 198, right: 26, top: 28, bottom: 70 },
      tooltip: {
        confine: true,
        formatter: (params: { value: [number, number, number, TimerRun] }) => {
          const item = params.value[3];
          const color = taskColor(item.taskName, tasks);
          return [
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span><strong>${item.taskName}</strong>`,
            `开始：${item.start}`,
            `结束：${item.end}`,
            `耗时：${formatDuration(item.durationSeconds)}`,
            item.tableId ? "点击打开行详情" : ""
          ].filter(Boolean).join("<br/>");
        }
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          filterMode: "weakFilter",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        },
        {
          type: "slider",
          xAxisIndex: 0,
          startValue: min,
          endValue: max,
          height: 22,
          bottom: 24,
          borderColor: "#dbe5f2",
          fillerColor: "rgba(88, 183, 164, 0.2)",
          backgroundColor: "#edf7f4",
          handleStyle: { color: "#58b7a4" },
          textStyle: { color: "#646a73" },
          labelFormatter: (value: number) => formatTime(value),
          filterMode: "weakFilter"
        }
      ],
      xAxis: {
        type: "time",
        min,
        max,
        axisLabel: {
          color: "#646a73",
          hideOverlap: true,
          formatter: (value: number) => formatAxisLabel(value)
        },
        axisLine: { lineStyle: { color: "#d7e1ee" } },
        axisTick: { lineStyle: { color: "#d7e1ee" } },
        splitLine: { show: true, lineStyle: { color: "#edf3f9" } }
      },
      yAxis: {
        type: "category",
        data: tasks,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          width: 170,
          overflow: "truncate",
          color: "#343a45",
          fontWeight: 600
        }
      },
      series: [
        {
          type: "custom",
          encode: { x: [0, 1], y: 2 },
          data: values,
          renderItem: (params: any, api: any) => {
            const item = api.value(3) as TimerRun;
            const start = api.coord([api.value(0), api.value(2)]);
            const end = api.coord([api.value(1), api.value(2)]);
            const height = Math.max(12, api.size([0, 1])[1] * 0.46);
            const width = Math.max(end[0] - start[0], 3);
            const rect = echarts.graphic.clipRectByRect(
              {
                x: start[0],
                y: start[1] - height / 2,
                width,
                height
              },
              {
                x: params.coordSys.x,
                y: params.coordSys.y,
                width: params.coordSys.width,
                height: params.coordSys.height
              }
            );
            if (!rect) return null;
            const fill = taskColor(item.taskName, tasks);
            const children: any[] = [
              {
                type: "rect",
                shape: { ...rect, r: 4 },
                style: api.style({
                  fill,
                  shadowColor: "rgba(31, 35, 41, 0.13)",
                  shadowBlur: 10,
                  shadowOffsetY: 4
                })
              }
            ];

            if (width > 82) {
              children.push({
                type: "text",
                x: rect.x + 8,
                y: rect.y + rect.height / 2,
                style: {
                  text: formatDuration(item.durationSeconds),
                  fill: "#ffffff",
                  fontSize: 11,
                  fontWeight: 600,
                  textVerticalAlign: "middle"
                }
              });
            } else {
              children.push({
                type: "circle",
                shape: { cx: rect.x + rect.width + 5, cy: rect.y + rect.height / 2, r: 3 },
                style: { fill, stroke: "#ffffff", lineWidth: 1 }
              });
            }

            return {
              type: "group",
              cursor: item.tableId ? "pointer" : "default",
              children
            };
          }
        }
      ]
    });

    chart.on("click", (params: any) => {
      const run = params?.value?.[3] as TimerRun | undefined;
      if (run) {
        onOpenRecord?.(run);
      }
    });

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [sortedRuns, tasks, timeWindow, customRange, windowStart, windowEnd, onOpenRecord]);

  return <div className="chart" ref={chartRef} />;
}

function App() {
  const [sourceConfig, setSourceConfig] = useState<DataSourceConfig>(emptySourceConfig);
  const [legacyMapping, setLegacyMapping] = useState<LegacyFieldMapping>(defaultLegacyMapping);
  const [hiddenTasks, setHiddenTasks] = useState<Set<string>>(() => new Set());
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("today");
  const [customRangeDraft, setCustomRangeDraft] = useState<TimeRange>(() => getTodayInputRange());
  const [customRange, setCustomRange] = useState<TimeRange>(() => getTodayInputRange());
  const { dashboardMode, saveMessage, saveConfig } = useDashboardConfig();
  const { schema, loading: schemaLoading, message: schemaMessage } = useBaseSchema(
    sourceConfig,
    legacyMapping,
    setSourceConfig
  );
  const { runs, mode, message, loading, reload } = useTimerRuns(sourceConfig);
  const taskFieldOptions = fieldOptionsForRole(schema.fields, "taskName");
  const dateFieldOptions = fieldOptionsForRole(schema.fields, "startTime");
  const durationFieldOptions = fieldOptionsForRole(schema.fields, "durationSeconds");
  const allTaskNames = Array.from(new Set(runs.map((run) => run.taskName)));
  const dataMin = runs.length ? Math.min(...runs.map((run) => parseTime(run.start))) : undefined;
  const dataMax = runs.length ? Math.max(...runs.map((run) => parseTime(run.end))) : undefined;
  const [activeStart, activeEnd] = getTimeWindowBounds(timeWindow, dataMin, dataMax, customRange);
  const hasValidCustomRange = isValidTimeRange(customRange);
  const hasValidCustomRangeDraft = isValidTimeRange(customRangeDraft);
  const runsInWindow = runs.filter(
    (run) => timeWindow === "all" || (activeEnd > activeStart && runOverlapsWindow(run, activeStart, activeEnd))
  );
  const taskNames = Array.from(new Set(runsInWindow.map((run) => run.taskName)));
  const visibleRuns = runsInWindow.filter((run) => !hiddenTasks.has(run.taskName));
  const visibleTaskNames = Array.from(new Set(visibleRuns.map((run) => run.taskName)));
  const maxDuration = visibleRuns.length ? Math.max(...visibleRuns.map((run) => run.durationSeconds)) : 0;
  const totalDuration = visibleRuns.reduce((sum, run) => sum + run.durationSeconds, 0);

  useEffect(() => {
    setHiddenTasks((current) => {
      const next = new Set([...current].filter((taskName) => allTaskNames.includes(taskName)));
      return next.size === current.size ? current : next;
    });
  }, [allTaskNames.join("|")]);

  useEffect(() => {
    const onConfig = (event: Event) => {
      const detail = (event as CustomEvent<{
        sourceConfig?: Partial<DataSourceConfig>;
        fieldMapping?: Partial<LegacyFieldMapping>;
      }>).detail;
      if (detail.sourceConfig) {
        setSourceConfig((current) => ({ ...current, ...detail.sourceConfig }));
      }
      if (detail.fieldMapping) {
        setLegacyMapping((current) => ({ ...current, ...detail.fieldMapping }));
      }
    };
    window.addEventListener("timer-plugin-config", onConfig);
    return () => window.removeEventListener("timer-plugin-config", onConfig);
  }, []);

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
    <main className={dashboardMode === "view" ? "plugin-shell view-only" : "plugin-shell"}>
      <section className="visual-pane">
        <header className="topbar">
          <div>
            <span className="eyebrow">Timer Execution Timeline</span>
            <h1>秒级甘特图</h1>
            {message && <p>{message}</p>}
          </div>
          <button className="icon-button" onClick={() => void reload()} title="刷新数据" type="button">
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
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
          <div className={`runtime ${mode}`}>{mode === "lark" ? "飞书数据" : "本地预览"}</div>
        </div>

        <div className="range-bar">
          <span>{timeWindow === "custom" ? timeWindowLabel(timeWindow, customRangeDraft) : timeWindow === "all" ? dateRangeLabel(runs) : timeWindowLabel(timeWindow, customRange)}</span>
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
                <i style={{ background: taskColor(taskName, taskNames) }} />
                {taskName}
              </button>
            ))}
          </div>
        </div>

        <TimelineChart
          runs={visibleRuns}
          timeWindow={timeWindow}
          customRange={customRange}
          onOpenRecord={openRecordDetail}
        />
      </section>

      {dashboardMode === "edit" && <aside className="config-pane">
        <div className="config-head">
          <h2>数据配置</h2>
          <p>选择当前多维表格里的数据表、视图和字段</p>
        </div>
        <label>
          <span>数据表</span>
          <select
            disabled={!schema.tables.length}
            value={sourceConfig.tableId}
            onChange={(event) => updateTable(event.target.value)}
          >
            {!schema.tables.length && <option value="">暂无可选数据表</option>}
            {schema.tables.map((table) => (
              <option key={table.id} value={table.id}>{table.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>视图</span>
          <select
            disabled={!schema.views.length}
            value={sourceConfig.viewId}
            onChange={(event) => updateSourceConfig({ viewId: event.target.value })}
          >
            {!schema.views.length && <option value="">全部记录</option>}
            {schema.views.map((view) => (
              <option key={view.id} value={view.id}>{view.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>任务名称字段</span>
          <select
            disabled={!taskFieldOptions.length}
            value={sourceConfig.taskNameFieldId}
            onChange={(event) => updateSourceConfig({ taskNameFieldId: event.target.value })}
          >
            {!taskFieldOptions.length && <option value="">未找到文本/单选字段</option>}
            {taskFieldOptions.map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>开始时间字段</span>
          <select
            disabled={!dateFieldOptions.length}
            value={sourceConfig.startTimeFieldId}
            onChange={(event) => updateSourceConfig({ startTimeFieldId: event.target.value })}
          >
            {!dateFieldOptions.length && <option value="">未找到日期时间字段</option>}
            {dateFieldOptions.map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>结束时间字段</span>
          <select
            disabled={!dateFieldOptions.length}
            value={sourceConfig.endTimeFieldId}
            onChange={(event) => updateSourceConfig({ endTimeFieldId: event.target.value })}
          >
            {!dateFieldOptions.length && <option value="">未找到日期时间字段</option>}
            {dateFieldOptions.map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>耗时字段</span>
          <select
            value={sourceConfig.durationSecondsFieldId}
            onChange={(event) => updateSourceConfig({ durationSecondsFieldId: event.target.value })}
          >
            <option value="">按开始/结束时间计算</option>
            {durationFieldOptions.map((field) => (
              <option key={field.id} value={field.id}>{field.name}</option>
            ))}
          </select>
        </label>
        {schemaMessage && <p className="save-message error">{schemaMessage}</p>}
        {schemaLoading && <p className="save-message">正在读取字段...</p>}
        <button
          className="save-button"
          disabled={!isSourceConfigReady(sourceConfig)}
          onClick={() => void saveConfig(sourceConfig)}
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

createRoot(document.getElementById("root")!).render(<App />);
