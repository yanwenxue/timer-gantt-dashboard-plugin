export type TimerRun = {
  id: string;
  tableId?: string;
  viewId?: string;
  taskName: string;
  start: number;
  end: number;
  durationSeconds: number;
};

export type LegacyFieldMapping = {
  tableName: string;
  taskName: string;
  startTime: string;
  endTime: string;
  durationSeconds: string;
};

export type DataSourceConfig = {
  tableId: string;
  viewId: string;
  taskNameFieldId: string;
  startTimeFieldId: string;
  endTimeFieldId: string;
  durationSecondsFieldId: string;
};

export type TableOption = {
  id: string;
  name: string;
};

export type ViewOption = {
  id: string;
  name: string;
};

export type FieldOption = {
  id: string;
  name: string;
  type: number;
};

export type SelectOption = {
  id: string;
  name: string;
  meta?: string;
  type?: number;
};

export type BaseSchema = {
  tables: TableOption[];
  views: ViewOption[];
  fields: FieldOption[];
};

export type RuntimeMode = "mock" | "lark" | "error";
export type DashboardMode = "edit" | "view";
export type TimeWindow = "today" | "3d" | "7d" | "all" | "custom";
export type FieldRole = "taskName" | "startTime" | "endTime" | "durationSeconds";


export type TimeRange = { start: string; end: string };
