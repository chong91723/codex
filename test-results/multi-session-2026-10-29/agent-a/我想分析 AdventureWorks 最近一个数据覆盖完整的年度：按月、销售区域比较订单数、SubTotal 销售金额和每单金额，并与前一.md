# 我想分析 AdventureWorks 最近一个数据覆盖完整的年度：按月、销售区域比较订单数、SubTotal 销售金额和每单金额，并与前一年可比月份比较；选出销售变化最明显的三个区域，区分订单量与每单金额的贡献。最后提供月度趋势图、可下载明细和网页报告。先复用已探索的结构与已采用业务补充，若年度、订单状态或金额口径不明确，请先澄清并给我可修改的方案，确认后再执行正式分析。

# AdventureWorks 年度销售区域对比：2003 vs 2002

金额均为 `SubTotal`，使用数据库原单位，保留两位小数。比较范围为 2002-01-01（含）至 2004-01-01（不含），两年均覆盖完整自然月。

## 核心结论

- 2003 年订单数为 **12510**，2002 年为 **3720**。2003 年 SubTotal 为 **49578680.86**，较 2002 年的 **36812964.63** 增加 **+12765716.23**，同比增长 **+34.68%**。
- 公司每单金额从 **9895.96** 降至 **3963.12**。12 个月中，订单数和 SubTotal 均有 **12/12** 个月增长，但每单金额只有 **1/12** 个月增长。
- 月度 SubTotal 绝对变化最大的是 **11 月**，增加 **+2482547.26**。
- 按 SubTotal 同比差额绝对值排序，前三区域为 **France、United Kingdom、Germany**。三者差额分别为 **+2363319.84**、**+2357439.52**、**+2072805.32**，正负号保留。
- 全区域中共有 **1** 个区域出现负变化；**Southeast** 的变化为 **-432948.78**，对应 **-12.84%**，仍保留在全区域比较中。

## 总体月度趋势

- 两张月度图分别展示 SubTotal、订单数的 2002/2003 年逐月走势；每单金额单独成图，避免与金额和订单数混用缩略比例。
- SubTotal 在全部 12 个月均增长，增量最大的是 11 月；这个判断来自月度绝对变化字段，而非累计年度差额。

## 区域年度比较

| 排名 | 区域 | SubTotal 同比差额 | 同比变化率 |
|---:|---|---:|---:|
| 1 | France | +2363319.84 | +148.3% |
| 2 | United Kingdom | +2357439.52 | +142.55% |
| 3 | Germany | +2072805.32 | +396.02% |
| 4 | Australia | +2044279.28 | +94.89% |
| 5 | Northwest | +1699304.22 | +32.73% |
| 6 | Southwest | +1471785.41 | +16.01% |
| 7 | Canada | +732925.81 | +11.03% |
| 8 | Southeast | -432948.78 | -12.84% |
| 9 | Central | +290135.76 | +8.79% |
| 10 | Northeast | +166669.84 | +5.24% |

完整区域订单数、SubTotal、每单金额及同比字段可通过下表对应的下载卡获取。区域图分别按订单数、SubTotal 和每单金额展示全部 10 个区域的两年对比。

## 前三区域明细

| 排名 | 区域 | 订单数 2002→2003 | 订单变化率 | SubTotal 2002→2003 | SubTotal 差额 | SubTotal 变化率 | 每单金额 2002→2003 | 每单金额变化率 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | France | 272→1127 | +314.34% | 1593617.93→3956937.78 | +2363319.84 | +148.3% | 5858.89→3511.04 | -40.07% |
| 2 | United Kingdom | 304→1360 | +347.37% | 1653761.75→4011201.27 | +2357439.52 | +142.55% | 5440.01→2949.41 | -45.78% |
| 3 | Germany | 234→1075 | +359.40% | 523412.41→2596217.73 | +2072805.32 | +396.02% | 2236.81→2415.09 | +7.97% |

France 与 United Kingdom 的订单量增长幅度很大，但每单金额分别下降 **-40.07%** 和 **-45.78%**；Germany 的每单金额则增长 **+7.97%**。

## 订单量与每单金额贡献

