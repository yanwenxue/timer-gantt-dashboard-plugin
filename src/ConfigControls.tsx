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
  return (
    <label>
      <span>{label}</span>
      <div className="select-wrap">
        <select
          aria-label={label}
          disabled={disabled}
          title={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {emptyLabel && <option value="">{emptyLabel}</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.meta ? `${option.name} - ${option.meta}` : option.name}
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
      <summary title="调整整体面板颜色"><Palette size={17} /><span>主题色</span></summary>
      <div className="theme-picker-panel">
        <strong>面板主题色</strong>
        <p>选择颜色，即时预览整体效果</p>
        <div className="theme-presets" role="group" aria-label="预设主题色">
          {themePresets.map((preset) => <button
            key={preset.color}
            type="button"
            aria-label={preset.name}
            aria-pressed={color.toLowerCase() === preset.color}
            title={preset.name}
            style={{ background: preset.color }}
            onClick={() => onChange(preset.color)}
          >{color.toLowerCase() === preset.color && <Check size={16} />}</button>)}
        </div>
        <label className="theme-custom-label" htmlFor="theme-color-input">自定义颜色</label>
        <div className="theme-custom-inputs">
          <input id="theme-color-input" aria-label="打开自定义选色器" type="color" value={color} onChange={(event) => onChange(event.target.value)} />
          <input aria-label="HEX 颜色值" aria-invalid={!valid} type="text" value={draft} spellCheck={false} maxLength={7} onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            if (isThemeColor(value)) onChange(value.toLowerCase());
          }} />
        </div>
        {!valid && <p className="theme-color-error">请输入 # 加 6 位十六进制色值</p>}
        <div className="theme-picker-footer">
          <span>{persistence === "saved" ? "已记住本机选择" : persistence === "unavailable" ? "当前环境无法保存，仅本次有效" : "选择后自动保存在本机"}</span>
          <button type="button" onClick={() => { setDraft(defaultThemeColor); onChange(defaultThemeColor); }}>恢复默认</button>
        </div>
        {dashboardMode === "edit" && <p>共享主题请点击“保存配置”；本机选择优先。</p>}
      </div>
    </details>
  );
}

