## ADDED Requirements
### Requirement: 复习卡片渐进式加载
系统 SHALL 在复习界面预加载前 3 张卡片，后续卡片按需加载。

#### Scenario: First card shown quickly
- **WHEN** 用户进入复习界面且存在待复习卡片
- **THEN** 系统在 200ms 内展示第一张卡片
- **AND** 预加载下一批卡片以保证连续体验

#### Scenario: Subsequent cards load on demand
- **WHEN** 用户完成当前卡片评分
- **THEN** 系统按需加载下一张卡片
- **AND** 不阻塞界面交互

### Requirement: 复习加载指示器
系统 SHALL 在复习队列初始化或卡片加载期间显示加载指示器。

#### Scenario: Review queue loading
- **WHEN** 复习队列尚未就绪
- **THEN** 复习界面显示加载指示器
- **AND** 队列就绪后切换为卡片视图
