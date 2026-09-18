import { useCallback, useState, useSyncExternalStore } from "react";

export type Language = "zh-CN" | "en-US" | "ja-JP";
let language: Language = "zh-CN";
const listeners = new Set<() => void>();
export function setLanguage(value: string) {
  const next = value.startsWith("ja") ? "ja-JP" : value.startsWith("zh") ? "zh-CN" : "en-US";
  if (next === language) return;
  language = next;
  listeners.forEach(listener => listener());
}
export const getLanguage = () => language;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage);
// Chinese is the source text. User data and host error messages are never translated.
export const translations: Record<string, readonly [string, string]> = {
  "数据显示范围由所选数据表或视图决定，不联动仪表盘全局筛选。": ["The selected table or view determines the data range. Dashboard-wide filters do not apply.", "選択したテーブルまたはビューの範囲を表示します。ダッシュボード全体の絞り込みには連動しません。"],
  "记录分页异常，请刷新重试": ["Record pagination failed. Refresh and try again.", "レコードのページ取得に失敗しました。更新して再試行してください。"],
  "仪表盘配置不完整，请重新配置字段": ["Dashboard settings are incomplete. Configure the fields again.", "ダッシュボードの設定が不完全です。フィールドを設定し直してください。"],
  "示例数据没有对应的多维表格行": ["Demo data has no corresponding record", "サンプルデータに対応するレコードはありません"],
  "打开行详情失败": ["Could not open record details", "レコードの詳細を開けませんでした"],
  "已打开对应行链接": ["Record link opened", "レコードのリンクを開きました"],
  "当前无法打开行详情，请确认在飞书仪表盘环境中使用": ["Cannot open record details. Use this plugin in a Base dashboard.", "レコードの詳細を開けません。Base ダッシュボードでご利用ください。"],
  "秒级甘特图": ["Second-level Gantt Chart", "秒単位ガントチャート"],
  "刷新数据": ["Refresh data", "データを更新"],
  "执行记录": ["Executions", "実行記録"], "任务类型": ["Task types", "タスクの種類"],
  "最长耗时": ["Longest duration", "最長所要時間"], "累计耗时": ["Total duration", "合計所要時間"],
  "飞书数据": ["Base data", "Base データ"], "读取失败": ["Read failed", "読み込み失敗"], "演示数据": ["Demo data", "サンプルデータ"],
  "时间范围": ["Time range", "期間"], "自选时间范围": ["Custom time range", "期間を指定"],
  "开始时间": ["Start time", "開始時刻"], "至": ["to", "〜"], "结束时间": ["End time", "終了時刻"],
  "结束时间需晚于开始时间": ["End must be after start", "終了時刻は開始時刻より後にしてください"],
  "任务类型筛选": ["Filter task types", "タスクの種類で絞り込み"],
  "点击显示该任务": ["Show this task", "このタスクを表示"], "点击隐藏该任务": ["Hide this task", "このタスクを非表示"],
  "数据配置": ["Data settings", "データ設定"],
  "点击每项右侧箭头，下拉选择当前多维表格里的数据表、视图和字段": ["Search and select the table, view and fields in this Base.", "この Base のテーブル、ビュー、フィールドを検索して選択してください。"],
  "暂无可选数据表": ["No tables available", "選択できるテーブルがありません"], "数据表": ["Table", "テーブル"],
  "全部记录": ["All records", "すべてのレコード"], "视图": ["View", "ビュー"],
  "未找到文本/单选字段": ["No text or single-select fields", "テキスト・単一選択フィールドがありません"],
  "任务名称字段": ["Task name field", "タスク名フィールド"],
  "未找到日期时间字段": ["No date/time fields", "日時フィールドがありません"],
  "开始时间字段": ["Start time field", "開始時刻フィールド"], "结束时间字段": ["End time field", "終了時刻フィールド"],
  "按开始/结束时间计算": ["Calculate from start/end times", "開始・終了時刻から計算"], "耗时字段": ["Duration field", "所要時間フィールド"],
  "正在读取字段...": ["Loading fields…", "フィールドを読み込み中…"], "保存到仪表盘": ["Save to dashboard", "ダッシュボードに保存"],
  "使用方式": ["How to use", "使い方"],
  "保存后回到仪表盘页面，组件会以展示态加载，只保留左侧图表。": ["After saving, return to the dashboard to see the chart without the settings panel.", "保存後にダッシュボードに戻ると、設定パネルを除いたチャートが表示されます。"],
  "当前时间范围没有执行区间": ["No executions in this time range", "この期間に実行記録はありません"],
  "点击打开行详情": ["Click to open record details", "クリックしてレコードの詳細を表示"],
  "此刻无任务执行": ["No tasks running at this time", "この時刻に実行中のタスクはありません"],
  "所选项不可用，请重新选择": ["Selection unavailable. Choose again.", "選択した項目は利用できません。選択し直してください。"],
  "调整整体面板颜色": ["Change panel color", "パネルの色を変更"], "主题色": ["Theme color", "テーマカラー"],
  "面板主题色": ["Panel theme color", "パネルのテーマカラー"],
  "选择颜色，即时预览整体效果": ["Choose a color to preview it immediately", "色を選択するとすぐにプレビューできます"],
  "预设主题色": ["Preset colors", "プリセットカラー"], "自定义颜色": ["Custom color", "カスタムカラー"],
  "打开自定义选色器": ["Open color picker", "カラーピッカーを開く"], "HEX 颜色值": ["HEX color value", "HEX カラーコード"],
  "请输入 # 加 6 位十六进制色值": ["Enter # followed by six hexadecimal digits", "# に続けて6桁の16進数を入力してください"],
  "已记住本机选择": ["Saved on this device", "この端末に保存済み"],
  "当前环境无法保存，仅本次有效": ["Storage unavailable. Applies to this session only.", "保存できません。このセッションのみ有効です。"],
  "选择后自动保存在本机": ["Selections are saved on this device", "選択した色はこの端末に保存されます"], "恢复默认": ["Reset", "既定値に戻す"],
  "共享主题请点击“保存配置”；本机选择优先。": ["Save to dashboard to share the theme. Device preferences take priority.", "テーマを共有するにはダッシュボードに保存してください。端末の設定が優先されます。"],
  "独立页面演示，使用内置示例数据": ["Standalone preview using sample data", "サンプルデータによる単独プレビュー"],
  "请先选择数据表和必需字段": ["Select a table and the required fields first", "テーブルと必須フィールドを選択してください"],
  "正在读取数据…": ["Loading data…", "データを読み込み中…"],
  "当前数据范围暂无有效执行记录": ["No valid executions in this data range", "このデータ範囲に有効な実行記録はありません"],
  "请检查数据权限和字段配置": ["Check data permissions and field settings", "データの権限とフィールド設定を確認してください"],
  "请重新加载组件": ["Reload the widget", "ウィジェットを再読み込みしてください"],
  "演示页面无法保存仪表盘配置，请在飞书中使用": ["Demo settings cannot be saved to a dashboard. Open this plugin in Base.", "デモ画面からダッシュボードには保存できません。Base で開いてください。"],
  "飞书未确认保存成功，请重试": ["Base did not confirm the save. Try again.", "Base から保存完了を確認できませんでした。再試行してください。"],
  "已保存，可回到仪表盘查看": ["Saved. Return to the dashboard to view it.", "保存しました。ダッシュボードで確認できます。"],
  "配置已保存": ["Settings saved", "設定を保存しました"], "请重试": ["Try again", "再試行してください"],
  "无法读取多维表格结构": ["Cannot load the Base schema", "Base の構造を読み込めません"],
  "当前 Base 没有可读取的数据表": ["No readable tables in this Base", "この Base に読み取り可能なテーブルがありません"],
  "今天": ["Today", "今日"], "最近3天": ["Last 3 days", "過去3日"], "最近7天": ["Last 7 days", "過去7日"],
  "全部": ["All", "すべて"], "自选": ["Custom", "指定"],
  "秒": ["s", "秒"], "小时": ["h", "時間"], "分": ["min", "分"],
  "青绿": ["Teal", "ティール"], "湖蓝": ["Blue", "ブルー"], "紫罗兰": ["Violet", "バイオレット"],
  "玫瑰": ["Rose", "ローズ"], "暖橙": ["Orange", "オレンジ"], "石墨": ["Graphite", "グラファイト"],
  "文本": ["Text", "テキスト"], "数字": ["Number", "数値"], "单选": ["Single select", "単一選択"],
  "日期时间": ["Date/time", "日時"], "公式": ["Formula", "数式"], "创建时间": ["Created time", "作成日時"],
  "更新时间": ["Modified time", "更新日時"], "自动编号": ["Autonumber", "自動採番"],
  "类型 {type}": ["Type {type}", "種類 {type}"], "搜索 {label}": ["Search {label}", "{label}を検索"],
  "无匹配项": ["No matches", "一致する項目がありません"],
  "已跳过 {count} 条名称或时间无效的记录": ["Skipped {count} records with invalid names or times", "名前や時刻が無効なレコードを {count} 件スキップしました"],
  "读取失败：{error}": ["Read failed: {error}", "読み込み失敗：{error}"],
  "读取仪表盘配置失败：{error}": ["Could not load dashboard settings: {error}", "ダッシュボード設定を読み込めませんでした：{error}"],
  "保存失败：{error}": ["Save failed: {error}", "保存失敗：{error}"],
  "开始：{time}": ["Start: {time}", "開始：{time}"], "结束：{time}": ["End: {time}", "終了：{time}"],
  "耗时：{duration}": ["Duration: {duration}", "所要時間：{duration}"],
  "{tasks} 个任务 · {runs} 次执行": ["{tasks} tasks · {runs} executions", "{tasks} タスク・{runs} 件の実行"],
  "另有 {count} 个任务，见竖线交点": ["{count} more tasks at the vertical line", "縦線の交点にさらに {count} タスクがあります"]
};
export function t(key: string, values: Record<string, string | number> = {}): string {
  const template = language === "zh-CN" ? key : translations[key]?.[language === "en-US" ? 0 : 1] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}

/** Store message keys so an asynchronous host-language response also updates existing notices. */
export function useMessage(initial = "") {
  useLanguage();
  const [message, setMessage] = useState({ key: initial, values: {} as Record<string, string | number> });
  const update = useCallback((key: string, values: Record<string, string | number> = {}) => setMessage({ key, values }), []);
  return [t(message.key, Object.fromEntries(Object.entries(message.values).map(([key, value]) => [key, typeof value === "string" ? t(value) : value]))), update] as const;
}
