# 只使用独立 AdventureWorks 数据源 d405332778c1c12116333a1b，先读取用户已确认的业务定义。我想综合了解三个问题：第一，比较2003年与2002年有效线上订单的订单数、收入和客单价，哪些区域贡献了收入变化？第二，各产品大

## 数值依据状态

数值已匹配查询或 Python 执行记录。此状态不证明业务字段来源、公式口径或源数据本身正确。
> 部分来源未设置复用时长，不能据此认定为最新数据。
时效状态记录回答发布时的检查结果，不代表下载或阅读时仍有效。

    {
      "publicationChecks": {
        "version": "analysis-publication-v2",
        "checkedAt": "2026-10-28T12:12:05.355160+00:00",
        "freshness": [
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
            "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "calculation",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:07:13.438401+00:00",
            "sourceName": null,
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          },
          {
            "kind": "database",
            "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
            "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
            "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
            "connectionId": "d405332778c1c12116333a1b",
            "sourceName": "AdventureWorks 用户体验审计（独立只读）",
            "maxAgeMinutes": null,
            "status": "notConfigured"
          }
        ],
        "scope": "execution-record-match-only",
        "note": "读取时间不等于源数据更新时间；未设置时效规则的来源不自动判定为最新。"
      },
      "values": [
        {
          "name": "o_cy",
          "value": 2003,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "comparison_year",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_by",
          "value": 2002,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "base_year",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_bo",
          "value": 2680,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "base_orders",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_co",
          "value": 10955,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "comparison_orders",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_od",
          "value": 8275,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "orders_change",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_orp",
          "value": 308.77,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "orders_change_pct",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_br",
          "value": 6530858.55,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "base_revenue",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_cr",
          "value": 9805009.75,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "comparison_revenue",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_rd",
          "value": 3274151.2,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "revenue_change",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_rrp",
          "value": 50.13,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "revenue_change_pct",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_ba",
          "value": 2436.89,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "base_aov",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_ca",
          "value": 895.03,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "comparison_aov",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_ad",
          "value": -1541.86,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "aov_change",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "o_arp",
          "value": -63.27,
          "resultId": "50eebf293c5225f48c31a02a5b10c721",
          "row": 0,
          "column": "aov_change_pct",
          "sha256": "ca2f0950890f586111ebd5952a1c656f26af30595d0842520bf62a81e0995008",
          "sourceKind": "python",
          "sourceName": "订单头总览发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_brpct",
          "value": 0,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "base_repeat_pct",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_crpct",
          "value": 13.29,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "comparison_repeat_pct",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "au_br",
          "value": 2154353.68,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 0,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "au_cr",
          "value": 3041367.02,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 0,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "au_ch",
          "value": 887013.33,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 0,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "au_ct",
          "value": 27.09,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 0,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "uk_br",
          "value": 591586.85,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 1,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "uk_cr",
          "value": 1306168.3,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 1,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "uk_ch",
          "value": 714581.44,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 1,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "uk_ct",
          "value": 21.82,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 1,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "de_br",
          "value": 523412.41,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 2,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "de_cr",
          "value": 1057435.6,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 2,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "de_ch",
          "value": 534023.19,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 2,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "de_ct",
          "value": 16.31,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 2,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "fr_br",
          "value": 513545.31,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 3,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "fr_cr",
          "value": 1024692.39,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 3,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "fr_ch",
          "value": 511147.08,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 3,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "fr_ct",
          "value": 15.61,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 3,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "sw_br",
          "value": 1276567.45,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 4,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "sw_cr",
          "value": 1734502.44,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 4,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "sw_ch",
          "value": 457934.99,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 4,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "sw_ct",
          "value": 13.99,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 4,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "nw_br",
          "value": 848923.59,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 5,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "nw_cr",
          "value": 1095920.23,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 5,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "nw_ch",
          "value": 246996.65,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 5,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "nw_ct",
          "value": 7.54,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 5,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ne_br",
          "value": 0,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 6,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ne_cr",
          "value": 3966.81,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 6,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ne_ch",
          "value": 3966.81,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 6,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ne_ct",
          "value": 0.12,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 6,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ce_br",
          "value": 0,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 7,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ce_cr",
          "value": 2768.12,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 7,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ce_ch",
          "value": 2768.12,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 7,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ce_ct",
          "value": 0.08,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 7,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "se_br",
          "value": 1565.98,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 8,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "se_cr",
          "value": 2230.47,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 8,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "se_ch",
          "value": 664.49,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 8,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "se_ct",
          "value": 0.02,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 8,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ca_br",
          "value": 620903.28,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 9,
          "column": "base_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ca_cr",
          "value": 535958.38,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 9,
          "column": "comparison_revenue",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ca_ch",
          "value": -84944.9,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 9,
          "column": "revenue_change",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "ca_ct",
          "value": -2.59,
          "resultId": "a2f700be26b79411f4cef7058bcdee84",
          "row": 9,
          "column": "revenue_contribution_pct",
          "sha256": "f58c2a417aef6e6ce615c37cbd573f606fb29787e2f6f5a6a76f518ebaac2e7b",
          "sourceKind": "python",
          "sourceName": "区域收入贡献发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "regrec_b",
          "value": 6.612390279769897e-8,
          "resultId": "8147f8902d8fecd911d73b6c3309a4ab",
          "row": 0,
          "column": "base_reconciliation_difference",
          "sha256": "40c03dc498d781fb81708e2181b89f46e6b0699f875a8860fa9b410a98e37d96",
          "sourceKind": "python",
          "sourceName": "区域汇总回接核验",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "regrec_c",
          "value": -0.0000010952353477478027,
          "resultId": "8147f8902d8fecd911d73b6c3309a4ab",
          "row": 0,
          "column": "comparison_reconciliation_difference",
          "sha256": "40c03dc498d781fb81708e2181b89f46e6b0699f875a8860fa9b410a98e37d96",
          "sourceKind": "python",
          "sourceName": "区域汇总回接核验",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:27.281542+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "chart_data_id",
          "value": "916a5c7a85eadd24a8666a858c853c25",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 16,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "chart_id",
          "value": "b5c9e23f8e92d8aa2a5f5500ad3a3163",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 17,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "bike_br",
          "value": 6530858.55,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 0,
          "column": "base_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "bike_cr",
          "value": 9371244.74,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 0,
          "column": "comparison_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "bike_ch",
          "value": 2840386.19,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 0,
          "column": "revenue_change",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "bike_ct",
          "value": 86.75,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 0,
          "column": "revenue_contribution_pct",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "acc_br",
          "value": 0,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 1,
          "column": "base_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "acc_cr",
          "value": 294907.67,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 1,
          "column": "comparison_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "acc_ch",
          "value": 294907.67,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 1,
          "column": "revenue_change",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "acc_ct",
          "value": 9.01,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 1,
          "column": "revenue_contribution_pct",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "clo_br",
          "value": 0,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 2,
          "column": "base_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "clo_cr",
          "value": 138857.34,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 2,
          "column": "comparison_revenue",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "clo_ch",
          "value": 138857.34,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 2,
          "column": "revenue_change",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "clo_ct",
          "value": 4.24,
          "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
          "row": 2,
          "column": "revenue_contribution_pct",
          "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
          "sourceKind": "python",
          "sourceName": "产品大类收入发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cat_total_br",
          "value": 6530858.55,
          "resultId": "59d48a994b7c15b7ba08f4052099780f",
          "row": 0,
          "column": "base_revenue",
          "sha256": "e6e300ab35c61b1a5c4d47322cf00d9955cf3de0f15e73065ab0f23d5cd590b0",
          "sourceKind": "python",
          "sourceName": "产品大类收入合计",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cat_total_cr",
          "value": 9805009.75,
          "resultId": "59d48a994b7c15b7ba08f4052099780f",
          "row": 0,
          "column": "comparison_revenue",
          "sha256": "e6e300ab35c61b1a5c4d47322cf00d9955cf3de0f15e73065ab0f23d5cd590b0",
          "sourceKind": "python",
          "sourceName": "产品大类收入合计",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cat_total_ch",
          "value": 3274151.2,
          "resultId": "59d48a994b7c15b7ba08f4052099780f",
          "row": 0,
          "column": "revenue_change",
          "sha256": "e6e300ab35c61b1a5c4d47322cf00d9955cf3de0f15e73065ab0f23d5cd590b0",
          "sourceKind": "python",
          "sourceName": "产品大类收入合计",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cat_total_ct",
          "value": 100,
          "resultId": "59d48a994b7c15b7ba08f4052099780f",
          "row": 0,
          "column": "revenue_contribution_pct",
          "sha256": "e6e300ab35c61b1a5c4d47322cf00d9955cf3de0f15e73065ab0f23d5cd590b0",
          "sourceKind": "python",
          "sourceName": "产品大类收入合计",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:45.014385+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-5e9e-7092-b466-98399f3ae947",
              "retrievedAt": "2026-10-28T12:04:21.496844+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_boc",
          "value": 2680,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "base_ordering_customers",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_coc",
          "value": 9335,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "comparison_ordering_customers",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_brc",
          "value": 0,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "base_repeat_customers",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "rep_crc",
          "value": 1241,
          "resultId": "0c9c40fb6f5386798c57d61ca60d387e",
          "row": 0,
          "column": "comparison_repeat_customers",
          "sha256": "c650816b64203a5d23275c3760b93cd03093e89f202dcbc39abe0682037667bb",
          "sourceKind": "python",
          "sourceName": "复购比例发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:49.470168+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_unknown_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 0,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_unknown_c",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 0,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_unclass_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 1,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_unclass_c",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 1,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hrows_b",
          "value": 2680,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 2,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hrows_c",
          "value": 10955,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 2,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hids_b",
          "value": 2680,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 3,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hids_c",
          "value": 10955,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 3,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hrev_b",
          "value": 6530858.55,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 4,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_hrev_c",
          "value": 9805009.75,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 4,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_lrev_b",
          "value": 6530858.55,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 5,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_lrev_c",
          "value": 9805009.75,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 5,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_diff_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 6,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_diff_c",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 6,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_drows_b",
          "value": 2680,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 7,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_drows_c",
          "value": 24534,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 7,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_dids_b",
          "value": 2680,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 8,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_dids_c",
          "value": 24534,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 8,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_naive_b",
          "value": 6530858.55,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 9,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_naive_c",
          "value": 22091832.78,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 9,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_infl_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 10,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_infl_c",
          "value": 12286823.03,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 10,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_sig_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 11,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_sig_c",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 11,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_max_b",
          "value": 0,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 12,
          "column": "base_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "q_max_c",
          "value": 1e-12,
          "resultId": "f54d92cd36562796196cf7977c6adb63",
          "row": 12,
          "column": "comparison_value",
          "sha256": "6668daf569ba22b48a27a671e356ea7d476418e4d8e37600a40f477f4a54636a",
          "sourceKind": "python",
          "sourceName": "对账结果发布口径",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:20.131483+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:21.301831+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            },
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cmp_missing_b",
          "value": "0",
          "resultId": "3fe6b7d964a41644b17005c95038d0fa",
          "row": 0,
          "column": "headers_without_detail",
          "sha256": "f19d17a8b04f6bce720568600772ad1d3631be84975c6a4ebaf8aee36ba0743e",
          "sourceKind": "database",
          "sourceName": "AdventureWorks 用户体验审计（独立只读）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cmp_missing_c",
          "value": "0",
          "resultId": "3fe6b7d964a41644b17005c95038d0fa",
          "row": 1,
          "column": "headers_without_detail",
          "sha256": "f19d17a8b04f6bce720568600772ad1d3631be84975c6a4ebaf8aee36ba0743e",
          "sourceKind": "database",
          "sourceName": "AdventureWorks 用户体验审计（独立只读）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:04:46.491290+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cent_b",
          "value": "0",
          "resultId": "e8854ffb8e5cb2c709b2aa7b903fd5d3",
          "row": 0,
          "column": "cent_rounded_differences",
          "sha256": "3a642f0fa7b417b65abfe5e8ff3f46d72670bc86f870bbc7e973dd8aee8cd7ce",
          "sourceKind": "database",
          "sourceName": "AdventureWorks 用户体验审计（独立只读）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "cent_c",
          "value": "0",
          "resultId": "e8854ffb8e5cb2c709b2aa7b903fd5d3",
          "row": 1,
          "column": "cent_rounded_differences",
          "sha256": "3a642f0fa7b417b65abfe5e8ff3f46d72670bc86f870bbc7e973dd8aee8cd7ce",
          "sourceKind": "database",
          "sourceName": "AdventureWorks 用户体验审计（独立只读）",
          "acquisition": [
            {
              "kind": "database",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:05:22.481791+00:00",
              "connectionId": "d405332778c1c12116333a1b"
            }
          ]
        },
        {
          "name": "header_download_id",
          "value": "d64c8f138fc7e2008ebd953e3169d024",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 13,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "detail_download_id",
          "value": "93edfe91cc51b2de9edcc0a9f79b5ecb",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 14,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "customer_download_id",
          "value": "cc787dedfcaae5e93c977224509a6cde",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 15,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "pub_overall_id",
          "value": "50eebf293c5225f48c31a02a5b10c721",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 0,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "pub_region_id",
          "value": "a2f700be26b79411f4cef7058bcdee84",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 1,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "pub_cat_id",
          "value": "eecaa8ca7b938430db4c3eac0aebe818",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 2,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "pub_repeat_id",
          "value": "0c9c40fb6f5386798c57d61ca60d387e",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 3,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "pub_quality_id",
          "value": "f54d92cd36562796196cf7977c6adb63",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 4,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "raw_overall_id",
          "value": "e9b1065d45f392876844e8e3e1be9d61",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 5,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "raw_region_id",
          "value": "094e913caa2dc2f8d92ba37fe3d9fb38",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 6,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "raw_cat_id",
          "value": "a9c668d1913e0e4091c1e895c516670e",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 7,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "raw_repeat_id",
          "value": "0e560be22e918a4c69a0dd236ce111ed",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 8,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "raw_recon_id",
          "value": "3fe6b7d964a41644b17005c95038d0fa",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 9,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "corrected_mapping_id",
          "value": "3af5915d083d3262bbe3837efed87d7a",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 10,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "dup_check_id",
          "value": "93abc64a9a6d9c4edc559f6071dad175",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 11,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        },
        {
          "name": "diff_check_id",
          "value": "e8854ffb8e5cb2c709b2aa7b903fd5d3",
          "resultId": "003b953aa3e8345402be83656d6e9b86",
          "row": 12,
          "column": "reference_id",
          "sha256": "c256c485f0409b475cebc881daa9c87a000fe393ac1360074b02af826e145d48",
          "sourceKind": "python",
          "sourceName": "分析交付结果引用",
          "acquisition": [
            {
              "kind": "calculation",
              "threadId": "01a18263-a2d6-7861-9bce-36a8ca032033",
              "turnId": "01a18265-ab04-75c2-bd0b-05a9ccb0b792",
              "retrievedAt": "2026-10-28T12:07:13.438401+00:00"
            }
          ]
        }
      ],
      "sources": {
        "50eebf293c5225f48c31a02a5b10c721": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['16c692901e4e8a36fb485d94fb8ccf21']).iloc[0]\nresult = pd.DataFrame([{\n    'base_year': int(d['base_year']),\n    'comparison_year': int(d['comparison_year']),\n    'base_orders': int(d['base_orders']),\n    'comparison_orders': int(d['comparison_orders']),\n    'orders_change': int(d['orders_change']),\n    'orders_change_pct': round(float(d['orders_change_rate']) * 100, 2),\n    'base_revenue': round(float(d['base_revenue']), 2),\n    'comparison_revenue': round(float(d['comparison_revenue']), 2),\n    'revenue_change': round(float(d['revenue_change']), 2),\n    'revenue_change_pct': round(float(d['revenue_change_rate']) * 100, 2),\n    'base_aov': round(float(d['base_aov']), 2),\n    'comparison_aov': round(float(d['comparison_aov']), 2),\n    'aov_change': round(float(d['aov_change']), 2),\n    'aov_change_pct': round(float(d['aov_change_rate']) * 100, 2),\n}])\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "16c692901e4e8a36fb485d94fb8ccf21",
              "sha256": "98170ecc9903b778adcefcd2abe80a4e95d4f07a94ea57e648e439c3e725c73a",
              "source": "双期订单头总览指标"
            }
          ]
        },
        "0c9c40fb6f5386798c57d61ca60d387e": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['f6cd306149d51b8f917053c9ded9c841']).iloc[0]\nresult = pd.DataFrame([{\n    'base_year': int(d['base_year']),\n    'comparison_year': int(d['comparison_year']),\n    'base_ordering_customers': int(d['base_ordering_customers']),\n    'comparison_ordering_customers': int(d['comparison_ordering_customers']),\n    'base_repeat_customers': int(d['base_repeat_customers']),\n    'comparison_repeat_customers': int(d['comparison_repeat_customers']),\n    'base_repeat_pct': round(float(d['base_repeat_rate']) * 100, 2),\n    'comparison_repeat_pct': round(float(d['comparison_repeat_rate']) * 100, 2),\n    'repeat_change_pp': round(float(d['repeat_rate_change_pp']), 2),\n}])\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "f6cd306149d51b8f917053c9ded9c841",
              "sha256": "1418de46cfc39f78e37a39cc403f7db73ee327fb30dd95fb06677df653d16b92",
              "source": "年度复购客户与复购率对比"
            }
          ]
        },
        "a2f700be26b79411f4cef7058bcdee84": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['916a5c7a85eadd24a8666a858c853c25']).copy()\nresult = pd.DataFrame({\n    'region_name': d['region_name'],\n    'base_orders': d['base_orders'].astype(int),\n    'comparison_orders': d['comparison_orders'].astype(int),\n    'orders_change': d['orders_change'].astype(int),\n    'base_revenue': d['base_revenue'].round(2),\n    'comparison_revenue': d['comparison_revenue'].round(2),\n    'revenue_change': d['revenue_change'].round(2),\n    'revenue_contribution_pct': (d['revenue_contribution'] * 100).round(2),\n})\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "916a5c7a85eadd24a8666a858c853c25",
              "sha256": "19587871742345c82e9cf0b4b2422e65a89050a6e49506a3a11f61de23181305",
              "source": "区域收入对比与贡献"
            }
          ]
        },
        "8147f8902d8fecd911d73b6c3309a4ab": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nregions = pd.DataFrame(datasets['094e913caa2dc2f8d92ba37fe3d9fb38'])\noverall = pd.DataFrame(datasets['16c692901e4e8a36fb485d94fb8ccf21']).iloc[0]\nbase_region = float(regions.loc[regions['order_year'] == 2002, 'revenue'].sum())\ncompare_region = float(regions.loc[regions['order_year'] == 2003, 'revenue'].sum())\nresult = pd.DataFrame([{\n    'base_region_revenue': base_region,\n    'base_header_revenue': float(overall['base_revenue']),\n    'base_reconciliation_difference': base_region - float(overall['base_revenue']),\n    'comparison_region_revenue': compare_region,\n    'comparison_header_revenue': float(overall['comparison_revenue']),\n    'comparison_reconciliation_difference': compare_region - float(overall['comparison_revenue']),\n}])\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "094e913caa2dc2f8d92ba37fe3d9fb38",
              "sha256": "0eff401e7a31ea73db3c19fe46182fb1743d88515dc1221b4fb7dbe417f70169",
              "source": "AdventureWorks 用户体验审计（独立只读）"
            },
            {
              "kind": "dataset",
              "resultId": "16c692901e4e8a36fb485d94fb8ccf21",
              "sha256": "98170ecc9903b778adcefcd2abe80a4e95d4f07a94ea57e648e439c3e725c73a",
              "source": "双期订单头总览指标"
            }
          ]
        },
        "003b953aa3e8345402be83656d6e9b86": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nitems = [\n    ('订单头总览（发布口径）', 'result', '50eebf293c5225f48c31a02a5b10c721'),\n    ('区域收入贡献（发布口径）', 'result', 'a2f700be26b79411f4cef7058bcdee84'),\n    ('产品大类收入（发布口径）', 'result', 'eecaa8ca7b938430db4c3eac0aebe818'),\n    ('复购比例（发布口径）', 'result', '0c9c40fb6f5386798c57d61ca60d387e'),\n    ('头表明细对账（发布口径）', 'result', 'f54d92cd36562796196cf7977c6adb63'),\n    ('订单头总览原始结果', 'result', 'e9b1065d45f392876844e8e3e1be9d61'),\n    ('区域汇总原始结果', 'result', '094e913caa2dc2f8d92ba37fe3d9fb38'),\n    ('产品大类汇总原始结果', 'result', 'a9c668d1913e0e4091c1e895c516670e'),\n    ('复购汇总原始结果', 'result', '0e560be22e918a4c69a0dd236ce111ed'),\n    ('头表明细年度对账原始结果', 'result', '3fe6b7d964a41644b17005c95038d0fa'),\n    ('维度映射修正后结果', 'result', '3af5915d083d3262bbe3837efed87d7a'),\n    ('连接重复检查结果', 'result', '93abc64a9a6d9c4edc559f6071dad175'),\n    ('订单金额差异分布结果', 'result', 'e8854ffb8e5cb2c709b2aa7b903fd5d3'),\n    ('完整有效订单头下载数据', 'result', 'd64c8f138fc7e2008ebd953e3169d024'),\n    ('完整有效订单明细与分类下载数据', 'result', '93edfe91cc51b2de9edcc0a9f79b5ecb'),\n    ('客户年度订单与复购标识下载数据', 'result', 'cc787dedfcaae5e93c977224509a6cde'),\n    ('区域对比柱状图数据', 'result', '916a5c7a85eadd24a8666a858c853c25'),\n    ('区域对比柱状图', 'chart', 'b5c9e23f8e92d8aa2a5f5500ad3a3163'),\n]\nresult = pd.DataFrame(items, columns=['deliverable', 'reference_type', 'reference_id'])\n",
          "inputSources": []
        },
        "eecaa8ca7b938430db4c3eac0aebe818": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['62abd97c11dd56adab9d9aef89fdd430']).copy()\nresult = pd.DataFrame({\n    'category_name': d['category_name'],\n    'base_line_count': d['base_line_count'].astype(int),\n    'comparison_line_count': d['comparison_line_count'].astype(int),\n    'base_revenue': d['base_revenue'].round(2),\n    'comparison_revenue': d['comparison_revenue'].round(2),\n    'revenue_change': d['revenue_change'].round(2),\n    'revenue_contribution_pct': (d['revenue_contribution'] * 100).round(2),\n})\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "62abd97c11dd56adab9d9aef89fdd430",
              "sha256": "3c1b4f02a8663227bf578fac90901d2b5bbf409f30dc3de60fec9908c6bce452",
              "source": "产品大类成交收入对比"
            }
          ]
        },
        "59d48a994b7c15b7ba08f4052099780f": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['eecaa8ca7b938430db4c3eac0aebe818'])\nresult = pd.DataFrame([{\n    'base_revenue': round(float(d['base_revenue'].sum()), 2),\n    'comparison_revenue': round(float(d['comparison_revenue'].sum()), 2),\n    'revenue_change': round(float(d['revenue_change'].sum()), 2),\n    'revenue_contribution_pct': round(float(d['revenue_contribution_pct'].sum()), 2),\n}])\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "eecaa8ca7b938430db4c3eac0aebe818",
              "sha256": "d54108e3b1897843112105f672f113a0e59a737bb6cdbab5ac283ebdaec72da8",
              "source": "产品大类收入发布口径"
            }
          ]
        },
        "f54d92cd36562796196cf7977c6adb63": {
          "query": null,
          "pythonCode": "import pandas as pd\n\nd = pd.DataFrame(datasets['a1095874c881159a2dff780d4be5d089']).copy()\nkeep = [\n    '未知区域订单数', '未分类明细行数', '订单头行数', '订单头去重标识数',\n    '订单头收入', '明细行金额合计', '年度头表明细对账差额', '明细行数',\n    '明细复合标识去重数', '明细展开后的订单头金额累加', '连接放大差额',\n    '显著订单级金额差异数', '订单级最大绝对金额差异'\n]\nd = d[d['check_name'].isin(keep)].copy()\norder = {name: i for i, name in enumerate(keep)}\nd['sort_order'] = d['check_name'].map(order)\nd = d.sort_values('sort_order')\n\ndef display_value(value, name):\n    value = float(value)\n    if name == '订单级最大绝对金额差异':\n        return round(value, 12)\n    if name in {'订单头收入', '明细行金额合计', '年度头表明细对账差额', '明细展开后的订单头金额累加', '连接放大差额'}:\n        return round(value, 2)\n    return int(value)\n\nresult = pd.DataFrame({\n    'check_name': d['check_name'],\n    'base_value': [display_value(v, n) for v, n in zip(d['base_value'], d['check_name'])],\n    'comparison_value': [display_value(v, n) for v, n in zip(d['comparison_value'], d['check_name'])],\n    'unit': d['unit'],\n})\n",
          "inputSources": [
            {
              "kind": "dataset",
              "resultId": "a1095874c881159a2dff780d4be5d089",
              "sha256": "8b951c32689eb03642a7148d3f653cf9a26b0d759d699f4c8c26994b9c2afa84",
              "source": "订单头明细对账与映射核查"
            }
          ]
        },
        "3fe6b7d964a41644b17005c95038d0fa": {
          "query": "WITH valid_headers AS (SELECT SalesOrderID, OrderDate, SubTotal FROM salesorderheader WHERE Status = 5 AND OnlineOrderFlag = 1 AND OrderDate >= '2002-01-01' AND OrderDate < '2004-01-01'), line_by_order AS (SELECT SalesOrderID, COUNT(*) AS line_count, SUM(LineTotal) AS line_revenue FROM salesorderdetail GROUP BY SalesOrderID) SELECT YEAR(h.OrderDate) AS order_year, COUNT(*) AS header_rows, COUNT(DISTINCT h.SalesOrderID) AS distinct_header_ids, SUM(h.SubTotal) AS header_revenue, COALESCE(SUM(d.line_revenue), 0) AS category_line_revenue, SUM(h.SubTotal) - COALESCE(SUM(d.line_revenue), 0) AS reconciliation_difference, SUM(CASE WHEN d.SalesOrderID IS NULL THEN 1 ELSE 0 END) AS headers_without_detail, SUM(CASE WHEN NOT d.SalesOrderID IS NULL AND ABS(h.SubTotal - d.line_revenue) > 0 THEN 1 ELSE 0 END) AS orders_with_amount_difference, SUM(CASE WHEN NOT d.SalesOrderID IS NULL THEN d.line_count ELSE 0 END) AS detail_row_count, COUNT(DISTINCT CASE WHEN NOT d.SalesOrderID IS NULL THEN CONCAT(h.SalesOrderID, ':', d.SalesOrderID) END) AS comparable_headers FROM valid_headers AS h LEFT JOIN line_by_order AS d ON h.SalesOrderID = d.SalesOrderID GROUP BY YEAR(h.OrderDate) ORDER BY order_year",
          "pythonCode": null,
          "inputSources": []
        },
        "e8854ffb8e5cb2c709b2aa7b903fd5d3": {
          "query": "WITH valid_headers AS (SELECT SalesOrderID, OrderDate, SubTotal FROM salesorderheader WHERE Status = 5 AND OnlineOrderFlag = 1 AND OrderDate >= '2002-01-01' AND OrderDate < '2004-01-01'), line_by_order AS (SELECT SalesOrderID, SUM(LineTotal) AS line_revenue FROM salesorderdetail GROUP BY SalesOrderID), order_pairs AS (SELECT YEAR(h.OrderDate) AS order_year, h.SalesOrderID, h.SubTotal, COALESCE(l.line_revenue, 0) AS line_revenue, h.SubTotal - COALESCE(l.line_revenue, 0) AS amount_difference FROM valid_headers AS h LEFT JOIN line_by_order AS l ON h.SalesOrderID = l.SalesOrderID) SELECT order_year, COUNT(*) AS comparable_orders, SUM(CASE WHEN ABS(amount_difference) > 0.005 THEN 1 ELSE 0 END) AS meaningful_amount_differences, SUM(CASE WHEN ROUND(amount_difference, 2) <> 0 THEN 1 ELSE 0 END) AS cent_rounded_differences, MIN(amount_difference) AS minimum_difference, MAX(amount_difference) AS maximum_difference, SUM(amount_difference) AS net_difference, SUM(ABS(amount_difference)) AS absolute_difference_sum, MAX(ABS(amount_difference)) AS maximum_absolute_difference FROM order_pairs GROUP BY order_year ORDER BY order_year",
          "pythonCode": null,
          "inputSources": []
        }
      }
    }

