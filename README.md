# Team Playbook

无畏契约团队战术库，使用 React、TypeScript 和 Vite。地图画布、英雄与技能、Lineup、多页战术和 .ica 读写均由这个 npm 项目实现。成品是可部署到 GitHub Pages 的静态文件。

## 本地开发

需要 Node.js 22.18 或更高版本。在仓库根目录运行：

```bash
npm ci
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。开发服务器会读取本地 `strategies/`，改完战术文件后点击页面的刷新按钮即可看到更新。

`npm test` 检查 .ica 读写、战术索引和画布手势计算。`npm run build` 生成 `dist/`，`npm run preview` 在本地预览构建产物。

## 编辑和发布

1. 在网页上选地图并新建战术。点击右侧英雄打开技能栏，拖英雄、技能或道具到地图上放置。右键画布上的对象可以进入编辑，或直接删除。
2. 用画笔、形状、文本和图片标注战术。按 `T` 在画布视口中心放置文本并直接输入。按 `C` 接续当前页，按 `A` / `D` 翻页，点击左下角页名展开页面列表。按 `F` 切换整套战术的攻防朝向，`Shift+F` 只切当前页。
3. 按 `G` 进入 Lineup 模式，分别拖入英雄和对应技能，标出投掷起点和落点，再点「下一步」填写详情。已保存的 Lineup 可以从本页列表打开，点「调整位置」后拖动两端并保存。
4. 点击 **导出 .ica**，把文件发给仓库维护者。浏览器中的草稿也可以在「本地战术」继续编辑。
5. 把收到的文件放进 [`strategies/`](strategies/) 并提交到 `main`。支持子目录和中文文件名。更新同一份战术时替换同一路径的文件。
6. GitHub Actions 重新部署后刷新 **团队战术库**。点击战术卡片进入编辑器，点击眼睛按钮进入只读浏览。两种视图都支持多页动效播放。

团队战术的修改按发布版本单独保存在当前浏览器，重新打开同一版本可以继续编辑。向队友分享修改仍通过导出和发布完成。

本地战术库支持多级文件夹、置顶和 ZIP 备份，可直接拖入 .ica 或备份 ZIP。编辑器可导出 PNG、视频和透明 MOV，普通视频格式取决于浏览器支持的编码器。

「回放」可以打开已解码的 Icarus `.icrp` 文件，按回合播放，并把当前画面保存成战术页。回放文件和草稿都保存在当前浏览器。

上一个 Flutter 版本里的本地草稿可以先导出为 .ica，再在新版网页导入。

首次部署时，在公开仓库的 **Settings → Pages** 中把发布来源设为 **GitHub Actions**，然后在 **Actions → Deploy team playbook** 运行工作流。之后提交到 `main` 会自动更新网站。当前公开仓库里的战术文件会随网站公开。

## 许可证和素材来源

本项目自有的代码和文档采用 [MIT](LICENSE) 许可证。地图资源、特工图标、技能参数和文件结构参考 [Icarus Strats](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e)。复用的 Icarus 内容保留 [Apache-2.0](LICENSES/Apache-2.0.txt) 许可证及 [上游署名](NOTICE)。VALORANT 及相关游戏资源归 Riot Games 所有。

原版功能、本站对应入口及差距见 [Icarus Strats 功能对照总表](docs/icarus-interaction-audit.md)。
