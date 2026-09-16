import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseSchema, DataSourceConfig, LegacyFieldMapping, DashboardMode, RuntimeMode, TimerRun } from "./types";
import { isSameSourceConfig, isSourceConfigReady } from "./source-config";
import { loadBaseSchema } from "./lark-schema";
import { loadLarkRuns } from "./lark-data";
import { mockRuns } from "./demo";
import { createLatestRequest } from "./latest-request";

export function useTimerRuns(config: DataSourceConfig, enabled: boolean, preview: boolean) {
  const [runs, setRuns] = useState<TimerRun[]>(preview ? mockRuns : []);
  const [mode, setMode] = useState<RuntimeMode>(preview ? "mock" : "lark");
  const [message, setMessage] = useState(preview ? "独立页面演示，使用内置示例数据" : "");
  const [loading, setLoading] = useState(false);
  const requests = useRef(createLatestRequest());
  const previousConfig = useRef(config);
  const reload = useCallback(async () => {
    const current = requests.current.begin();
    if (preview || !enabled) return;
    if (!isSourceConfigReady(config)) {
      setRuns([]); setMode("lark"); setLoading(false); setMessage("请先选择数据表和必需字段"); return;
    }
    setLoading(true);
    if (!isSameSourceConfig(previousConfig.current, config)) setRuns([]);
    previousConfig.current = config;
    setMessage("正在读取数据…");
    try {
      const result = await loadLarkRuns(config);
      if (!current()) return;
      setRuns(result.runs); setMode("lark");
      setMessage(result.skipped ? `已跳过 ${result.skipped} 条名称或时间无效的记录` : result.runs.length ? "" : "当前数据范围暂无有效执行记录");
    } catch (error) {
      if (!current()) return;
      setRuns([]); setMode("error");
      setMessage(`读取失败：${error instanceof Error ? error.message : "请检查数据权限和字段配置"}`);
    } finally { if (current()) setLoading(false); }
  }, [config, enabled, preview]);
  useEffect(() => { void reload(); return () => requests.current.invalidate(); }, [reload]);
  return { runs, mode, message, loading, reload };
}

type SavedConfig = { sourceConfig?: Partial<DataSourceConfig>; fieldMapping?: Partial<LegacyFieldMapping>; themeColor?: unknown };
export function useDashboardConfig() {
  const [preview] = useState(() => window.self === window.top);
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("edit");
  const [saved, setSaved] = useState<SavedConfig | null>(preview ? {} : null);
  const [saveMessage, setSaveMessage] = useState("");
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const retryConfig = useCallback(() => setConfigAttempt(value => value + 1), []);
  useEffect(() => {
    if (preview) return;
    let active = true;
    let receivedUpdate = false;
    let unsubscribe: (() => void) | undefined;
    setConfigError("");
    (async () => {
      try {
        const { dashboard, DashboardState } = await import("@lark-base-open/js-sdk");
        if (!active) return;
        const viewing = dashboard.state === DashboardState.View || dashboard.state === DashboardState.FullScreen;
        setDashboardMode(viewing ? "view" : "edit");
        // A new widget has no persisted config until its first save.
        if (dashboard.state === DashboardState.Create) {
          setSaved({});
          return;
        }
        // Live views follow host updates; an editor keeps its unsaved local draft.
        if (viewing) unsubscribe = dashboard.onConfigChange(({ data }) => {
          if (!active) return;
          receivedUpdate = true;
          setSaved((data.customConfig ?? {}) as SavedConfig);
          setConfigError("");
        });
        const config = await dashboard.getConfig();
        if (!active) return;
        // An event received during the initial read is newer than that read's response.
        if (!receivedUpdate) setSaved((config.customConfig ?? {}) as SavedConfig);
        await dashboard.setRendered();
      } catch (error) {
        if (active && !receivedUpdate) setConfigError(`读取仪表盘配置失败：${error instanceof Error ? error.message : "请重新加载组件"}`);
      }
    })();
    return () => { active = false; unsubscribe?.(); };
  }, [preview, configAttempt]);
  const saveConfig = async (config: DataSourceConfig, themeColor: string) => {
    if (preview) { setSaveMessage("演示页面无法保存仪表盘配置，请在飞书中使用"); return; }
    setSaving(true); setSaveMessage("");
    try {
      const { dashboard, ui, ToastType } = await import("@lark-base-open/js-sdk");
      const success = await dashboard.saveConfig({ dataConditions: [], customConfig: { sourceConfig: config, themeColor } });
      if (!success) throw new Error("飞书未确认保存成功，请重试");
      setSaveMessage("已保存，可回到仪表盘查看");
      await ui.showToast({ toastType: ToastType.success, message: "配置已保存" }).catch(() => {});
    } catch (error) { setSaveMessage(`保存失败：${error instanceof Error ? error.message : "请重试"}`); }
    finally { setSaving(false); }
  };
  return { dashboardMode, saveMessage, saveConfig, saved, preview, configError, saving, retryConfig };
}

export function useBaseSchema(config: DataSourceConfig, legacyMapping: LegacyFieldMapping,
  onConfigResolved: (expected: DataSourceConfig, config: DataSourceConfig) => void, enabled: boolean) {
  const [schema, setSchema] = useState<BaseSchema>({ tables: [], views: [], fields: [] });
  const [schemaTableId, setSchemaTableId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [schemaAttempt, setSchemaAttempt] = useState(0);
  const retrySchema = useCallback(() => setSchemaAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const result = await loadBaseSchema(config, legacyMapping);
        if (!active) return;
        setSchema(result.schema); setSchemaTableId(result.config.tableId); setMessage("");
        if (!isSameSourceConfig(config, result.config)) onConfigResolved(config, result.config);
      } catch (error) {
        if (active) { setSchema({ tables: [], views: [], fields: [] }); setMessage(error instanceof Error ? error.message : "无法读取多维表格结构"); }
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [config, legacyMapping, onConfigResolved, enabled, schemaAttempt]);
  // Keep the table selector usable while never exposing another table's fields or views.
  const currentSchema = schemaTableId === config.tableId ? schema : { tables: schema.tables, views: [], fields: [] };
  return { schema: currentSchema, loading, message, retrySchema };
}