# AdventureWorks 有效线上订单分析报告

## 口径与范围

分析仅使用指定的独立 AdventureWorks 只读数据源。比较期为 2003，基期为 2002。有效线上订单沿用已确认的 `Status` 与 `OnlineOrderFlag` 条件。订单数、订单收入和客单价均从订单头计算；订单收入使用 `SubTotal`，不包含 `TaxAmt` 和 `Freight`。客单价为订单头小计合计除以去重订单数。金额保留 AdventureWorks 数据源金额单位，币种尚未确认，不表述为人民币。区域与产品维度采用保留缺失记录的方式关联；下文采用修正后的映射审计结果。

## 核心结论

- 有效线上订单数由 2680 增至 10955，变化 8275，变化幅度 308.77%。
- 订单头收入由 6530858.55 增至 9805009.75，变化 3274151.2，变化幅度 50.13%。
- 客单价由 2436.89 变为 895.03，变化 -1541.86，变化幅度 -63.27%。订单数增加而客单价下降，结果按订单头口径计算。
- 区域收入正贡献以 Australia、United Kingdom、Germany、France、Southwest 和 Northwest 为主；Canada 的收入变化为负贡献。具体变化额及贡献比例见区域表。
- Bikes 是产品大类成交收入变化的主要正贡献项，Accessories 与 Clothing 也形成正贡献；未分类明细没有形成收入。产品大类仅以表格呈现。
- 复购比例由 0.0% 变为 13.29%。复购分母为该年度有有效线上订单的去重客户数。
- 订单头与明细年度总额分别对账后无差额。明细复合标识没有重复；但若先把订单头连接到明细、再按明细行累加订单头金额，会产生连接放大。

