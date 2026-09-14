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

推送到 `main` 后，`.github/workflows/pages.yml` 会通过 GitHub Actions 将已提交的 `dist/` 发布到 GitHub Pages，不再维护 `docs/`。工作流直接发布产物，因此修改源码后仍需先执行上面的测试和构建步骤，并提交最新 `dist/`。

仓库 Settings → Pages → Source 使用 `GitHub Actions`。

在线地址保持不变：https://yanwenxue.github.io/timer-gantt-dashboard-plugin/ 。已引用该地址的飞书仪表盘无需重新添加。
