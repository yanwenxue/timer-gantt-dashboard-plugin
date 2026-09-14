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

`docs/` 用于 GitHub Pages 在线预览，不能替代飞书部署所需的 `dist/`。构建资源使用相对路径，以支持飞书 CDN 部署。