## 订单头总览

| 指标 | 基期 2002 | 比较期 2003 | 变化 |
|---|---:|---:|---:|
| 有效线上订单数 | 2680 | 10955 | 8275（308.77%） |
| 订单头收入 | 6530858.55 | 9805009.75 | 3274151.2（50.13%） |
| 客单价 | 2436.89 | 895.03 | -1541.86（-63.27%） |

## 区域收入变化与贡献

| 区域 | 基期订单头收入 | 比较期订单头收入 | 收入变化 | 对总体收入变化的贡献 |
|---|---:|---:|---:|---:|
| Australia | 2154353.68 | 3041367.02 | 887013.33 | 27.09% |
| United Kingdom | 591586.85 | 1306168.3 | 714581.44 | 21.82% |
| Germany | 523412.41 | 1057435.6 | 534023.19 | 16.31% |
| France | 513545.31 | 1024692.39 | 511147.08 | 15.61% |
| Southwest | 1276567.45 | 1734502.44 | 457934.99 | 13.99% |
| Northwest | 848923.59 | 1095920.23 | 246996.65 | 7.54% |
| Northeast | 0.0 | 3966.81 | 3966.81 | 0.12% |
| Central | 0.0 | 2768.12 | 2768.12 | 0.08% |
| Southeast | 1565.98 | 2230.47 | 664.49 | 0.02% |
| Canada | 620903.28 | 535958.38 | -84944.9 | -2.59% |

