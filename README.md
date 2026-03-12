# AutoFlow-Writer

🏗️ **企业流程架构设计智能体** - 基于 APQC 国际标准的端到端三级流程架构自动生成工具

## 功能特性

- 输入部门名称 + 业务板块，一键生成三级流程架构
- 严格遵循 L1-L3 颗粒度规范（价值流 → 流程组 → 业务模块）
- 支持上传现有流程文档（.txt/.docx/.pdf）作为参考
- 输出纯树状图格式的架构键盘图
- 支持导出 Word 文档

## 架构层级说明

| 层级 | 名称 | 说明 |
|------|------|------|
| L1 | 价值流/业务大类 | 端到端业务循环 |
| L2 | 流程组/业务阶段 | L1 的逻辑切分 |
| L3 | 业务模块 | 有明确边界的业务管理模块 |

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

创建 `.env` 文件：

```
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 3. 运行应用

```bash
streamlit run app.py
```

## 项目结构

```
AutoFlow-Writer/
├── app.py              # Streamlit 主应用
├── config.py           # 提示词配置（APQC 规范）
├── llm_client.py       # DeepSeek API 封装
├── requirements.txt    # 依赖清单
├── .gitignore
└── README.md
```

## 输出示例

```
L1：人才供应链管理
├── L2：人才规划与获取
│   ├── L3：人力资源规划与预算
│   ├── L3：招聘需求与岗位管理
│   └── L3：候选人寻源与甄选
├── L2：人才发展与赋能
│   ├── L3：培训需求分析与规划
│   └── L3：学习项目设计与运营
...
```

## License

MIT
