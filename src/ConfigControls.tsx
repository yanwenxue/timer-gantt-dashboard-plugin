import { t } from "./i18n";
import React, { useEffect, useState } from "react";
import { Check, ChevronDown, Palette } from "lucide-react";
import { defaultThemeColor, isThemeColor, themePresets } from "./theme";
import type { ThemePreference } from "./theme-preference";
import type { DashboardMode, SelectOption } from "./types";
export function ConfigSelect({
  label,
  value,
  disabled = false,
  options,
  emptyLabel,
  onChange
}: {
  label: string;
  value: string;
  disabled?: boolean;
  options: SelectOption[];
  emptyLabel?: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [value]);
  const matches = options.filter(option => `${option.name} ${option.meta ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const shown = options.filter(option => option.id === value || matches.includes(option));
  const icons: Record<number, string> = { 1: "Aa", 2: "#", 3: "◉", 5: "◷", 20: "ƒ", 1001: "◷", 1002: "◷", 1005: "#" };
  return (
    <label>
      <span>{label}</span>
      <input type="search" aria-label={t("搜索 {label}", { label })} placeholder={t("搜索 {label}", { label })}
        value={query} disabled={disabled} onChange={event => setQuery(event.target.value)} />
      {query && !matches.length && <span role="status">{t("无匹配项")}</span>}
      <div className="select-wrap">
        <select
          aria-label={label}
          disabled={disabled}
          title={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {value && !options.some(option => option.id === value) && <option value={value} disabled>{t("所选项不可用，请重新选择")}</option>}
          {emptyLabel && <option value="">{emptyLabel}</option>}
          {shown.map((option) => (
            <option key={option.id} value={option.id}>
              {option.type && <>{icons[option.type] ?? "◇"} </>}{option.meta ? `${option.name} - ${option.meta}` : option.name}
            </option>
          ))}
        </select>
        <ChevronDown className="select-chevron" size={16} />
      </div>
    </label>
  );
}

export function ThemePicker({ color, onChange, dashboardMode, persistence }: {
  color: string;
  onChange: (color: string) => void;
  dashboardMode: DashboardMode;
  persistence: ThemePreference["persistence"];
}) {
  const [draft, setDraft] = useState(color);
  useEffect(() => setDraft(color), [color]);
  const valid = isThemeColor(draft);
  return (
    <details className="theme-picker" onKeyDown={(event) => {
      if (event.key === "Escape") event.currentTarget.open = false;
    }}>
      <summary title={t("调整整体面板颜色")}><Palette size={17} /><span>{t("主题色")}</span></summary>
      <div className="theme-picker-panel">
        <strong>{t("面板主题色")}</strong>
        <p>{t("选择颜色，即时预览整体效果")}</p>
        <div className="theme-presets" role="group" aria-label={t("预设主题色")}>
          {themePresets.map((preset) => <button
            key={preset.color}
            type="button"
            aria-label={t(preset.name)}
            aria-pressed={color.toLowerCase() === preset.color}
            title={t(preset.name)}
            style={{ background: preset.color }}
            onClick={() => onChange(preset.color)}
          >{color.toLowerCase() === preset.color && <Check size={16} />}</button>)}
        </div>
        <label className="theme-custom-label" htmlFor="theme-color-input">{t("自定义颜色")}</label>
        <div className="theme-custom-inputs">
          <input id="theme-color-input" aria-label={t("打开自定义选色器")} type="color" value={color} onChange={(event) => onChange(event.target.value)} />
          <input aria-label={t("HEX 颜色值")} aria-invalid={!valid} type="text" value={draft} spellCheck={false} maxLength={7} onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            if (isThemeColor(value)) onChange(value.toLowerCase());
          }} />
        </div>
        {!valid && <p className="theme-color-error">{t("请输入 # 加 6 位十六进制色值")}</p>}
        <div className="theme-picker-footer">
          <span>{persistence === "saved" ? t("已记住本机选择") : persistence === "unavailable" ? t("当前环境无法保存，仅本次有效") : t("选择后自动保存在本机")}</span>
          <button type="button" onClick={() => { setDraft(defaultThemeColor); onChange(defaultThemeColor); }}>{t("恢复默认")}</button>
        </div>
        {dashboardMode === "edit" && <p>{t("共享主题请点击“保存配置”；本机选择优先。")}</p>}
      </div>
    </details>
  );
}