区域结果中的“未知区域”已按保留缺失记录的方式处理；修正后的审计显示未知区域没有订单或收入。未舍入的区域收入合计回接订单头收入，未舍入回接差额分别为 6.612390279769897e-08 和 -1.0952353477478027e-06，属于浮点计算残差；表中的金额按显示精度舍入。

交互式区域对比柱状图“区域有效线上订单收入对比”已生成，展示各区域基期与比较期订单头收入，图表数据结果引用为 `916a5c7a85eadd24a8666a858c853c25`，图表引用为 `b5c9e23f8e92d8aa2a5f5500ad3a3163`。未生成其他图片。

## 产品大类成交收入

| 产品大类 | 基期明细收入 | 比较期明细收入 | 收入变化 | 对总体收入变化的贡献 |
|---|---:|---:|---:|---:|
| Bikes | 6530858.55 | 9371244.74 | 2840386.19 | 86.75% |
| Accessories | 0.0 | 294907.67 | 294907.67 | 9.01% |
| Clothing | 0.0 | 138857.34 | 138857.34 | 4.24% |
| 合计 | 6530858.55 | 9805009.75 | 3274151.2 | 100.0% |

Accessories 与 Clothing 在基期的有效线上订单明细中没有出现，比较期出现并形成正贡献；该描述只反映本次数据范围，不作需求变化原因判断。产品大类没有生成图表。

