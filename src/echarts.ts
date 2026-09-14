import { use } from "echarts/core";
import { CustomChart } from "echarts/charts";
import { GridComponent, TooltipComponent, DataZoomComponent, GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
use([CustomChart, GridComponent, TooltipComponent, DataZoomComponent, GraphicComponent, CanvasRenderer]);
export { init, graphic } from "echarts/core";
export type { EChartsType } from "echarts/core";
