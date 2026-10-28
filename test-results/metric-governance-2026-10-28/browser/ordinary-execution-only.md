# 分析结论

## 数值依据状态

数值已匹配查询或 Python 执行记录。此状态不证明业务字段来源、公式口径或源数据本身正确。
> 部分来源未设置复用时长，不能据此认定为最新数据。
时效状态记录回答发布时的检查结果，不代表下载或阅读时仍有效。

    {
      "publicationChecks": {
        "version": "analysis-publication-v2",
        "checkedAt": "2026-10-28T04:08:28.164285+00:00",
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
          "name": "value",
          "value": "170.30",
          "resultId": "01ccf4ca7dbe3bc4abd05302a1d498e3",
          "row": 0,
          "column": "value",
          "sha256": "6d954569301734634b1f0debbe0ea08d839b390a33e754963abc6df39d3942d1",
          "sourceKind": "python",
          "sourceName": "Python 计算结果",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a180b1-cdff-7f93-ad41-3792a7548ebe",
              "turnId": "metric-demo-task",
              "retrievedAt": "2026-10-28T04:08:24.166589+00:00",
              "connectionId": "07dd1a81582661700f51d5ea"
            }
          ]
        }
      ],
      "sources": {
        "01ccf4ca7dbe3bc4abd05302a1d498e3": {
          "query": null,
          "pythonCode": "result=[{'value':datasets[parameters['id']][0]['profit']}]",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "98dff8323771548e4c954c3b8c2fcd47",
              "sha256": "f309620912a20efb3aefb76529fc62d9555bcbf49a3a7ebbdbf5a96257ba54aa",
              "source": "演示：订单贡献利润（虚构数据）"
            }
          ]
        }
      }
    }

普通计算值为 170.30。

---
分析记录：01a180b1-cdff-7f93-ad41-3792a7548ebe

此文件导出本条已完成回答及同轮已加载的查询结果编号；完整数据和查询语句可在原对话查看。