## 客户复购

| 指标 | 基期 2002 | 比较期 2003 |
|---|---:|---:|
| 有有效线上订单的去重客户数 | 2680 | 9335 |
| 复购客户数 | 0 | 1241 |
| 复购率 | 0.0% | 13.29% |

复购比例由 0.0% 变为 13.29%。复购客户按年度和客户归组，依据不同有效订单累计次数判定；分母采用各年度有有效线上订单的去重客户数。

## 对账与数据质量

| 核查项 | 基期 2002 | 比较期 2003 |
|---|---:|---:|
| 未知区域订单数 | 0.0 | 0.0 |
| 未分类明细行数 | 0.0 | 0.0 |
| 订单头行数 | 2680.0 | 10955.0 |
| 订单头去重标识数 | 2680.0 | 10955.0 |
| 订单头收入 | 6530858.55 | 9805009.75 |
| 明细行金额合计 | 6530858.55 | 9805009.75 |
| 年度头表明细对账差额 | 0.0 | 0.0 |
| 明细行数 | 2680.0 | 24534.0 |
| 明细复合标识去重数 | 2680.0 | 24534.0 |
| 明细展开后的订单头金额累加 | 6530858.55 | 22091832.78 |
| 连接放大差额 | 0.0 | 12286823.03 |
| 显著订单级金额差异数 | 0.0 | 0.0 |
| 订单级最大绝对金额差异 | 0.0 | 1e-12 |

