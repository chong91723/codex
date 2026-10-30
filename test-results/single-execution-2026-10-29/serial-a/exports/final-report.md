# 请先按原生计划模式为当前只读 AdventureWorks 样例设计一个分析方案：选择实际存在的销售事实与产品维度，分析最近两个可比完整年度的产品类别销售变化，

# AdventureWorks 产品类别销售变化分析

## 读取时间与限制

- **读取时间（Asia/Shanghai）**：基础只读查询执行于 **2026-10-29 20:38:45—20:38:50**；Python 派生结果生成于 **2026-10-29 20:39:08**。
- **年度范围**：按订单日期 `OrderDate` 选取两个完整自然年。2002 年覆盖 2002-01-01 至 2002-12-31，共 12 个出现月份；2003 年覆盖 2003-01-01 至 2003-12-31，共 12 个出现月份。2001 和 2004 年覆盖不足全年，已排除。
- **金额口径**：产品类别商品净额采用 `SUM(salesorderdetail.LineTotal)`，已反映行级数量、单价及折扣，不包含税费 `TaxAmt` 和运费 `Freight`，不构成会计确认收入。
- **币种限制**：金额按存储原值汇总，未做汇率换算。两个年度共 16230 个订单，其中 USD→AUD 3540 个、USD→CAD 1993 个、USD→GBP 1668 个、USD→EUR 107 个，另有 8922 个订单未提供汇率。无法确认所有原值金额属于同一币种，因此本报告不宣称其具备严格跨币种金额可比性。
- **订单范围**：全部订单状态均计入。两个年度所有 16230 个订单状态均为 5；数据库结构未提供可直接确认状态码业务含义的说明表。
- **维度限制**：类别按当前产品维度映射，样例没有类别历史快照，无法还原历史归类调整；未挂接子类或类别的规则保留为“未分类”。
- **样例限制**：AdventureWorks 是只读静态样例，结果仅描述本样例数据，不用于推断真实经营表现。

## 结论

两个年度商品净额从 31279713.34 增至 42376397.24，增加 11096683.91，同比增幅为 35.48%。四个实际出现的产品类别均实现金额增长。Bikes 的同比变化额为 8251835.18，对总体变化的贡献率为 74.36%，是总体增长的主要金额来源；Clothing 和 Accessories 的同比增速分别为 99.88% 和 522.91%，但金额基数较小。

图表已按同一 Python 派生结果生成：

- 《2002-2003 产品类别商品净额对比（存储金额原值）》
- 《产品类别对总体商品净额同比变化的贡献率》

## 产品类别同比与贡献

| 产品类别 | 2002 商品净额 | 2003 商品净额 | 同比变化额 | 贡献额 | 同比变化率 | 贡献率 |
|---|---:|---:|---:|---:|---:|---:|
| Bikes | 26971406.09 | 35223241.27 | 8251835.18 | 8251835.18 | 30.59% | 74.36% |
| Components | 3697526.53 | 5522509.6 | 1824983.07 | 1824983.07 | 49.36% | 16.45% |
| Clothing | 513903.95 | 1027195.59 | 513291.64 | 513291.64 | 99.88% | 4.63% |
| Accessories | 96876.77 | 603450.79 | 506574.02 | 506574.02 | 522.91% | 4.57% |

类别合计为 2002 年 31279713.34、2003 年 42376397.24。同比变化率以上一年度金额为分母；贡献率为类别同比变化额占总体同比变化额的比例。

各类别金额与贡献率均按两位小数独立展示，直接用展示值相加可能与总体展示值相差 0.01，贡献率展示值合计可能为 100.01%；这是舍入累计差异，不改变全精度计算结论。

## 金额完整性核对

- 两年共 71692 条销售明细、16230 个订单。
- `LineTotal = OrderQty × UnitPrice × (1 - UnitPriceDiscount)` 的行级核对超出 0.01 容差记录为 0 条。
- 按订单先汇总明细再核对 `SubTotal`，超出 0.01 容差的订单为 2578 个，均为明细合计低于订单头小计；最大绝对差异为 60426.08880800003。
- 明细商品净额合计为 73656110.58087312，订单头 `SubTotal` 合计为 86391645.49509811，差额为 -12735534.914230898。
- `TotalDue = SubTotal + TaxAmt + Freight` 的核对超出 0.01 容差订单为 0 个。

明细合计与订单头小计存在差异，因此金额核对不能判定为全部通过。该差异本轮仅作披露，不改变已确认的 `LineTotal` 商品净额口径，也不改用 `SubTotal` 替代类别金额。

## 覆盖与依赖

分析使用连接版本 1、查询结果版本 2、`sourceVersion=1`、`businessRevision=2`、`knowledgeRevision=1` 和结构快照 `b2c19d14ecc00d1361cf4f9ab1e1380d`。基础结果、SQL 版本、Python 脚本版本、图表父结果和完整依赖链均随结果资料保留在用户管理页，供逐项核查。

---

> 已跟踪的业务知识、指标与文件依赖仍有效；数据时效以发布时的检查为准。

## 数据依据范围

来源已关联：仅下列字段与执行记录匹配。查询或计算已记录；正文其他断言、解释和因果关系未作语义认证。