| 区域 | 订单量贡献 | 每单金额贡献 | 交互项 | 整分调整 | 三项合计/实际差额 |
|---|---:|---:|---:|---:|---:|
| France | +5009350.48 | -638616.09 | -2007414.55 | -0.01 | +2363319.84 |
| United Kingdom | +5744646.09 | -757140.29 | -2630066.28 | 0.0 | +2357439.52 |
| Germany | +1881153.16 | 41717.77 | 149934.39 | 0.01 | +2072805.32 |

France 和 United Kingdom 的净增长主要由订单量贡献，每单金额贡献与交互项为负；Germany 的三项贡献均为正。贡献公式使用未舍入值计算，两项区域产生 0.01 的整分尾差，分别归入其绝对值最大的订单量贡献项，因此表内三项与整分调整相加后精确等于实际差额。

## 可下载明细

- **总体月度趋势与同比**：12 行，覆盖 12 个月的订单数、SubTotal、每单金额及同比。
- **区域—月份明细**：120 行，覆盖 10 个区域 × 12 个月，包含两年指标、绝对变化和同比。
- **10 区域年度对比**：10 行，包含两年指标、排名及贡献归因字段。
- **前三区域贡献拆解**：3 行，包含带符号差额、原始贡献、整分调整和回加结果。

## 校验与限制

- 月份范围为 1–12 月；区域数为 10，区域月度行数为 120，每个区域均包含 12–12 月。
- 月度、区域年度与订单头年度总额的订单数和 SubTotal 在未舍入数据上核对一致；逐行两位小数独立汇总可能出现最多 0.02 原单位的显示尾差，年度总额由未舍入汇总后再取两位小数。
- 年度前十区域贡献按两位小数展示后的最大回加残差为 **0.0**。
- 中间执行曾出现查询语法及结果访问错误，均已修正并重新计算；最终交付均来自成功执行结果，没有缺失数据。
- 本节结论为观察和指标拆解，不对订单量或每单金额变化作因果解释。

## 口径与依赖版本

- 数据源：**AdventureWorks 双会话体验（独立只读）**
- `sourceId`：`9f0e887b483dd2f73f189590`
- `sourceVersion`：`1`
- 结构快照：`ae97724f50d97edc95105c79c3ebb048`
- `schemaHash`：`7c401791866a9f444fee2befd5902715229b130f19848d57ab71cb4e956f3952`
- 已采用业务补充：`businessRevision=2`
- 知识版本：`knowledgeRevision=3`
- 未决冲突：`0`
- 时间口径：按订单头 `OrderDate` 判定年月，范围 `[2002-01-01, 2004-01-01)`。
- 金额口径：使用 `salesorderheader.SubTotal` 的税前金额和数据库原单位；未使用或合并 `TotalDue`，未换算币种。
- 订单状态：范围内只有状态值 **5**，共 **16230** 个订单，因此没有增加状态业务筛选。
- 区域口径：使用 `salesterritory.Name` 的 10 个具体 Territory；范围内未关联 Territory 的订单数为 0。
- 订单数：`COUNT(DISTINCT SalesOrderID)`；每单金额：`SUM(SubTotal) / COUNT(DISTINCT SalesOrderID)`。
- 排名规则：按 `ABS(2003 SubTotal - 2002 SubTotal)` 降序；并列时正差额优先，再按 2003 SubTotal 降序、TerritoryID 升序。
- 执行方式：实际创建并并行运行两个 Codex 原生子代理，分别完成总体月度同比和区域贡献拆解；两者完成后核对来源、结构和业务补充版本一致，再由主 Agent 汇总、绘图和发布。两个子代理均已关闭。
- 执行日期：2026-10-29。

---

> 已跟踪的业务知识、指标与文件依赖仍有效；数据时效以发布时的检查为准。

## 数据依据范围

来源已关联：仅下列字段与执行记录匹配。查询或计算已记录；正文其他断言、解释和因果关系未作语义认证。