订单头没有缺失明细的订单数分别为 0 和 0。订单头行数与去重标识数相同，明细行数与复合标识去重数相同。订单头收入与明细行金额采用独立汇总，不因明细展开而重复累计；年度对账差额如实列示。订单级金额按显示精度舍入后存在差异的订单数分别为 0 和 0；最大绝对差异仅为 1e-12，属于浮点计算残差。

连接放大是实际核查结果：把订单头关联到明细后再累加订单头 `SubTotal`，比较期的订单头金额会被放大 12286823.03。因此订单级指标继续从订单头 CTE 计算，明细与分类收入单独计算。先前维度映射审计的计数条件存在错误，已用修正查询重新计算并保留原始结果；正文采用修正结果。区域或产品贡献只表示统计贡献，不作因果解释。

## 结果引用与下载数据

以下完整结果集均已保存在分析结果中，可用于下载和复核：

- 完整有效订单头：`d64c8f138fc7e2008ebd953e3169d024`
- 完整有效订单明细与产品分类映射：`93edfe91cc51b2de9edcc0a9f79b5ecb`
- 客户年度订单与复购标识：`cc787dedfcaae5e93c977224509a6cde`
- 订单头总览发布表：`50eebf293c5225f48c31a02a5b10c721`
- 区域收入贡献发布表：`a2f700be26b79411f4cef7058bcdee84`
- 产品大类收入发布表：`eecaa8ca7b938430db4c3eac0aebe818`
- 复购比例发布表：`0c9c40fb6f5386798c57d61ca60d387e`
- 头表明细对账发布表：`f54d92cd36562796196cf7977c6adb63`
- 订单头总览原始结果：`e9b1065d45f392876844e8e3e1be9d61`
- 区域汇总原始结果：`094e913caa2dc2f8d92ba37fe3d9fb38`
- 产品大类汇总原始结果：`a9c668d1913e0e4091c1e895c516670e`
- 复购汇总原始结果：`0e560be22e918a4c69a0dd236ce111ed`
- 头表明细年度对账原始结果：`3fe6b7d964a41644b17005c95038d0fa`
- 维度映射修正后结果：`3af5915d083d3262bbe3837efed87d7a`
- 连接重复检查结果：`93abc64a9a6d9c4edc559f6071dad175`
- 订单金额差异分布结果：`e8854ffb8e5cb2c709b2aa7b903fd5d3`

