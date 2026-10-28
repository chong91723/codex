# 分析结论

## 数值依据状态

数值已匹配查询或 Python 执行记录。此状态不证明业务字段来源、公式口径或源数据本身正确。
> 部分来源未设置复用时长，不能据此认定为最新数据。
时效状态记录回答发布时的检查结果，不代表下载或阅读时仍有效。
部分指标引用另有口径与推导检查：系统记录其使用的用户确认规则版本、来源和计算步骤。此检查只对应记录中的指标字段，不证明整段回答语义、业务定义或源数据真实。口径状态以发布时为准。

    {
      "publicationChecks": {
        "version": "analysis-publication-v2",
        "checkedAt": "2026-10-28T04:08:27.555862+00:00",
        "freshness": [
          {
            "kind": "database",
            "threadId": "01a180b1-cdff-7f93-ad41-3792a7548ebe",
            "turnId": "metric-demo-task",
            "retrievedAt": "2026-10-28T04:08:24.166589+00:00",
            "connectionId": "07dd1a81582661700f51d5ea",
            "sourceName": "虚构业务指标验收",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          }
        ],
        "scope": "execution-record-match-only",
        "note": "读取时间不等于源数据更新时间；未设置时效规则的来源不自动判定为最新。"
      },
      "values": [
        {
          "name": "revenue",
          "value": "300.30",
          "resultId": "98dff8323771548e4c954c3b8c2fcd47",
          "row": 0,
          "column": "net_revenue",
          "sha256": "f309620912a20efb3aefb76529fc62d9555bcbf49a3a7ebbdbf5a96257ba54aa",
          "sourceKind": "python",
          "sourceName": "演示：订单贡献利润（虚构数据）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a180b1-cdff-7f93-ad41-3792a7548ebe",
              "turnId": "metric-demo-task",
              "retrievedAt": "2026-10-28T04:08:24.166589+00:00",
              "connectionId": "07dd1a81582661700f51d5ea"
            }
          ],
          "metric": {
            "status": "confirmedDefinitionMatched",
            "scope": "Executed against user-acknowledged definition; not a proof of business truth or narrative semantics.",
            "ruleId": "fbc32350e49f5991f9b562522cffea47",
            "version": 1,
            "definitionHash": "175ad9735a1b29b146e0bd553f8766fb185b95473bfec1bd10bb94f77fd6e586",
            "ruleName": "演示：订单贡献利润（虚构数据）",
            "name": "净收款",
            "column": "net_revenue",
            "unit": "CNY",
            "scale": 2,
            "rounding": "HALF_UP",
            "formula": "collected_total - refunded_total",
            "operation": null,
            "field": null,
            "proofHash": "fe61f93722146b3d372ef0685ed279397568db3797a54445ed3d3095b837c28d",
            "resultId": "98dff8323771548e4c954c3b8c2fcd47",
            "row": 0,
            "step": {
              "row": 0,
              "group": {},
              "node": {
                "display": "300.30",
                "exact": {
                  "denominator": "10",
                  "numerator": "3003"
                },
                "expression": "collected_total - refunded_total",
                "inputs": {
                  "collected_total": {
                    "denominator": "10",
                    "numerator": "3703"
                  },
                  "refunded_total": {
                    "denominator": "1",
                    "numerator": "70"
                  }
                },
                "kind": "formula",
                "rounding": "HALF_UP",
                "scale": 2,
                "unit": "CNY"
              },
              "sourceRowCount": 3
            }
          }
        },
        {
          "name": "profit",
          "value": "170.30",
          "resultId": "98dff8323771548e4c954c3b8c2fcd47",
          "row": 0,
          "column": "profit",
          "sha256": "f309620912a20efb3aefb76529fc62d9555bcbf49a3a7ebbdbf5a96257ba54aa",
          "sourceKind": "python",
          "sourceName": "演示：订单贡献利润（虚构数据）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a180b1-cdff-7f93-ad41-3792a7548ebe",
              "turnId": "metric-demo-task",
              "retrievedAt": "2026-10-28T04:08:24.166589+00:00",
              "connectionId": "07dd1a81582661700f51d5ea"
            }
          ],
          "metric": {
            "status": "confirmedDefinitionMatched",
            "scope": "Executed against user-acknowledged definition; not a proof of business truth or narrative semantics.",
            "ruleId": "fbc32350e49f5991f9b562522cffea47",
            "version": 1,
            "definitionHash": "175ad9735a1b29b146e0bd553f8766fb185b95473bfec1bd10bb94f77fd6e586",
            "ruleName": "演示：订单贡献利润（虚构数据）",
            "name": "贡献利润",
            "column": "profit",
            "unit": "CNY",
            "scale": 2,
            "rounding": "HALF_UP",
            "formula": "net_revenue - net_cost",
            "operation": null,
            "field": null,
            "proofHash": "fe61f93722146b3d372ef0685ed279397568db3797a54445ed3d3095b837c28d",
            "resultId": "98dff8323771548e4c954c3b8c2fcd47",
            "row": 0,
            "step": {
              "row": 0,
              "group": {},
              "node": {
                "display": "170.30",
                "exact": {
                  "denominator": "10",
                  "numerator": "1703"
                },
                "expression": "net_revenue - net_cost",
                "inputs": {
                  "net_cost": {
                    "denominator": "1",
                    "numerator": "130"
                  },
                  "net_revenue": {
                    "denominator": "10",
                    "numerator": "3003"
                  }
                },
                "kind": "formula",
                "rounding": "HALF_UP",
                "scale": 2,
                "unit": "CNY"
              },
              "sourceRowCount": 3
            }
          }
        },
        {
          "name": "margin",
          "value": "56.71",
          "resultId": "98dff8323771548e4c954c3b8c2fcd47",
          "row": 0,
          "column": "margin_percent",
          "sha256": "f309620912a20efb3aefb76529fc62d9555bcbf49a3a7ebbdbf5a96257ba54aa",
          "sourceKind": "python",
          "sourceName": "演示：订单贡献利润（虚构数据）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a180b1-cdff-7f93-ad41-3792a7548ebe",
              "turnId": "metric-demo-task",
              "retrievedAt": "2026-10-28T04:08:24.166589+00:00",
              "connectionId": "07dd1a81582661700f51d5ea"
            }
          ],
          "metric": {
            "status": "confirmedDefinitionMatched",
            "scope": "Executed against user-acknowledged definition; not a proof of business truth or narrative semantics.",
            "ruleId": "fbc32350e49f5991f9b562522cffea47",
            "version": 1,
            "definitionHash": "175ad9735a1b29b146e0bd553f8766fb185b95473bfec1bd10bb94f77fd6e586",
            "ruleName": "演示：订单贡献利润（虚构数据）",
            "name": "贡献利润率",
            "column": "margin_percent",
            "unit": "%",
            "scale": 2,
            "rounding": "HALF_UP",
            "formula": "profit / net_revenue * 100",
            "operation": null,
            "field": null,
            "proofHash": "fe61f93722146b3d372ef0685ed279397568db3797a54445ed3d3095b837c28d",
            "resultId": "98dff8323771548e4c954c3b8c2fcd47",
            "row": 0,
            "step": {
              "row": 0,
              "group": {},
              "node": {
                "display": "56.71",
                "exact": {
                  "denominator": "231",
                  "numerator": "13100"
                },
                "expression": "profit / net_revenue * 100",
                "inputs": {
                  "net_revenue": {
                    "denominator": "10",
                    "numerator": "3003"
                  },
                  "profit": {
                    "denominator": "10",
                    "numerator": "1703"
                  }
                },
                "kind": "formula",
                "rounding": "HALF_UP",
                "scale": 2,
                "unit": "%"
              },
              "sourceRowCount": 3
            }
          }
        }
      ],
      "sources": {
        "98dff8323771548e4c954c3b8c2fcd47": {
          "query": null,
          "pythonCode": null,
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "5df0db93369363a4f39e4ff4b85aa76a",
              "sha256": "dfa097dc91829087116b6c91c37b5a478680415ff2d00d3557ad1cc882f8d418",
              "source": "虚构业务指标验收"
            }
          ],
          "metricContext": {
            "source": {
              "binding": "2d226d6b72f88ab0dab27f39a8ade86038d545a8bbaba6c5ecf3164c3e52b96c",
              "columns": [
                {
                  "name": "booked_on",
                  "nativeType": "date",
                  "type": "datetime"
                },
                {
                  "name": "collected",
                  "nativeType": "Decimal",
                  "scale": 2,
                  "type": "number"
                },
                {
                  "name": "fulfilment",
                  "nativeType": "Decimal",
                  "scale": 2,
                  "type": "number"
                },
                {
                  "name": "order_id",
                  "nativeType": "str",
                  "type": "string"
                },
                {
                  "name": "recovered",
                  "nativeType": "Decimal",
                  "scale": 2,
                  "type": "number"
                },
                {
                  "name": "refunded",
                  "nativeType": "Decimal",
                  "scale": 2,
                  "type": "number"
                },
                {
                  "name": "status",
                  "nativeType": "str",
                  "type": "string"
                }
              ],
              "query": "SELECT \"booked_on\" AS \"booked_on\", \"collected_amount\" AS \"collected\", \"fulfilment_cost\" AS \"fulfilment\", \"order_id\" AS \"order_id\", \"recovered_cost\" AS \"recovered\", \"refunded_amount\" AS \"refunded\", \"status\" AS \"status\" FROM \"public\".\"demo_orders\"",
              "resultId": "5df0db93369363a4f39e4ff4b85aa76a",
              "schemaHash": "c34c7f24f673facda20414395c2cdf47099e891aedf06bf72c52ea6f9e777d55",
              "sha256": "dfa097dc91829087116b6c91c37b5a478680415ff2d00d3557ad1cc882f8d418",
              "sourceId": "07dd1a81582661700f51d5ea",
              "sourceVersion": 1
            },
            "parameters": {
              "end_date": "2026-02-01",
              "start_date": "2026-01-01"
            },
            "proofHash": "fe61f93722146b3d372ef0685ed279397568db3797a54445ed3d3095b837c28d"
          }
        }
      }
    }

演示订单净收款为 300.30，贡献利润为 170.30，贡献利润率为 56.71%。

---
分析记录：01a180b1-cdff-7f93-ad41-3792a7548ebe

此文件导出本条已完成回答及同轮已加载的查询结果编号；完整数据和查询语句可在原对话查看。