- s\_orders03：12510；来源 本地快照 SQL 计算；字段 orders\_2003；未应用已确认口径
- s\_orders02：3720；来源 本地快照 SQL 计算；字段 orders\_2002；未应用已确认口径
- s\_sub03：49578680.86；来源 本地快照 SQL 计算；字段 subtotal\_2003；未应用已确认口径
- s\_sub02：36812964.63；来源 本地快照 SQL 计算；字段 subtotal\_2002；未应用已确认口径
- s\_subdiff：12765716.23；来源 本地快照 SQL 计算；字段 subtotal\_difference；未应用已确认口径
- s\_subpct：34.68；来源 本地快照 SQL 计算；字段 subtotal\_change\_pct；未应用已确认口径
- s\_aov02：9895.96；来源 本地快照 SQL 计算；字段 average\_order\_2002；未应用已确认口径
- s\_aov03：3963.12；来源 本地快照 SQL 计算；字段 average\_order\_2003；未应用已确认口径
- s\_month\_orders：12；来源 本地快照 SQL 计算；字段 months\_order\_growth；未应用已确认口径
- dl\_monthly\_rows：12；来源 本地快照 SQL 计算；字段 @rowCount；未应用已确认口径
- s\_month\_aov：1；来源 本地快照 SQL 计算；字段 months\_average\_order\_growth；未应用已确认口径
- s\_max\_month：11；来源 本地快照 SQL 计算；字段 max\_subtotal\_change\_month；未应用已确认口径
- s\_max\_change：2482547.26；来源 本地快照 SQL 计算；字段 max\_subtotal\_abs\_change；未应用已确认口径
- t1\_delta：2363319.84；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t2\_delta：2357439.52；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t3\_delta：2072805.32；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- negative\_region\_count：1；来源 本地快照 SQL 计算；字段 negative\_change\_regions；未应用已确认口径
- t8\_delta：-432948.78；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t8\_pct：-12.84；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t1\_rank：1；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t1\_name："France"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t1\_pct：148.3；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t2\_rank：2；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t2\_name："United Kingdom"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t2\_pct：142.55；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t3\_rank：3；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t3\_name："Germany"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t3\_pct：396.02；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t4\_rank：4；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t4\_name："Australia"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t4\_delta：2044279.28；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t4\_pct：94.89；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t5\_rank：5；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t5\_name："Northwest"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t5\_delta：1699304.22；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t5\_pct：32.73；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t6\_rank：6；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t6\_name："Southwest"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t6\_delta：1471785.41；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t6\_pct：16.01；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t7\_rank：7；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t7\_name："Canada"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t7\_delta：732925.81；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t7\_pct：11.03；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t8\_rank：8；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t8\_name："Southeast"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t9\_rank：9；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t9\_name："Central"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t9\_delta：290135.76；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t9\_pct：8.79；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- t10\_rank：10；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- t10\_name："Northeast"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- t10\_delta：166669.84；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- t10\_pct：5.24；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- r1\_rank：1；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- r1\_name："France"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- r1\_orders02：272；来源 本地快照 SQL 计算；字段 Orders2002；未应用已确认口径
- r1\_orders03：1127；来源 本地快照 SQL 计算；字段 Orders2003；未应用已确认口径
- r1\_orderpct："314.34"；来源 本地快照 SQL 计算；字段 OrderCountChangePct；未应用已确认口径
- r1\_sub02：1593617.93；来源 本地快照 SQL 计算；字段 SubTotal2002；未应用已确认口径
- r1\_sub03：3956937.78；来源 本地快照 SQL 计算；字段 SubTotal2003；未应用已确认口径
- r1\_subdelta：2363319.84；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- r1\_subpct：148.3；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- r1\_aov02：5858.89；来源 本地快照 SQL 计算；字段 AverageOrder2002；未应用已确认口径
- r1\_aov03：3511.04；来源 本地快照 SQL 计算；字段 AverageOrder2003；未应用已确认口径
- r1\_aovpct：-40.07；来源 本地快照 SQL 计算；字段 AverageOrderChangePct；未应用已确认口径
- r2\_rank：2；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- r2\_name："United Kingdom"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- r2\_orders02：304；来源 本地快照 SQL 计算；字段 Orders2002；未应用已确认口径
- r2\_orders03：1360；来源 本地快照 SQL 计算；字段 Orders2003；未应用已确认口径
- r2\_orderpct："347.37"；来源 本地快照 SQL 计算；字段 OrderCountChangePct；未应用已确认口径
- r2\_sub02：1653761.75；来源 本地快照 SQL 计算；字段 SubTotal2002；未应用已确认口径
- r2\_sub03：4011201.27；来源 本地快照 SQL 计算；字段 SubTotal2003；未应用已确认口径
- r2\_subdelta：2357439.52；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- r2\_subpct：142.55；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- r2\_aov02：5440.01；来源 本地快照 SQL 计算；字段 AverageOrder2002；未应用已确认口径
- r2\_aov03：2949.41；来源 本地快照 SQL 计算；字段 AverageOrder2003；未应用已确认口径
- r2\_aovpct：-45.78；来源 本地快照 SQL 计算；字段 AverageOrderChangePct；未应用已确认口径
- r3\_rank：3；来源 本地快照 SQL 计算；字段 AbsChangeRank；未应用已确认口径
- r3\_name："Germany"；来源 本地快照 SQL 计算；字段 Name；未应用已确认口径
- r3\_orders02：234；来源 本地快照 SQL 计算；字段 Orders2002；未应用已确认口径
- r3\_orders03：1075；来源 本地快照 SQL 计算；字段 Orders2003；未应用已确认口径
- r3\_orderpct："359.40"；来源 本地快照 SQL 计算；字段 OrderCountChangePct；未应用已确认口径
- r3\_sub02：523412.41；来源 本地快照 SQL 计算；字段 SubTotal2002；未应用已确认口径
- r3\_sub03：2596217.73；来源 本地快照 SQL 计算；字段 SubTotal2003；未应用已确认口径
- r3\_subdelta：2072805.32；来源 本地快照 SQL 计算；字段 SubTotalDifference；未应用已确认口径
- r3\_subpct：396.02；来源 本地快照 SQL 计算；字段 SubTotalChangePct；未应用已确认口径
- r3\_aov02：2236.81；来源 本地快照 SQL 计算；字段 AverageOrder2002；未应用已确认口径
- r3\_aov03：2415.09；来源 本地快照 SQL 计算；字段 AverageOrder2003；未应用已确认口径
- r3\_aovpct：7.97；来源 本地快照 SQL 计算；字段 AverageOrderChangePct；未应用已确认口径
- c1\_vol：5009350.48；来源 本地快照 SQL 计算；字段 OrderVolumeContribution；未应用已确认口径
- c1\_aov：-638616.09；来源 本地快照 SQL 计算；字段 AverageOrderContribution；未应用已确认口径
- c1\_int：-2007414.55；来源 本地快照 SQL 计算；字段 InteractionContribution；未应用已确认口径
- c1\_round：-0.01；来源 本地快照 SQL 计算；字段 RoundingAdjustment；未应用已确认口径
- c1\_net：2363319.84；来源 本地快照 SQL 计算；字段 DisplayedContributionSum；未应用已确认口径
- c2\_vol：5744646.09；来源 本地快照 SQL 计算；字段 OrderVolumeContribution；未应用已确认口径
- c2\_aov：-757140.29；来源 本地快照 SQL 计算；字段 AverageOrderContribution；未应用已确认口径
- c2\_int：-2630066.28；来源 本地快照 SQL 计算；字段 InteractionContribution；未应用已确认口径
- c2\_round：0；来源 本地快照 SQL 计算；字段 RoundingAdjustment；未应用已确认口径
- c2\_net：2357439.52；来源 本地快照 SQL 计算；字段 DisplayedContributionSum；未应用已确认口径
- c3\_vol：1881153.16；来源 本地快照 SQL 计算；字段 OrderVolumeContribution；未应用已确认口径
- c3\_aov：41717.77；来源 本地快照 SQL 计算；字段 AverageOrderContribution；未应用已确认口径
- c3\_int：149934.39；来源 本地快照 SQL 计算；字段 InteractionContribution；未应用已确认口径
- c3\_round：0.01；来源 本地快照 SQL 计算；字段 RoundingAdjustment；未应用已确认口径
- c3\_net：2072805.32；来源 本地快照 SQL 计算；字段 DisplayedContributionSum；未应用已确认口径
- dl\_region\_month\_rows：120；来源 本地快照 SQL 计算；字段 @rowCount；未应用已确认口径
- all\_regions：10；来源 本地快照 SQL 计算；字段 region\_count；未应用已确认口径
- dl\_region\_year\_rows：10；来源 本地快照 SQL 计算；字段 @rowCount；未应用已确认口径
- dl\_top3\_rows：3；来源 本地快照 SQL 计算；字段 @rowCount；未应用已确认口径
- coverage\_min\_month：1；来源 本地快照 SQL 计算；字段 min\_month；未应用已确认口径
- coverage\_max\_month：12；来源 本地快照 SQL 计算；字段 max\_month；未应用已确认口径
- monthly\_region\_row\_count：120；来源 本地快照 SQL 计算；字段 @rowCount；未应用已确认口径
- months\_per\_region\_min：12；来源 本地快照 SQL 计算；字段 min\_months\_per\_territory；未应用已确认口径
- months\_per\_region\_max：12；来源 本地快照 SQL 计算；字段 max\_months\_per\_territory；未应用已确认口径
- max\_display\_residual：0；来源 本地快照 SQL 计算；字段 max\_display\_residual；未应用已确认口径
- status\_value：5；来源 AdventureWorks 双会话体验（独立只读）；字段 Status；未应用已确认口径
- status\_orders：16230；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径

