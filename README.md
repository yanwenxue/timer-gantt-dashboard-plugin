# timer-gantt-dashboard-plugin
飞书-秒级甘特图

## 飞书市场发布

飞书部署读取 `package.json` 中的 `output: "dist"`。提交审核前，在仓库根目录执行：

```bash
npm ci
npm test
npm run build
git add dist
```

将源代码和最新的 `dist/` 构建产物一同提交并推送到 GitHub，确保仓库中包含 `dist/index.html` 及其引用的 `dist/assets/` 文件。每次修改源代码后都需要重新构建并提交产物。

仓库只保留 `dist/` 一份构建产物，供飞书市场部署和 GitHub Pages 共用。构建资源使用相对路径，以支持飞书 CDN 部署。

## GitHub Pages 发布

推送到 `main` 后，`.github/workflows/pages.yml` 会安装锁定的依赖、执行测试并重新构建，再检查构建结果是否与提交的 `dist/` 一致。校验通过后发布到 GitHub Pages；若遗漏或提交了过期产物，工作流失败并保留上一次成功发布。仓库不再维护 `docs/`。

本地构建并提交后，可运行 `npm run check:dist` 检查产物与提交状态及入口引用的资源是否完整。

仓库 Settings → Pages → Source 使用 `GitHub Actions`。

在线地址保持不变：https://yanwenxue.github.io/timer-gantt-dashboard-plugin/ 。已引用该地址的飞书仪表盘无需重新添加。

## 数据与交互

- 在飞书中按列批量读取原始值，保留日期字段的毫秒精度，不依赖字段显示格式。未选择视图时读取全表；选择的视图失效时提示错误。
- 耗时字段可留空，按结束时间减开始时间计算；单元格为空或不是有效非负数字时也按时间差计算，显式的 `0` 保留。
- 名称为空、时间无效或结束早于开始的记录会跳过并提示数量。真实数据为空或读取失败时不混入示例数据；独立打开页面才展示内置演示数据，可选择“全部”查看。
- 刷新和主题切换保留有效缩放位置；切换数据表、视图或时间范围时重置。悬停时间轴显示秒级时间、参考线及相交任务。
- 最近 3 天、最近 7 天和今天使用同一个时钟计算统计和横轴，每分钟及手动刷新时更新。

## 代码结构与验证

`App.tsx` 组织界面，`TimelineChart.tsx` 管理图表，`hooks.ts` 管理异步状态，`lark-data.ts` / `lark-schema.ts` 负责 SDK 数据与结构，`time.ts` / `source-config.ts` 处理时间和配置规则。`echarts.ts` 仅注册甘特图所需模块。

`npm test` 覆盖原始时间与耗时边界、视图范围、批量读取、异步竞态、空数据与错误恢复、图表生命周期及缩放、提示内容转义、主题持久化。SDK 通过测试替身验证，真实飞书权限与数据仍需在仪表盘环境验收。
