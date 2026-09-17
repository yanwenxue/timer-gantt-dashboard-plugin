import { t } from "./i18n";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "./echarts";
import type { PanelTheme } from "./theme";
import type { TimerRun, TimeWindow } from "./types";
import { parseTime, formatTime, formatAxisLabel, formatDuration, byStartTime, axisPaddingMs, getRunBounds } from "./time";
import { escapeHtml, zoomForBounds, type ZoomWindow } from "./chart-state";

export function taskColor(taskName: string, tasks: string[], theme: PanelTheme): string {
  const index = Math.max(0, tasks.indexOf(taskName));
  return theme.palette[index % theme.palette.length];
}

export function TimelineChart({
  runs,
  theme,
  colorTasks,
  timeWindow,
  windowStart,
  windowEnd,
  resetKey,
  onOpenRecord,
  onRendered,
  language
}: {
  runs: TimerRun[];
  theme: PanelTheme;
  colorTasks: string[];
  timeWindow: TimeWindow;
  windowStart: number;
  windowEnd: number;
  resetKey: string;
  onRendered?: () => void;
  language?: string;
  onOpenRecord?: (run: TimerRun) => void;
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [hover, setHover] = useState<{
    x: number;
    time: number;
    bottom: number;
    panelLeft: number;
    matches: Array<{ taskName: string; count: number; y: number }>;
  } | null>(null);
  const sortedRuns = useMemo(() => [...runs].sort(byStartTime), [runs]);
  const tasks = useMemo(() => Array.from(new Set(sortedRuns.map((run) => run.taskName))), [sortedRuns]);
  const instance = useRef<echarts.EChartsType | null>(null);
  const zoom = useRef<ZoomWindow | null>(null);
  const previousKey = useRef(resetKey);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    instance.current = chart;
    const observer = new ResizeObserver(() => { setHover(null); setChartWidth(chartRef.current?.clientWidth ?? 0); chart.resize(); });
    observer.observe(chartRef.current);
    return () => { observer.disconnect(); chart.dispose(); instance.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const container = chartRef.current;
    const chart = instance.current;
    if (!chart) return;
    let notified = false;
    const finished = () => { if (!notified) { notified = true; onRendered?.(); } };
    chart.on("finished", finished);
    const gridLeft = Math.min(198, Math.max(72, (chartWidth || container.clientWidth || 800) * 0.24));
    if (previousKey.current !== resetKey) { zoom.current = null; previousKey.current = resetKey; }
    setHover(null);
    const intervals = sortedRuns.map((run) => ({
      run,
      start: parseTime(run.start),
      end: parseTime(run.end)
    }));
    const clearHover = () => setHover(null);
    const trackHover = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const bounds = container.getBoundingClientRect();
      const x = (event.clientX - bounds.left) * chart.getWidth() / bounds.width;
      const y = (event.clientY - bounds.top) * chart.getHeight() / bounds.height;
      const bottom = chart.getHeight() - 70;
      // Include the axis labels, but leave the zoom slider to its own interaction.
      if (x < gridLeft || x > chart.getWidth() - 26 || y < 28 || y >= bottom + 24) {
        clearHover();
        return;
      }
      const time = Number(chart.convertFromPixel({ xAxisIndex: 0 }, x));
      if (!Number.isFinite(time)) {
        clearHover();
        return;
      }
      const counts = new Map<string, number>();
      for (const { run, start, end } of intervals) {
        if (start <= time && time <= end) {
          counts.set(run.taskName, (counts.get(run.taskName) ?? 0) + 1);
        }
      }
      setHover({
        x,
        time,
        bottom,
        panelLeft: Math.max(8, Math.min(x + 14, chart.getWidth() - 288)),
        matches: tasks.flatMap((taskName, index) => counts.has(taskName) ? [{
          taskName,
          count: counts.get(taskName)!,
          y: Number(chart.convertToPixel({ yAxisIndex: 0 }, index))
        }] : [])
      });
    };
    container.addEventListener("pointermove", trackHover);
    container.addEventListener("pointerleave", clearHover);
    const trackZoom = () => {
      clearHover();
      const options = chart.getOption().dataZoom as Array<{ start: number; end: number; startValue: number; endValue: number }>;
      const current = options?.[0];
      zoom.current = current && (current.start > 0 || current.end < 100)
        && Number.isFinite(current.startValue) && Number.isFinite(current.endValue)
        ? { startValue: current.startValue, endValue: current.endValue } : null;
    };
    chart.on("datazoom", trackZoom);
    const openRecord = (params: any) => {
      const run = params?.value?.[3] as TimerRun | undefined;
      if (run) onOpenRecord?.(run);
    };
    chart.on("click", openRecord);
    const cleanup = () => {
      container.removeEventListener("pointermove", trackHover);
      container.removeEventListener("pointerleave", clearHover);
      chart.off("datazoom", trackZoom);
      chart.off("click", openRecord);
      chart.off("finished", finished);
    };
    if (!sortedRuns.length || !tasks.length) {
      chart.setOption({
        animation: false,
        backgroundColor: "transparent",
        graphic: {
          type: "text",
          left: "center",
          top: "middle",
          style: {
            text: t("当前时间范围没有执行区间"),
            fill: theme.muted,
            fontSize: 14,
            fontWeight: 600
          }
        },
        grid: { left: gridLeft, right: 26, top: 28, bottom: 70 },
        dataZoom: [
          {
            type: "inside",
            xAxisIndex: 0,
            ...zoomForBounds(zoom.current, windowStart, windowEnd),
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            moveOnMouseWheel: true
          },
          {
            type: "slider",
            xAxisIndex: 0,
            ...zoomForBounds(zoom.current, windowStart, windowEnd),
            height: 18,
            bottom: 10,
            borderColor: theme.border,
            fillerColor: theme.rgba(0.2),
            backgroundColor: theme.soft,
            handleStyle: { color: theme.color },
            textStyle: { color: theme.muted },
            labelFormatter: (value: number) => formatTime(value)
          }
        ],
        xAxis: {
          type: "time",
          min: windowStart,
          max: windowEnd,
          axisLabel: {
            color: theme.muted,
            hideOverlap: true,
            formatter: (value: number) => formatAxisLabel(value)
          },
          axisLine: { lineStyle: { color: theme.border } },
          axisTick: { lineStyle: { color: theme.border } },
          splitLine: { show: true, lineStyle: { color: theme.grid } }
        },
        yAxis: { show: false },
        series: []
      }, { replaceMerge: ["series", "graphic", "dataZoom"] });
      return cleanup;
    }

    const values = sortedRuns.map((run) => [parseTime(run.start), parseTime(run.end), tasks.indexOf(run.taskName), run]);
    const [dataMin, dataMax] = getRunBounds(sortedRuns);
    const min = timeWindow === "all" ? dataMin! - axisPaddingMs : windowStart;
    const max = timeWindow === "all" ? dataMax! + axisPaddingMs : windowEnd;

    chart.setOption({
      animation: false,
      graphic: [],
      backgroundColor: "transparent",
      grid: { left: gridLeft, right: 26, top: 28, bottom: 70 },
      tooltip: {
        confine: true,
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
        formatter: (params: { value: [number, number, number, TimerRun] }) => {
          const item = params.value[3];
          const color = taskColor(item.taskName, colorTasks, theme);
          return [
            `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span><strong>${escapeHtml(item.taskName)}</strong>`,
            t("开始：{time}", { time: escapeHtml(formatTime(item.start)) }),
            t("结束：{time}", { time: escapeHtml(formatTime(item.end)) }),
            t("耗时：{duration}", { duration: formatDuration(item.durationSeconds) }),
            item.tableId ? t("点击打开行详情") : ""
          ].filter(Boolean).join("<br/>");
        }
      },
      dataZoom: [
        {
          type: "inside",
          xAxisIndex: 0,
          ...zoomForBounds(zoom.current, min, max),
          filterMode: "weakFilter",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        },
        {
          type: "slider",
          xAxisIndex: 0,
          ...zoomForBounds(zoom.current, min, max),
          height: 18,
          bottom: 10,
          borderColor: theme.border,
          fillerColor: theme.rgba(0.2),
          backgroundColor: theme.soft,
          handleStyle: { color: theme.color },
          textStyle: { color: theme.muted },
          labelFormatter: (value: number) => formatTime(value),
          filterMode: "weakFilter"
        }
      ],
      xAxis: {
        type: "time",
        min,
        max,
        axisLabel: {
          color: theme.muted,
          hideOverlap: true,
          formatter: (value: number) => formatAxisLabel(value)
        },
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { lineStyle: { color: theme.border } },
        splitLine: { show: true, lineStyle: { color: theme.grid } }
      },
      yAxis: {
        show: true,
        type: "category",
        data: tasks,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          width: gridLeft - 28,
          overflow: "truncate",
          color: theme.text,
          fontWeight: 600
        }
      },
      series: [
        {
          type: "custom",
          encode: { x: [0, 1], y: 2 },
          data: values,
          renderItem: (params: any, api: any) => {
            const item = sortedRuns[params.dataIndex];
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
            const fill = taskColor(item.taskName, colorTasks, theme);
            const children: any[] = [
              {
                type: "rect",
                shape: { ...rect, r: 4 },
                style: {
                  fill,
                  shadowColor: "rgba(31, 35, 41, 0.13)",
                  shadowBlur: 10,
                  shadowOffsetY: 4
                }
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
    }, { replaceMerge: ["series", "graphic", "dataZoom"] });

    return cleanup;
  }, [sortedRuns, tasks, theme, colorTasks, timeWindow, resetKey, windowStart, windowEnd, onOpenRecord, onRendered, language, chartWidth]);

  return (
    <div className="chart">
      <div className="chart-canvas" ref={chartRef} />
      {hover && <div className="timeline-hover" aria-hidden="true">
        <div className="timeline-hover-line" style={{ left: hover.x, top: 28, height: hover.bottom - 28 }} />
        {hover.matches.map((match) => <span
          key={match.taskName}
          className="timeline-hover-dot"
          style={{ left: hover.x, top: match.y, background: taskColor(match.taskName, colorTasks, theme) }}
        />)}
        <div className="timeline-hover-time" style={{ left: hover.x, top: hover.bottom + 2 }}>
          {formatTime(hover.time)}
        </div>
        <div className="timeline-hover-card" style={{ left: hover.panelLeft, top: 32 }}>
          <strong>{formatTime(hover.time)}</strong>
          <div className="timeline-hover-summary">
            {hover.matches.length
              ? t("{tasks} 个任务 · {runs} 次执行", { tasks: hover.matches.length, runs: hover.matches.reduce((sum, match) => sum + match.count, 0) })
              : t("此刻无任务执行")}
          </div>
          {hover.matches.slice(0, 5).map((match) => <div className="timeline-hover-task" key={match.taskName}>
            <i style={{ background: taskColor(match.taskName, colorTasks, theme) }} />
            <span>{match.taskName}</span>
            {match.count > 1 && <b>×{match.count}</b>}
          </div>)}
          {hover.matches.length > 5 && <div className="timeline-hover-summary">{t("另有 {count} 个任务，见竖线交点", { count: hover.matches.length - 5 })}</div>}
        </div>
      </div>}
    </div>
  );
}