- y2002\_first："2002-01-01"；来源 AdventureWorks 双会话体验（独立只读）；字段 first\_order\_date；未应用已确认口径
- y2002\_last："2002-12-31"；来源 AdventureWorks 双会话体验（独立只读）；字段 last\_order\_date；未应用已确认口径
- y2002\_months：12；来源 AdventureWorks 双会话体验（独立只读）；字段 months\_present；未应用已确认口径
- y2003\_first："2003-01-01"；来源 AdventureWorks 双会话体验（独立只读）；字段 first\_order\_date；未应用已确认口径
- y2003\_last："2003-12-31"；来源 AdventureWorks 双会话体验（独立只读）；字段 last\_order\_date；未应用已确认口径
- y2003\_months：12；来源 AdventureWorks 双会话体验（独立只读）；字段 months\_present；未应用已确认口径
- status\_count：16230；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- aud\_count：3540；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- cad\_count：1993；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- gbp\_count：1668；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- eur\_count：107；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- missing\_count：8922；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- status\_code：5；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_status；未应用已确认口径
- total\_prior：31279713.34；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 total\_prior\_net\_sales；未应用已确认口径
- total\_current：42376397.24；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 total\_current\_net\_sales；未应用已确认口径
- total\_change：11096683.91；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 total\_change\_amount；未应用已确认口径
- total\_yoy：35.48；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 total\_yoy\_pct；未应用已确认口径
- bikes\_change：8251835.18；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 change\_amount；未应用已确认口径
- bikes\_contrib\_rate：74.36；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_rate\_pct；未应用已确认口径
- clothing\_yoy：99.88；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 yoy\_pct；未应用已确认口径
- accessories\_yoy：522.91；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 yoy\_pct；未应用已确认口径
- bikes\_name："Bikes"；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 product\_category；未应用已确认口径
- bikes\_prior：26971406.09；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 prior\_net\_sales；未应用已确认口径
- bikes\_current：35223241.27；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 current\_net\_sales；未应用已确认口径
- bikes\_contrib\_amount：8251835.18；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_amount；未应用已确认口径
- bikes\_yoy：30.59；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 yoy\_pct；未应用已确认口径
- components\_name："Components"；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 product\_category；未应用已确认口径
- components\_prior：3697526.53；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 prior\_net\_sales；未应用已确认口径
- components\_current：5522509.6；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 current\_net\_sales；未应用已确认口径
- components\_change：1824983.07；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 change\_amount；未应用已确认口径
- components\_contrib\_amount：1824983.07；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_amount；未应用已确认口径
- components\_yoy：49.36；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 yoy\_pct；未应用已确认口径
- components\_contrib\_rate：16.45；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_rate\_pct；未应用已确认口径
- clothing\_name："Clothing"；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 product\_category；未应用已确认口径
- clothing\_prior：513903.95；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 prior\_net\_sales；未应用已确认口径
- clothing\_current：1027195.59；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 current\_net\_sales；未应用已确认口径
- clothing\_change：513291.64；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 change\_amount；未应用已确认口径
- clothing\_contrib\_amount：513291.64；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_amount；未应用已确认口径
- clothing\_contrib\_rate：4.63；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_rate\_pct；未应用已确认口径
- accessories\_name："Accessories"；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 product\_category；未应用已确认口径
- accessories\_prior：96876.77；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 prior\_net\_sales；未应用已确认口径
- accessories\_current：603450.79；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 current\_net\_sales；未应用已确认口径
- accessories\_change：506574.02；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 change\_amount；未应用已确认口径
- accessories\_contrib\_amount：506574.02；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_amount；未应用已确认口径
- accessories\_contrib\_rate：4.57；来源 2002-2003 AdventureWorks 产品类别同比与贡献计算；字段 contribution\_rate\_pct；未应用已确认口径
- detail\_lines：71692；来源 AdventureWorks 双会话体验（独立只读）；字段 detail\_lines；未应用已确认口径
- order\_count：16230；来源 AdventureWorks 双会话体验（独立只读）；字段 order\_count；未应用已确认口径
- line\_mismatch："0"；来源 AdventureWorks 双会话体验（独立只读）；字段 line\_formula\_mismatch\_count；未应用已确认口径
- subtotal\_mismatch："2578"；来源 AdventureWorks 双会话体验（独立只读）；字段 subtotal\_mismatch\_orders；未应用已确认口径
- max\_subtotal：60426.08880800003；来源 AdventureWorks 双会话体验（独立只读）；字段 max\_subtotal\_abs\_diff；未应用已确认口径
- detail\_net：73656110.58087312；来源 AdventureWorks 双会话体验（独立只读）；字段 detail\_net\_sales；未应用已确认口径
- header\_subtotal：86391645.49509811；来源 AdventureWorks 双会话体验（独立只读）；字段 header\_subtotal；未应用已确认口径
- total\_difference：-12735534.914230898；来源 AdventureWorks 双会话体验（独立只读）；字段 total\_difference；未应用已确认口径
- total\_due\_mismatch："0"；来源 AdventureWorks 双会话体验（独立只读）；字段 total\_due\_mismatch\_orders；未应用已确认口径

> 部分来源未设置复用时长，不能认定为最新数据。

时效、知识与口径检查以发布时的记录为准，不代表下载或阅读时仍有效。

分析记录：01a18792-f467-7381-ad49-d53194336270

## 相关数据

- 查询结果 · 2c6c07bdedcb305f8a2fee583596c9e5 · 4 行
- 查询结果 · c0108509b7116e3bf91c6e94ee73d21e · 8 行
- 查询结果 · afc56b75f9d3781df7586756b53f0979 · 5 行
- 查询结果 · f627bcfb5626fbc952f5eb31d1ee0988 · 1 行
- 查询结果 · 259254e1ee26382e109388adbe7f88c4 · 1 行
- 查询结果 · ecaf61ccf0b4dbcfbd3a364e43e92148 · 1 行
- 查询结果 · d3134169f35b072016ea2be520b68a94 · 4 行

本文导出本条完成回答；图表可通过 HTML 报告一并导出，完整数据与交互图表保留在原对话，技术依据可单独下载。