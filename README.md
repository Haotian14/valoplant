# Team Playbook

无畏契约团队战术库，使用 React、TypeScript 和 Vite。地图画布、英雄与技能、Lineup、多页战术和 .ica 读写均由这个 npm 项目实现。成品是可部署到 GitHub Pages 的静态文件。

## 本地开发

需要 Node.js 22.18 或更高版本。在仓库根目录运行：

```bash
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。开发服务器会读取本地 `strategies/`，改完战术文件后点击页面的刷新按钮即可看到更新。

`npm test` 检查 .ica 读写及战术索引。`npm run build` 生成 `dist/`，`npm run preview` 在本地预览构建产物。

## 编辑和发布

1. 在网页上选地图，新建战术。拖放英雄、技能或道具，也可以先选中再点击地图。右键英雄打开技能列表，右键已放置对象可以编辑或删除。
2. 用画笔、箭头、形状、文本和图片标注战术。按 `C` 接续当前页，按 `A` / `D` 切换页面。按 `F` 切换整套战术的攻防朝向，`Shift+F` 只切当前页。按 `G` 进入 Lineup 模式，选技能后依次标记投掷起点和技能落点。
3. 点击 **导出 .ica**，把文件发给仓库维护者。浏览器中的草稿也可以在「本地战术」继续编辑。
4. 把收到的文件放进 [`strategies/`](strategies/) 并提交到 `main`。支持子目录和中文文件名。更新同一份战术时替换同一路径的文件。
5. GitHub Actions 重新部署后刷新 **团队战术库**。打开团队战术会创建本地副本，已编辑的副本在「本地战术」中保留。

上一个 Flutter 版本里的本地草稿可以先导出为 .ica，再在新版网页导入。

首次部署时，在公开仓库的 **Settings → Pages** 中把发布来源设为 **GitHub Actions**，然后在 **Actions → Deploy team playbook** 运行工作流。之后提交到 `main` 会自动更新网站。当前公开仓库里的战术文件会随网站公开。

## 许可证和素材来源

本项目自有的代码和文档采用 [MIT](LICENSE) 许可证。地图资源、特工图标、技能参数和文件结构参考 [Icarus Strats](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e)。复用的 Icarus 内容保留 [Apache-2.0](LICENSES/Apache-2.0.txt) 许可证及 [上游署名](NOTICE)。VALORANT 及相关游戏资源归 Riot Games 所有。

视野锥使用几何范围，页面播放使用标记过渡。Icarus 的地图遮挡计算、路径转场、原生回放、视频导出和实时协作属于上游功能。