时效、知识与口径检查以发布时的记录为准，不代表下载或阅读时仍有效。

分析记录：01a186f9-639f-7240-b83d-cfed34b4da8f

## 相关数据

- 查询结果 · c3fbdd8a0378c9d30fd164acded79ba1 · 38 行
- 查询结果 · 9dc7f641bbaa3274778631d2ee15fd8f · 1 行
- 查询结果 · b6fd2e5ab744dc3731a20f471c6fcf43 · 10 行
- 查询结果 · cc3d63b047c84ac74e015ebdbbd5c7b2 · 12 行
- 查询结果 · 76c4e703235b4ff5c66fd68b7d803a47 · 2 行
- 查询结果 · 55af9ce60e4799d09a6617fc9549b0eb · 2 行
- 查询结果 · 2e625a812a1a05d6248da2a0ee6ea9ae · 3 行
- 查询结果 · 31d26e7367fa8fdbb520ee573d6e59ec · 10 行
- 查询结果 · 23f4798b256d6189f122a741c04bed15 · 10 行
- 查询结果 · 87a336efb57976727efc3d992f1930e7 · 120 行
- 本地快照 SQL 计算 · 0457e9c551a6d3e480906b6b8090606e · 1 行
- 查询结果 · dca50c23380fae5d8c5eb0a5a9530f44 · 10 行
- 查询结果 · e6618f65e2047f997bc5a56d98549c74 · 12 行
- 查询结果 · 0002f49589feca750f3b0496c289eb25 · 10 行
- 本地快照 SQL 计算 · 2787d603720b8cef2060dc4aabb1529c · 120 行
- 查询结果 · 700f53c6a4902879f261d3b65925b98e · 3 行
- 查询结果 · 75737b30f27c02f393ca6feb2a4e7ea1 · 12 行
- 查询结果 · 6e85b2b6d68af5c9ba66fe6aeb41d091 · 1 行
- 查询结果 · 30836edfc58f10ecf14a849c941b4876 · 1 行
- 查询结果 · 03961a90bbffcca672117b0295bf5a59 · 2 行
- 查询结果 · 9bf812eb313b4e893fbc7d9b846ee188 · 20 行
- 查询结果 · 575ca822fb6a210b5d340d9ee6e8627d · 10 行
- 查询结果 · 2064ca27c3d618bbcf25bdccbe687fbc · 3 行
- 查询结果 · d3e9a6f2655185c586cd99b5bfa73e7c · 3 行
- 查询结果 · 3b0ce6068ef7fa384982963fa1aadb3f · 1 行
- 查询结果 · 39bfa9bf662cc9df5d39e783ca30ee81 · 1 行
- 查询结果 · 897d6e39676e146874fe905068e7711f · 1 行
- 查询结果 · da676cda418213c3b0fab4856c60003d · 1 行

本文导出本条完成回答；图表可通过 HTML 报告一并导出，完整数据与交互图表保留在原对话，技术依据可单独下载。