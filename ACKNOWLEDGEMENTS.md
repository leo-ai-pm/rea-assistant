# 致谢与来源

REA 拆解助手是独立维护的软件分析产品，复用开源逆向工程能力，并提供网页工作台和 Agent 调度。产品名称与维护独立性不改变所继承代码的作者归属。

## 代码来源

- **REA / Reverse Engineer Anything**：[morluto/rea](https://github.com/morluto/rea)。逆向工程工具体系的原始项目，通过 CLI 与 MCP 向 Agent 提供分析能力。
- **ChaiChai / 拆拆**：[hubooooooo/chaichai](https://github.com/hubooooooo/chaichai)。本仓库直接采用的代码基线，提交为 `74ec6d01074c7df4a0e635bb59b8fe50e5a27607`（2026-10-13）。其代码保留 REA 的技能、配置与引擎结构，以及 morluto 的版权声明；本项目同时继承其中的分析实现、中文使用说明、安装适配和其他既有改动。

继承关系为：REA → ChaiChai → REA 拆解助手。本项目未对前两个项目之间的全部差异逐项审计，不将继承代码或中间项目的改动声明为本项目原创。

## 本项目新增工作

由 leo-ai-pm 维护的本项目新增了以下产品层实现：

- `web/public/`：网页聊天、会话切换、模型设置、执行过程、证据查看与导出，以及适配窄屏的界面。
- `web/server.mjs`：本地 HTTP 服务、OpenAI 兼容模型接入、Agent 工具循环、按问题发现工具、静态分析权限过滤、事件推送与会话持久化。
- `web/test.mjs`：网页接口边界、真实 MCP 样例、模拟模型工具循环、受限工具拦截与历史恢复测试。
- 本产品的使用文档和网页验证流程。

底层解析器、既有分析工具、引擎适配器和安装脚本沿用基线，除明确记录的后续修改外，不计入上述新增工作。当前网页也并未开放底层工具的全部能力，实际范围见 README。

## 许可证与历史标识

保留 [LICENSE](LICENSE) 中 morluto、hubooooooo 的版权声明，以及本项目网页新增部分的声明。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `licenses/`。

底层包名、CLI 名称以及部分安装、发布脚本和开发文档仍使用 ChaiChai 或 REA 的历史名称与地址，以保留运行兼容性和来源信息。本产品当前从源码启动，不使用上游的自动安装或发布流程，也不代表上游官方发行版。
