# Icarus Strats 交互核对

对照 5.2.1 的固定提交，从战术库、编辑器、地图和工具，到翻页、Lineup、保存和发布，逐项检查用户入口及代码行为。表中「已调整」表示本轮有代码改动，「已有」表示此前已支持核心流程，「有差异」表示仍能观察到行为或功能区别。结果来自源码和本项目的自动检查，触屏、触控板和浏览器交互待实测。 [Icarus Strats 5.2.1 源码](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e)

## 战术库与新建

| 操作 | 核对结果 |
| --- | --- |
| 浏览和打开战术 | 有差异。静态站以「团队战术库」和「本地战术」为首页入口。打开团队条目会得到本地副本。Icarus 的库还区分个人、共享和团队内容。 |
| 搜索、地图筛选、排序和视图 | 已有。静态站支持地图筛选、按名称或地图搜索、切换卡片和列表。原版还有置顶与文件夹内排序。 |
| 文件夹与条目管理 | 有差异。团队文件夹来自 `strategies/` 路径。草稿支持打开、复制、导出和删除，进入编辑器可改名。Icarus 支持在界面新建文件夹、移动及置顶条目。 |
| 新建战术 | 已有。选地图后可填名称并进入编辑器。原版从当前文件夹打开地图选择框，并把新战术放进该文件夹。 |
| 返回、快速切换、设置 | 有差异。静态站可返回战术库后打开另一份；缺少编辑器内快速切换、偏好与快捷键配置。 |

[库与文件夹](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/folder_navigator.dart) · [筛选与置顶](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/folder_content.dart) · [条目菜单](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strategy_tile/strategy_tile.dart) · [快速切换](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strategy_quick_switcher.dart)

## 地图与画布

| 操作 | 核对结果 |
| --- | --- |
| 编辑器入口位置 | 已调整。标题在顶部，地图和文档操作在左上，页面在左下，工具与英雄在右侧。样式与按钮细节使用本项目的界面。 |
| 查看和切换地图朝向 | 已调整。点击或按 `F` 切整套战术，按住 `Shift` 仅切当前页，混合朝向显示圆点。 |
| 地图门状态 | 已调整。选择模式下可以点击 Ascent 开关门、Lotus 旋转门和可破坏墙、Summit 降墙。状态按页保存，可撤销并随 .ica 导出，切换后会重算视野。 |
| 图层与地图主题 | 已有点位名称、开局屏障、大招点、网格开关。有差异。缺少原版的地图主题和战术外观设置。 |
| 滚轮和视口重置 | 已调整。以光标为锚点缩放，缩放范围为 1–8 倍，可重置视口。触控板的横向手势、滚动和平移判定依赖浏览器事件，手感待验证。 |
| 平移与触屏捏合 | 已调整。支持鼠标中键或按住空格平移、触屏空白处拖动、双指平移和缩放。原版还为触屏提供专用浏览界面和功能限制，本站使用同一个编辑器和可收起工具栏。 |
| 单选、框选、多选与移动 | 已调整。拖空白处框选，`Shift` 加选，选中后可整体移动。支持单选后拖动旋转和尺寸手柄。框选使用对象中心，拖动时缺少地图结构吸附。 |
| 上下文操作与键盘 | 已调整。`Q` 画笔、`W` 橡皮擦、`S` 选择、`T` 文本、`R` 隐藏英雄、`G` Lineup。`E` 优先删除选中对象，其次删光标下对象，空白处打开本页清除菜单。`X` 和 `Shift+X` 支持 45° 步进，部分技能的旋转规则还有差异。 |
| 撤销、重做、复制、剪切和粘贴 | 已调整。支持 Ctrl/Cmd 组合键和 Escape 取消当前手势。对象剪贴板限于当前编辑器会话，系统剪贴板中的图片可粘贴到画布。 |