---
分析记录：01a18263-a2d6-7861-9bce-36a8ca032033

## 本轮相关查询结果

- 查询结果 · 094e913caa2dc2f8d92ba37fe3d9fb38 · 18 行
- 查询结果 · a9c668d1913e0e4091c1e895c516670e · 4 行
- 查询结果 · 3fe6b7d964a41644b17005c95038d0fa · 2 行
- 查询结果 · 31acfc68623884da0c2f39691cc286a4 · 2 行
- 查询结果 · 0e560be22e918a4c69a0dd236ce111ed · 2 行
- 查询结果 · e9b1065d45f392876844e8e3e1be9d61 · 2 行
- 查询结果 · 3af5915d083d3262bbe3837efed87d7a · 2 行
- 查询结果 · 93abc64a9a6d9c4edc559f6071dad175 · 2 行
- 查询结果 · e8854ffb8e5cb2c709b2aa7b903fd5d3 · 2 行
- AdventureWorks 用户体验审计（独立只读） · d64c8f138fc7e2008ebd953e3169d024 · 13635 行
- AdventureWorks 用户体验审计（独立只读） · 93edfe91cc51b2de9edcc0a9f79b5ecb · 27214 行
- AdventureWorks 用户体验审计（独立只读） · cc787dedfcaae5e93c977224509a6cde · 12015 行
- 查询结果 · 16c692901e4e8a36fb485d94fb8ccf21 · 1 行
- 查询结果 · 916a5c7a85eadd24a8666a858c853c25 · 10 行
- 查询结果 · 62abd97c11dd56adab9d9aef89fdd430 · 3 行
- 查询结果 · f6cd306149d51b8f917053c9ded9c841 · 1 行
- 查询结果 · a1095874c881159a2dff780d4be5d089 · 18 行
- 查询结果 · 50eebf293c5225f48c31a02a5b10c721 · 1 行
- 查询结果 · a2f700be26b79411f4cef7058bcdee84 · 10 行
- 查询结果 · eecaa8ca7b938430db4c3eac0aebe818 · 3 行
- 查询结果 · 0c9c40fb6f5386798c57d61ca60d387e · 1 行
- 查询结果 · f54d92cd36562796196cf7977c6adb63 · 13 行
- 查询结果 · 003b953aa3e8345402be83656d6e9b86 · 18 行
- 查询结果 · dcd63a4b454d4317a8e0d094bc72a382 · 1 行
- 查询结果 · 59d48a994b7c15b7ba08f4052099780f · 1 行
- 查询结果 · 8147f8902d8fecd911d73b6c3309a4ab · 1 行

此文件导出本条已完成回答及同轮已加载的查询结果编号；完整数据和查询语句可在原对话查看。