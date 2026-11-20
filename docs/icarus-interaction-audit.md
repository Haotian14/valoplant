# Icarus Strats 功能对照总表

原版基准是 Icarus Strats **5.2.1** 的源码提交 `685586d`，以桌面版完整功能为基准并注明官方 Web Beta 的限制。本站以已部署的 `f33c6df` 为线上基准，本表同时计入当前工作区的本地改动。一行对应一项可操作或可见的用户功能，按功能核对源码和现有测试。实际交互手感、设备差异与原版应用往返导入仍需实测。 [Icarus 官网](https://icarusstrats.com/) · [固定源码版本](https://github.com/SunkenInTime/icarus/tree/685586df4a0805adf6b403cd7fe4ce771d617d5e) · [本站基准提交](https://github.com/Haotian14/valoplant/commit/f33c6df)

原版功能共 **135 项**，其中 **68 项已覆盖、49 项部分覆盖、0 项待实现、18 项范围差异**。另列 3 项本站独有入口或发布机制。

- **已覆盖**表示核心操作已存在。
- **部分覆盖**表示已有同类操作，但入口、行为、功能深度或互通验证还有差距。
- **待实现**表示当前没有对应操作，可作为静态站的独立功能补齐。
- **范围差异**涉及原版云服务、社区及桌面系统集成。云端功能不在本轮范围内。

本轮已补本地目录与备份、画布交互、高度视野、只读浏览、语言切换、导出和本地回放。主要差距仍包括原始 .vrf 解码、日语和部分快捷键提示、原版视野裁剪、逐对象转场及 Lineup 多端点操作。

## 总表

| 模块 | 功能 | 官方 Icarus 5.2.1 | Team Playbook 当前实现与差距 | 状态 |
| --- | --- | --- | --- | --- |
| 战术库 | 我的战术库、本地草稿 | 桌面版可离线创建、浏览和编辑本机战术。 | 本地战术由 IndexedDB 保存，可以重新打开编辑。 | 已覆盖 |
| 战术库 | 离线启动 | 已安装的桌面应用可离线启动，地图资源与本地库随设备保留。 | 生产构建缓存页面、地图资源和访问过的团队文件，断网重开待浏览器验证。 | 部分覆盖 |
| 战术库 | 新建和地图选择 | 从库或文件夹选择地图，建立战术。 | 首页选当前地图池或全部地图，新建时可填写名称。 | 已覆盖 |
| 战术库 | 战术改名 | 战术卡片菜单改名，编辑器也有标题入口。 | 本地战术卡片菜单和编辑器标题均可改名。 | 已覆盖 |
| 战术库 | 复制战术 | 从策略卡片复制，写入有权限的库。 | 本地策略卡片可复制，团队条目打开后成为本地副本。 | 已覆盖 |
| 战术库 | 删除战术 | 可从库里删除有权限的战术。 | 本地卡片可确认删除。团队条目的增删由仓库维护。 | 已覆盖 |
| 战术库 | 卡片与列表 | 用库中的战术、文件夹卡片导航。 | 团队与本地均有卡片和列表布局。本地文件夹可直接进入，团队目录通过下拉筛选。 | 部分覆盖 |
| 战术库 | 搜索与清除筛选 | 搜索可筛当前库的战术与文件夹条目。 | 可搜索本地和团队战术名称、路径和地图，也可搜索本地文件夹名称。 | 已覆盖 |
| 战术库 | 排序及方向 | 可按名称、创建或更新日期排序，并切换排序方向。 | 本地可按名称、创建或更新时间、地图排序，团队可按名称和地图。两库均可反向排序。 | 部分覆盖 |
| 战术库 | 文件夹层级和面包屑 | 库中可进入文件夹和子文件夹并逐级返回。 | 本地支持子文件夹和面包屑。团队库通过完整目录路径筛选。 | 部分覆盖 |
| 战术库 | 新建、编辑和删除文件夹 | 支持自定义名称、颜色、图标及删除。 | 本地可新建、改名、调整颜色图标和删除文件夹。删除后条目移到上一级。 | 已覆盖 |
| 战术库 | 拖动整理库 | 把战术及文件夹拖入目标目录。 | 可拖动本地战术和文件夹进入目标目录，也可用菜单移动战术。 | 已覆盖 |
| 战术库 | 置顶与取消置顶 | 战术和文件夹可置顶。 | 本地战术和文件夹可置顶与取消置顶。 | 已覆盖 |
| 战术库 | 编辑器快速切换战术 | 编辑时可从快速切换器打开另一份战术。 | 编辑器可直接打开另一份本地战术。 | 已覆盖 |
| 战术库 | 打开已有战术与保存状态 | 本地库打开已有战术并可继续编辑。 | 本地草稿可继续编辑，有保存中、已保存和失败反馈。 | 已覆盖 |
| 地图和视口 | 编辑器布局 | 标题、地图和文档操作、页栏与右侧工具栏组成编辑界面。 | 主要入口位置已对应。移动端工具和英雄收进面板。 | 已覆盖 |
| 地图和视口 | 画布平移 | 中键、空格拖动及触摸导航。 | 支持中键、空格、`H` 和触屏空白处拖动。 | 已覆盖 |
| 地图和视口 | 缩放与视口重置 | 围绕指针缩放，可使用触控手势。 | 有滚轮定点缩放、加减按钮、重置和双指捏合。 | 已覆盖 |
| 地图和视口 | 触控板手势 | 原版由平台事件区分平移、缩放。 | 按滚轮事件类型和增量推断。不同设备上的手感待验证。 | 部分覆盖 |
| 地图和视口 | 专用触屏只读视图 | 触摸设备打开只读战术时，用独立浏览布局和页面导航。 | 团队战术的眼睛按钮打开独立只读界面，支持触摸平移缩放、翻页、对象备注和 Lineup。 | 已覆盖 |
| 地图和视口 | 全战术和单页攻防切换 | `F` 切整套，`Shift+F` 切本页，显示混合状态。 | 按钮、快捷键及混合圆点已覆盖。 | 已覆盖 |
| 地图和视口 | 显示点位名、屏障、球和背景点 | 全局偏好控制各图层。 | 四项图层开关使用持久化偏好。 | 已覆盖 |
| 地图和视口 | 互动地图门和墙 | Ascent 开关门、Lotus 旋转门和可破坏墙、Summit 降墙可随页变化并参与视线计算。 | 三张地图的这些门可点、可撤销，随页序列化。转场时直接切换状态。 | 部分覆盖 |
| 地图和视口 | 地图主题编辑 | 编辑地图底色、细节、高亮色，管理战术主题或全局默认。 | 可编辑底色、细节、高亮，保存到战术或设为新战术默认。 | 已覆盖 |
| 地图和视口 | 源视野高度模型 | 墙体高度带、可站地面、跨层遮挡和门共同计算可见范围。 | 13 张地图的攻防两面接入原版墙体高度带和站立面。地面以 SVG 网格采样，未移植原版站位修正和接收面裁剪。 | 部分覆盖 |
| 地图和视口 | 视线高度自动或手动选择 | 根据站立面推断高度，菜单可选地面或其他可站高度。 | 自动选择采样地面或可站立表面，右键可选择当前位置的高度并写入 .ica。原版像素级站位推断还有差距。 | 部分覆盖 |
| 地图和视口 | 视线报告 | 在视野菜单生成并复制视线报告，用于复核遮挡。 | 可从右键菜单复制含坐标、朝向、眼高、最近遮挡及门状态的报告。原版截图包待补。 | 部分覆盖 |
| 画布操作 | 单选、加选与取消 | 点击选中，可按 Shift 加选，Escape 清选或退出手势。 | 支持点击、Shift 加选、Escape 取消。 | 已覆盖 |
| 画布操作 | 鼠标框选 | 以物体相交、描边和部分 Lineup 元素参与命中。 | 按对象代表点框选。长路径的局部相交与 Lineup 框选未覆盖。 | 部分覆盖 |
| 画布操作 | 拖动单个或一组对象 | 拖动对象或一组选择，可与撤销事务配合。 | 支持画布对象单项、组移动及一次撤销。Lineup 单独编辑。 | 已覆盖 |
| 画布操作 | 按住修饰键拖动复制 | 按主修饰键拖动可生成副本。 | 按住 Ctrl 或 Cmd 拖动可复制普通对象或当前选区，保留图片和选中编组的引用。 | 已覆盖 |
| 画布操作 | Alt 吸附地图边缘 | 拖动时按 Alt，对齐附近地图轮廓和交点。 | 拖动普通对象时按 Alt 可吸附到附近墙体和门线段。轮廓交点与 Lineup 吸附还有差距。 | 部分覆盖 |
| 画布操作 | 复制、剪切和粘贴对象 | 画布选择写入应用与系统剪贴板路径。 | 普通对象可跨战术或在系统剪贴板中复制、剪切和粘贴，并携带图片。Lineup 和原版应用间的剪贴板互通仍待补。 | 部分覆盖 |
| 画布操作 | 键盘全选和删除 | `Ctrl/Cmd+A`、Delete、Backspace。 | 支持默认组合，但全选不含 Lineup 和地图门。 | 部分覆盖 |
| 画布操作 | 上下文删除和分类清空 | `E` 按选中、悬停、空白区判断。也可批量清除对象。 | 支持 E 按选中、悬停或空白区工作，也可按类型清除，包括 Lineup。 | 已覆盖 |
| 画布操作 | 撤销重做 | 撤销重做记录可编辑对象及页面操作。 | 有按钮与 Ctrl/Cmd+Z 等组合，保存最多 70 步历史。 | 已覆盖 |
| 画布操作 | 右键菜单和对象属性 | 按对象类型显示相关动作，如技能范围、武器、备注及跨页复制。 | 菜单新增英雄技能、Lineup、跨页复制和视线报告。部分属性在检查器操作。 | 部分覆盖 |
| 画布操作 | 工具模式快捷键 | `Q/W/S/T` 控制绘画、擦除、导航与加文字，`G` 进入 Lineup。 | 对应组合键已接入。 | 已覆盖 |
| 画布操作 | 可重绑快捷键 | 查看、搜索、改键、冲突提示和恢复默认。 | 可搜索及修改单键动作，提示冲突并恢复默认。命令组合和部分工具提示仍用固定按键。 | 部分覆盖 |
| 页面和转场 | 收起页栏及当前页 | 默认收起，点页名展开纵向列表。 | 默认收起，点左下页名展开。 | 已覆盖 |
| 页面和转场 | 调整页栏尺寸 | 可拖动面板边缘改变展示宽高。 | 页栏可拖边缘调整宽高，也可用键盘微调。 | 已覆盖 |
| 页面和转场 | 选择页面及快捷翻页 | 点页项或用 `A/D` 切换。原版页列表提供首尾衔接。 | 点页项、`A/D` 和方向键可切换。首尾停住。 | 部分覆盖 |
| 页面和转场 | 接续当前页 | 从当前页复制内容，按 `C` 或加号接续。 | 支持相同入口及在当前页后插入。 | 已覆盖 |
| 页面和转场 | 重命名、拖拽排序与自动页名 | 页面可改名、拖拽调整顺序，自动名随页序更新。 | 已覆盖核心操作及 .ica 顺序写回。 | 已覆盖 |
| 页面和转场 | 删页与恢复 | 至少留一页。云端有最近删除列表和恢复操作。 | 有删除确认和会话内撤销。没有持久回收站。 | 部分覆盖 |
| 页面和转场 | 把对象复制到相邻页 | 对象和 Lineup 菜单可直接复制到上一页或下一页，并检查是否已有。 | 普通对象和 Lineup 可右键复制到上一页或下一页，并按 ID 去重。 | 已覆盖 |
| 页面和转场 | 页面动画与自动预览 | 转场能呈现对象变化，路径及不同对象有各自过渡。 | 可自动翻页，英雄沿平面导航路径移动，其余标记主要使用位置插值。 | 部分覆盖 |
| 页面和转场 | 英雄按可走区域寻路 | 按可走地图区域规划步行曲线，避免直线穿墙。 | 13 张地图使用原版可走区域和通道寻路，并考虑门状态。路径平滑和跨层寻路待补。 | 部分覆盖 |
| 页面和转场 | 战术内不同对象的转场 | 绘图淡入淡出，门与特定技能、标记状态同步过渡。 | 支持英雄寻路、标记平移和绘图淡入淡出。战术页的门和技能仍有逐类型过渡差距。 | 部分覆盖 |
| 英雄和技能 | 侧栏拖英雄与技能 | 英雄可拖入地图，点击或右键可打开对应技能列表，技能可拖放。 | 右侧英雄格、独立技能栏、拖放与落点预览可用。 | 已覆盖 |
| 英雄和技能 | 已放置英雄展开技能 | 在地图上的英雄入口打开其技能。 | 右键已放置英雄可直接打开对应技能栏。 | 已覆盖 |
| 英雄和技能 | 敌我阵营、职责和收藏 | 侧栏可选择阵营和职责，收藏常用英雄。也可放职责图标。 | 支持敌我、职责过滤、收藏和职责图标。有额外的英雄名称搜索。 | 已覆盖 |
| 英雄和技能 | 已上图英雄筛选 `R` | 在侧栏切换全部英雄与已上图英雄。 | 按 R 可在侧栏滤出本页已上图英雄。 | 已覆盖 |
| 英雄和技能 | 英雄标记状态 | 地图英雄可编辑阵营、阵亡等标记状态。 | 属性栏支持友方和阵亡，并改变渲染。 | 已覆盖 |
| 英雄和技能 | 英雄配备武器 | 从分类菜单选武器或清除，标记显示武器提示。 | 按武器类型给英雄配备或移除武器，地图标记同步显示。 | 已覆盖 |
| 英雄和技能 | 英雄附加视野和范围形状 | 可让英雄带视野锥或范围圈，提供附着、拆离及调整操作。 | 可换为带锥或带圆的英雄标记并拖尺寸，位置随英雄更新。无拆离或绑定现有对象操作。 | 部分覆盖 |
| 英雄和技能 | 图标和普通技能范围 | 技能有图标、圆形、扇形、矩形及贴图等专属形态。 | 目录包含 30 位英雄、122 个技能条目，渲染主要图形。专属细节未逐技能验证。 | 部分覆盖 |
| 英雄和技能 | 旋转技能及 `X/Shift+X` | 悬停快捷旋转，特定技能有方向手柄，图标与范围有独立规则。 | 方向手柄和 45° 快捷步进已覆盖。可旋转图标、个别能力方向的规则较少。 | 部分覆盖 |
| 英雄和技能 | 拖动技能作用距离 | 支持 Fault Line、Trapwire 等可伸缩技能及规范范围。 | 可拖动五个有伸缩参数的技能，测试覆盖防守侧与地图缩放换算。 | 已覆盖 |
| 英雄和技能 | 范围显隐与内外圈 | 按技能控制可见轮廓、填充、内圈和专属显示。 | 普通技能有范围填充和轮廓菜单。按类型切换项和特殊效果有差异。 | 部分覆盖 |
| 英雄和技能 | 技能停用样式 | 原版对支持的技能保留停用后的范围痕迹。 | Viper 毒云和毒墙可切换激活及停用轮廓，其余技能的专属停用效果待补。 | 部分覆盖 |
| 英雄和技能 | Harbor 水墙路径 | 拖端点、拉出和删除拐点，限制总长度并随攻防转换。 | 折线取样为平滑路径，支持端点、拐点及移除整段。随 .ica 保存。 | 已覆盖 |
| 英雄和技能 | Deadlock 屏障网 | 可旋转屏障网并独立拖动四条臂。 | 已支持四臂和整体旋转，保留原版臂序和长度范围。 | 已覆盖 |
| 英雄和技能 | 召唤物及技能专属视野 | 部分技能有独立视野锥、方向及开关，如侦察类技能。 | Killjoy 炮台、Cypher 摄像头、Raze 炸弹机器人和 Gekko 皮蛋可显示各自视野，也可选择视线高度。 | 部分覆盖 |
| 道具和标注 | 独立视野锥 | 可放 40°、90°、180° 和全圆视野，调整方向和距离。 | 支持 20°、60°、103° 和全圆，可调方向和长度，并按墙体高度带计算遮挡。 | 已覆盖 |
| 道具和标注 | 爆能器及职责标记 | 工具栏可放爆能器和各职责图标。 | 支持爆能器和四种职责图标，点击中心放置或拖放。 | 已覆盖 |
| 道具和标注 | 自定义圆与矩形 | 可放米制圆、矩形，拖动尺寸和方向。 | 有圆形直径、矩形四边与旋转，属性面板也能输入尺寸。 | 已覆盖 |
| 道具和标注 | 自定义区域 Zone | 形状工具可放专用区域样式，并由原版渲染其样式。 | 可放置虚线区域，调整尺寸、方向、颜色及透明度。 | 已覆盖 |
| 道具和标注 | 形状颜色和不透明度 | 可选预设、自定义颜色或保存的颜色，并单独调整形状不透明度。 | 圆、矩形和区域可编辑颜色及不透明度。 | 已覆盖 |
| 道具和标注 | 对象备注文字 | 添加或编辑英雄、技能、道具的 Caption。 | 可在对象属性里编辑备注并保存到战术。 | 已覆盖 |
| 道具和标注 | 画布备注徽记与阅读卡片 | 备注可作为独立可见徽记，在画布阅读或控制显隐。 | 开启备注图层后可点画布徽记阅读备注。 | 已覆盖 |
| 道具和标注 | 自由笔、直线、矩形、椭圆 | 支持四种笔型。 | 四种已支持，`Q` 回到上次用的笔型。 | 已覆盖 |
| 道具和标注 | 线宽、虚实线、箭头 | 绘图工具可改线宽、实虚线和箭头。 | 有线宽预设、虚线及箭头开关。线宽档位和笔触表现有差异。 | 部分覆盖 |
| 道具和标注 | 画笔颜色与自定义颜色库 | 颜色可跨工具复用，原版有保存和选择颜色的工作流。 | 可用预设色和取色器，可保存、复用和删除自定义颜色。 | 已覆盖 |
| 道具和标注 | 路线耗时 | 绘制路径可按跑动、静步、振奋信标或 Neon 疾跑速度估时。 | 可显示四个模式的估时。计算按绘制线段长度。 | 已覆盖 |
| 道具和标注 | 像素附近擦除笔迹 | 橡皮擦依据线形几何和笔触半径处理。 | 擦除绘图对象，有拖动预览。命中半径基于 SVG 描边。 | 部分覆盖 |
| 道具和标注 | 放置、编辑和缩放文本 | 可放置并在画布编辑文本，拖把手改宽度。 | 支持 `T`、拖放、双击原地编辑及宽度手柄。 | 已覆盖 |
| 道具和标注 | 文本标签颜色 | 可选标签颜色，也可给已放置标签换色。 | 放置文本前或在标注属性中可修改标签颜色。 | 已覆盖 |
| 道具和标注 | 富文本工具栏 | 支持加粗、斜体、标题、有序和无序列表等。 | 支持粗体、斜体、标题和有序及无序列表。复杂嵌套和 Markdown 兼容还有差距。 | 部分覆盖 |
| 道具和标注 | 文本 URL 与点击打开 | 识别文本里的链接，提供阅读和菜单打开方式。 | 识别普通 HTTP/HTTPS 和 Markdown 链接，可点击打开。 | 已覆盖 |
| 道具和标注 | 插入、拖入与粘贴图片 | 文件选择、拖放与剪贴板图片可进入战术。 | 三种入口已实现，图片存在浏览器草稿或 .ica 归档里。 | 已覆盖 |
| 道具和标注 | 图片等比缩放 | 拖图片手柄，缩放时固定可见上边或左边起点。 | 右侧有等比缩放手柄，属性中也可输入宽度。 | 已覆盖 |
| 道具和标注 | 图片参考链接 | 为图片存链接并从对象菜单打开。 | 可设置和打开 HTTP 或 HTTPS 链接，并保存在 .ica。 | 已覆盖 |
| Lineup | 新建起点与技能落点 | `G` 或工具进入，拖同一英雄和技能标定两端，完成后填详情。 | 流程已对应，拖动两端可调整，可取消。 | 已覆盖 |
| Lineup | 同起点或同落点建立多条 | 一处端点可连接多条 Lineup，允许固定端点添加。 | 可复用已有起点或落点，保存后保留关联。 | 已覆盖 |
| Lineup | Lineup 元数据与参考图 | 名称、备注、视频地址，参考图支持选文件、粘贴、移除与浏览。 | 支持字段、上传、粘贴、移除和打开参考图。没有原版轮播。 | 部分覆盖 |
| Lineup | 落点或起点查看关联列表 | 从地图端点打开该端点的全部关联。重叠技能图标可选。 | 点击端点可查看关联 Lineup。重叠但独立的端点选择还有差距。 | 部分覆盖 |
| Lineup | 从地图标记右键添加或编辑 | 从常规地图标记与 Lineup 端点菜单进入相关操作。 | 可从已有英雄或技能创建 Lineup，并由端点列表进入修改。 | 已覆盖 |
| Lineup | 调整已有 Lineup 位置 | 支持编辑模式、分组和多端点选中一起平移。 | 可手工移动一条 Lineup 的两端并独立保存。共用端点关联保留。 | 部分覆盖 |
| Lineup | 删除与保留共用端点 | 删一条、删选择，清除孤立端点并保留共用端点。 | 详情单条删除及全页清空可用。没有画布批量 Lineup 选择。 | 部分覆盖 |
| Lineup | 复制 Lineup 到相邻页 | 从端点菜单将关联 Lineup 复制到邻页。 | 可复制单条 Lineup 或整个共用端点组到相邻页，并保留共享端点及参考图。 | 已覆盖 |
| Lineup | Lineup 分享分工及冲突提醒 | 云端模式下提示正在编辑的其他成员与冲突。 | 本地单人编辑。 | 范围差异 |
| 设置和平台 | 本战术英雄、技能标记尺寸 | 原版可分别调整，并提供跨页统一的提示。 | 可调整英雄、技能标记尺寸，应用到本页或所有页。 | 已覆盖 |
| 设置和平台 | 中性色和图标强调配置 | 可设当前战术和新战术默认的阵营颜色及样式。 | 可调中立标记颜色并应用单页或全套，原版独立图标强调样式待补。 | 部分覆盖 |
| 设置和平台 | 新战术模板偏好 | 可设置新战术默认标记尺寸、颜色和主题。 | 可保存新战术的英雄和技能尺寸、中性色及默认地图主题。 | 已覆盖 |
| 设置和平台 | 地图主题配置档案 | 可保存、重命名、编辑、设默认、删除及导入导出主题代码。 | 可管理、导入和导出本地 JSON 主题档案。原版主题分享格式待互通验证。 | 部分覆盖 |
| 设置和平台 | 语言和跟随系统 | 支持选语言或跟随系统，覆盖界面与游戏名称。 | 可在库或设置切换简体中文、英语和跟随系统，并保存在本机。日语、部分提示及游戏资源文字待补。 | 部分覆盖 |
| 设置和平台 | 全局视野外观设置 | 可调视野透明度等全局显示偏好。 | 可全局调节视野填充不透明度。 | 已覆盖 |
| 设置和平台 | 手动保存及自动保存开关 | 可手动保存，工作区偏好可启关自动保存。 | 本机可开关自动保存、手动保存或在离开前确认。 | 已覆盖 |
| 设置和平台 | Discord Rich Presence | 可在桌面偏好里决定是否展示使用状态。 | 静态站无桌面进程或 Discord 状态集成。 | 范围差异 |
| 设置和平台 | 分析开关与隐私设置 | 提供分析偏好。 | 未接入原版分析服务，也无对应设置项。 | 范围差异 |
| 设置和平台 | 版本、发行说明与更新 | 查看版本和历次更新说明，桌面按安装渠道提示或执行更新。 | GitHub Pages 更新站点。无应用内版本、变更说明或桌面更新器。 | 范围差异 |
| 设置和平台 | 应用内诊断 | 快捷键打开应用调试日志。 | 设置中可复制版本及离线状态。视线报告位于对象右键菜单。完整原版日志待补。 | 部分覆盖 |
| 文件和导出 | 单份 .ica 导入 | 桌面选择一份战术文件，可恢复页面、对象和媒体。 | 可在浏览器文件选择器导入。自动测试覆盖样例，整套历史版本待对照。 | 部分覆盖 |
| 文件和导出 | 单份 .ica 导出 | 可从文档工具栏及库条目导出，包含对象、页面与参考图。 | 两个入口均可导出并在本站回读。原版往返尚未实测。 | 部分覆盖 |
| 文件和导出 | 兼容历史战术数据 | 原版迁移旧档、不同坐标及对象版本。 | 支持裸 JSON、旧单页结构、两类旧 Lineup 记录及部分旧坐标。没有上游完整迁移链。 | 部分覆盖 |
| 文件和导出 | 从桌面拖入或打开战术文件 | 桌面可拖放文件，支持打开路径进入导入流程。 | 首页支持拖入或选中多份 .ica 或 ZIP。系统文件关联需要桌面端。 | 部分覆盖 |
| 文件和导出 | 整个文件夹 ZIP 导出 | 导出包含子目录与战术文件的 ZIP。 | 可导出含子目录的整个文件夹 ZIP。 | 已覆盖 |
| 文件和导出 | 全库备份与恢复 | 导出或恢复保留目录结构的备份 ZIP，可批量纳入战术。 | 可备份和恢复全库 ZIP，保留目录及本站元数据。原版整库往返待验证。 | 部分覆盖 |
| 文件和导出 | 单页和多页 PNG | 可在导出窗口选择一页或多页，生成 PNG 并显示进度。 | 可选一页做 PNG 或多页打包 ZIP，并显示进度。 | 已覆盖 |
| 文件和导出 | 截图透明背景和备注 | 选择透明底及是否包含画布备注。 | PNG 可选透明背景及是否包含对象备注。 | 已覆盖 |
| 文件和导出 | 战术 MP4 动画 | 选页、每步时长、质量档位和进度，可生成动画视频。 | 可选页、画质和时长，支持 MP4 编码时输出 MP4，否则输出 WebM。页面用淡入过渡。 | 部分覆盖 |
| 文件和导出 | 透明 MOV 与视频备注 | 支持透明背景 MOV，并可选择是否包含备注。 | 透明 MOV 可带备注并逐页停留。播放器实测及原版连续转场待补。 | 部分覆盖 |
| 比赛回放 | 回放库与磁盘扫描 | 桌面读取游戏回放、导入并展示可用性及比赛信息。 | 浏览器可管理本地导入的 .icrp，未接入游戏目录自动扫描。 | 部分覆盖 |
| 比赛回放 | 新增、保留与删除回放 | 从本机添加或保留一份回放，对回放文件执行管理。 | 可导入、保留和删除已解码 .icrp。 | 部分覆盖 |
| 比赛回放 | 原生解码与版本检查 | 解码支持的 VALORANT 回放并处理版本及地图可用性。 | 可验证 .icrp 格式、记录边界和地图。原始 .vrf 的解码待实现。 | 部分覆盖 |
| 比赛回放 | 局内时间轴和倍速 | 可按回合选择、定位时间点、播放暂停、切换倍速。 | .icrp 支持按回合和事件跳转、进度条、播放暂停和倍速。 | 已覆盖 |
| 比赛回放 | 阵容、比分、事件、道具和视野 | 播放选手移动、技能和门状态，显示并筛选击杀、爆能器和技能等事件。 | 显示阵容、比分、移动、死亡、地图门、技能道具和爆能器状态。视野为平面模型，原版逐技能动画与烟雾遮挡仍有差距。 | 部分覆盖 |
| 比赛回放 | 回放上绘图 | 可对比赛回放画面进行绘图复盘。 | 可在回放画布用画笔标注并清除标注。 | 已覆盖 |
| 比赛回放 | 截取瞬间到战术 | 从回放选取画面状态，保存为战术或追加页面。 | 当前英雄、技能道具、爆能器、地图门和绘图可保存为新战术或追加到同地图本地战术。 | 已覆盖 |
| 账号与协作 | 注册、登录和重置密码 | 邮箱账号可注册、验证、密码重置，也支持 Discord 登录。 | 使用本地草稿和公开的仓库战术索引。 | 范围差异 |
| 账号与协作 | 本地战术或目录转云端 | 登录后可将本机战术或文件夹移动到云端工作区。 | 由维护者收取 .ica 并提交仓库。 | 范围差异 |
| 账号与协作 | 同账号跨设备同步 | 云端库在桌面与 Web 访问，编辑和图片可同步。 | 浏览器草稿随当前配置文件保存。跨设备通过 .ica 传递。 | 范围差异 |
| 账号与协作 | 共享链接和分享码 | 生成可编辑或仅查看的链接和代码，可复制、撤销与加入库。 | 分享以 .ica 文件交付。团队库页面可打开公开内容，单份没有原版分享码。 | 范围差异 |
| 账号与协作 | Shared 库、退出共享和访问变化 | 按链接或代码加入共享内容，支持离开和处理访问变化。 | 团队库由 GitHub 文件索引提供，无成员关系。 | 范围差异 |
| 账号与协作 | 访问权限和人员管理 | 管理查看、编辑、成员移除与文件夹继承权限。 | 发布库是公开静态内容。写入通过 GitHub 仓库权限管理。 | 范围差异 |
| 账号与协作 | 只读打开与保存副本 | 共享查看方可只读翻页，并按权限添加到自己的库。 | 团队卡片有只读预览和编辑副本入口，仓库发布内容公开访问。原版云端的查看权限不在本轮。 | 部分覆盖 |
| 账号与协作 | 多人实时编辑和在线状态 | 同时编辑战术，能查看其他成员及所在页面等协作状态。 | 本地副本独立编辑，团队版本靠替换仓库文件更新。 | 范围差异 |
| 账号与协作 | 同步队列、冲突和重试 | 原版云端编辑和媒体上传有离线待发、同步异常与恢复机制。 | 本地保存有失败提示。团队索引可重试加载。 | 范围差异 |
| 账号与协作 | 官方 Web Beta | 需要登录，使用云端库。本版本把战术文件导入导出及 .ica 拖放、原生回放限定在桌面。 | 本站静态发布，浏览器内提供本地库和 .ica 文件交换。 | 范围差异 |
| 社区 | 浏览社区和筛选 | 浏览、搜索，按地图、英雄、攻防、收藏等过滤，支持热门、最新和排行。 | 只有仓库发布的队内战术索引。 | 范围差异 |
| 社区 | 公开战术详情和外链 | 可预览公开战术、切换页面、打开全屏和复制分享链接。 | 仓库发布的团队战术可只读预览。官方社区帖子、社区 URL 和权限不在本轮。 | 范围差异 |
| 社区 | 收藏、另存一份与来源关系 | 可对帖子加星，保存为自己的副本并保留来源。 | 复制本地战术与团队副本可用，没有社区收藏和来源关联。 | 范围差异 |
| 社区 | 发布、更新和下架帖子 | 以当前战术生成公开版本，维护者可以更新或移除。 | 通过 GitHub 提交替换或移除团队文件。无社区发布界面。 | 范围差异 |
| 社区 | 举报、审核和作者限制 | 可举报内容，审核端能保留、恢复、移除及限制作者发布。 | 无社区账号、举报和审核流程。 | 范围差异 |
| 本站发布流程 | 仓库目录自动发布 | 官方通过文件或云端库分享战术。 | GitHub Actions 将 `strategies/` 中的 .ica 生成为索引和静态文件，可刷新团队库。 | 本站新增 |
| 本站发布流程 | 按修订打开团队战术 | 官方共享内容有云端版本和独立保存副本。 | 仓库文件按路径和内容哈希发布，有本地改动的副本继续留在本地库。 | 本站新增 |
| 本站发布流程 | 独立新建空白页 | 原版加号和 C 接续当前页内容。 | 额外提供单独的空白页和显式复制当前页入口。 | 本站新增 |

## 对照源码

- **战术库** [库入口](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/library_title_strip.dart) · [库导航](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/folder_navigator.dart) · [条目浏览](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/folder_content.dart) · [文件夹操作](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/folder_card.dart) · [战术卡片](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strategy_tile/strategy_tile.dart) · [快速切换](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strategy_quick_switcher.dart)。本站 [App.tsx](../src/App.tsx) · [storage.ts](../src/storage.ts)。
- **地图和视口** [编辑器布局](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/strategy_view.dart) · [画布视口](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/interactive_map.dart) · [触屏只读](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/touch_strategy_viewer.dart) · [攻防切换](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/map_selector.dart) · [地图门](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/map_door_layer.dart) · [视野模型](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/vision-model.md) · [高度选择](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/utilities/view_cone_elevation_menu.dart) · [视线报告](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/utilities/sightline_report_menu.dart)。本站 [Board.tsx](../src/Board.tsx) · [BoardArt.tsx](../src/BoardArt.tsx) · [map-doors.ts](../src/map-doors.ts) · [map-vision.ts](../src/map-vision.ts)。
- **画布操作** [选择和吸附](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/canvas_selection_layer.dart) · [粘贴](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/canvas_paste.dart) · [批量删除](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/delete_options.dart) · [快捷键行为](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/global_shortcuts.dart) · [默认快捷键](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/const/shortcut_info.dart)。本站 [Board.tsx](../src/Board.tsx) · [Editor.tsx](../src/Editor.tsx)。
- **页面和转场** [页面栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/pages_bar.dart) · [页面数据](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/providers/strategy_provider.dart) · [对象跨页复制](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/adjacent_page_copy_menu.dart) · [页面转场](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/page_transition_overlay.dart) · [英雄寻路](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/page_transition/transition_planner.dart)。本站 [Editor.tsx](../src/Editor.tsx) · [strategy.ts](../src/strategy.ts) · [BoardArt.tsx](../src/BoardArt.tsx)。
- **英雄和技能** [英雄侧栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/sidebar.dart) · [英雄筛选](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/agent_filter.dart) · [武器菜单](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/agents/agent_weapon_menu.dart) · [技能显隐](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/ability_visibility_context_menu.dart) · [Harbor 水墙](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/placed_wall.dart) · [Deadlock 屏障网](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/placed_deadlock_barrier_mesh_widget.dart) · [技能专属视野](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/ability_vision_cone_composite.dart)。本站 [Editor.tsx](../src/Editor.tsx) · [catalog.json](../src/catalog.json) · [BoardArt.tsx](../src/BoardArt.tsx) · [object-handles.ts](../src/object-handles.ts)。
- **道具和标注** [工具栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/tool_grid.dart) · [独立视野锥](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/vision_cone_tools.dart) · [自定义形状](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/custom_shape_tools.dart) · [绘图设置](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/sidebar_widgets/drawing_tools.dart) · [备注徽记](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/caption_markers.dart) · [富文本](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/text/text_format_bar.dart) · [图片工具](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/image/placed_image_builder.dart)。本站 [Editor.tsx](../src/Editor.tsx) · [BoardArt.tsx](../src/BoardArt.tsx) · [placement.ts](../src/placement.ts)。
- **Lineup** [端点关系](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/const/line_provider.dart) · [放置与编辑](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/lineup_control_buttons.dart) · [Lineup 详情](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/create_lineup_dialog.dart) · [端点列表](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/lineup_panel_dialog.dart) · [重叠技能](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/draggable_widgets/ability/lineup_ability_stack_selector.dart) · [协作提醒](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/lineup_editors_notice.dart)。本站 [Editor.tsx](../src/Editor.tsx) · [BoardArt.tsx](../src/BoardArt.tsx) · [strategy.ts](../src/strategy.ts)。
- **设置和平台** [编辑器偏好](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/settings_tab.dart) · [地图主题档案](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/map_theme_settings_section.dart) · [更新与发行说明](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strip_status_icons.dart) · [平台功能](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/config/platform_policy.dart) · [分析与隐私](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/analytics.md)。本站 [Editor.tsx](../src/Editor.tsx) · [BoardArt.tsx](../src/BoardArt.tsx) · [styles.css](../src/styles.css)。
- **文件和导出** [文档工具栏](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/editor_toolbar.dart) · [导入和备份](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/strategy/strategy_import_export.dart) · [桌面文件拖放](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/ica_drop_target.dart) · [截图导出](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/screenshot_dialog.dart) · [视频导出](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/export_video_dialog.dart) · [透明视频](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/adr/0007-transparent-video-format.md)。本站 [App.tsx](../src/App.tsx) · [Editor.tsx](../src/Editor.tsx) · [archive.ts](../src/archive.ts) · [archive.test.ts](../tests/archive.test.ts)。
- **比赛回放** [回放画布](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/replay_view.dart) · [回放库](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/replay/replay_library_content.dart) · [回合时间轴](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/replay/replay_dock.dart) · [回放事件](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/replay/replay_events.dart) · [回放绘图](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/replay/replay_drawing_layer.dart) · [抓取到战术](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/replay/replay_capture.dart) · [回放解码](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/replay-format.md)。本站 [App.tsx](../src/App.tsx) · [Editor.tsx](../src/Editor.tsx)。
- **账号与协作** [账号入口](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/auth/auth_dialog.dart) · [链接与权限](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/dialogs/share_links_dialog.dart) · [成员在线状态](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/strategy_presence.dart) · [同步提示](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/cloud_sync_button.dart) · [访问能力](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/collab/strategy_capabilities.dart) · [认证流程](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/auth_flow_reference.md) · [多人协作](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/docs/collaborative-editing.md)。本站 [App.tsx](../src/App.tsx) · [storage.ts](../src/storage.ts) · [strategy-index.mjs](../scripts/strategy-index.mjs)。
- **社区** [社区列表](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/community/community_tab.dart) · [筛选](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/community/community_search_bar.dart) · [公开详情](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/community/community_post_view.dart) · [发布管理](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/community/community_post_button.dart) · [内容审核](https://github.com/SunkenInTime/icarus/blob/685586df4a0805adf6b403cd7fe4ce771d617d5e/lib/widgets/community/community_review.dart)。本站 [App.tsx](../src/App.tsx)。
- **本站发布流程** [App.tsx](../src/App.tsx) · [strategy-index.mjs](../scripts/strategy-index.mjs) · [publish-strategies.mjs](../scripts/publish-strategies.mjs) · [pages.yml](../.github/workflows/pages.yml)。