[编辑器布局](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/strategy_view.dart#L468) · [地图选择与朝向](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/map_selector.dart) · [视口与工具状态](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/interactive_map.dart) · [选择层](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/canvas_selection_layer.dart) · [全局快捷键](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/global_shortcuts.dart)

## 英雄、技能与标注

| 操作 | 核对结果 |
| --- | --- |
| 选英雄、查看技能、拖到地图 | 已调整。点英雄展开技能栏，拖英雄和技能才在地图上创建标记。拖动经过画布时预览标记。触屏和键盘可先选技能再点画布。 |
| 阵营、职责、收藏、搜索 | 已调整。工具栏有敌友切换、职责筛选、收藏按钮和英雄搜索。收藏保存在浏览器。 |
| 编辑已放置英雄 | 有差异。支持阵营、阵亡、标记类型和文字备注。原版有专门的武器、标注和视野设置菜单，本站主要通过属性面板修改。画布上备注目前以悬停提示展示。 |
| 技能方向、墙和显隐 | 已调整。可旋转方向型技能、拖动可伸缩技能的距离、右键切换支持的范围填充及轮廓。Harbor 水墙可拖端点和拐点，中点可拉出新拐点，右键可移除。Deadlock 屏障网的四条臂可以分别拖动，长度随 .ica 保存。 |
| 爆能器及职责图标 | 已调整。爆能器可点击放到视口中心或拖放；职责图标位于独立工具面板。 |
| 视野锥和自定义范围 | 已调整。视野锥会被 13 张地图的平面墙体及本页门状态截断，支持旋转和距离手柄。可拖动圆形直径、矩形四边和旋转手柄。高低差、俯视穿越关系和召唤物的专属视野仍有差异。 |
| 画笔、线、矩形、椭圆 | 已调整。四种绘图模式，箭头单独开关，可设实虚线、颜色、线宽，路径可以按四种移速显示估时。原版还有自己的颜色库与笔触交互。 |
| 橡皮擦 | 已调整。按绘图轮廓命中，拖动期间预览被擦除的线条，英雄、技能和其他标记用对象删除。命中宽度仍使用 SVG 近似。 |
| 文本 | 已调整。工具栏可拖放，点击「放置文本」或按 `T` 放到视口中心并在地图上输入，双击重新编辑。选中文本后可以拖右边调整宽度。原版的文本链接和部分键盘行为还有差异。 |
| 图片 | 已调整。支持选文件、拖入地图和粘贴，选中后拖右边等比缩放。参考链接可在属性中编辑，并从右键菜单打开。 |

[工具和英雄侧栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/sidebar.dart) · [英雄拖放](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/agent_dragable.dart) · [绘图设置](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/drawing_tools.dart) · [地图上的对象编辑](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets) · [视野计算](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/view_cone)

[Harbor 水墙手柄](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/placed_wall.dart) · [技能显隐菜单](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/ability_visibility_context_menu.dart)

[地图门交互](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/map_door_layer.dart) · [地图门定义](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/const/map_doors.dart) · [Deadlock 屏障网](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/placed_deadlock_barrier_mesh_widget.dart)

## 页面与 Lineup

| 操作 | 核对结果 |
| --- | --- |
| 展开列表、翻页、插页 | 已调整。列表默认收起，点左下角页名展开纵向列表，`A` / `D` 翻页，`C` 复制当前内容并紧接着插入。 |
| 页面重命名、排序、删除与恢复 | 已调整。插页、排序和删除会更新自动页名，保留手动页名。支持新建空白页、显式复制和撤销删除。缺少原版的列表宽高调整与云端回收站。 |
| 页间播放 | 有差异。本站自动翻页并用 CSS 插值移动标记。原版有按地图可走区域规划的英雄路径与更丰富的转场。 |
| 新建 Lineup | 已调整。分别拖进英雄和该英雄的技能，两个标记齐全后才能点「下一步」。可在填写信息前移动两端，也可取消。 |
| Lineup 详情与参考图 | 已调整。支持改名称、备注、视频链接，选择文件或粘贴参考图、移除参考图，以及独立保存位置和删除。 |
| Lineup 共用点位和批量编辑 | 已调整。详情里可用「从此起点新增」和「向此落点新增」，沿用已保存的点位并补齐另一端。缺少原版的地图右键入口、重叠标记选择和多端批量编辑。 |

[页面管理](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/pages_bar.dart) · [路径规划](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/page_transition) · [Lineup 放置与编辑](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/lineup_control_buttons.dart) · [Lineup 数据与端点操作](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/const/line_provider.dart)

## 保存、导出与发布

| 操作 | 核对结果 |
| --- | --- |
| 自动保存、手动保存和继续编辑 | 已有。静态站把草稿和图片写入 IndexedDB，库里可继续编辑，编辑器显示保存状态。原版同时有本地库与云端同步模式。 |
| .ica 导入和导出 | 已有。支持单文件导入、附带图片和 Lineup 的 .ica 导出。兼容性通过测试样例覆盖，原版应用的来回导入待实测。 |
| 截图、视频、比赛回放 | 有差异。原版有截图与视频导出，以及比赛回放入口。本站提供 .ica 导出和战术多页播放。 |
| 团队更新和分享 | 按静态部署需求实现。队友提交导出的文件给维护者，维护者放进 `strategies/`，由 GitHub Actions 发布索引与文件。云端账号、权限、在线分享链接、社区库与实时协作属于原版的独立流程。 |

[文档操作栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/editor_toolbar.dart) · [.ica 导入导出](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/strategy/strategy_import_export.dart) · [回放入口](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/replay_view.dart) · [团队战术库](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/team_strategy_library.dart)
