# -*- coding: utf-8 -*-
"""
企业流程架构设计智能体 - Streamlit主应用
基于 APQC 国际标准的端到端流程架构设计
"""

import os
import io
import streamlit as st
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from openai import OpenAI

# ==================== 页面配置 ====================
st.set_page_config(
    page_title="流程架构设计智能体",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ==================== 工具函数 ====================

def extract_file_text(uploaded_file) -> str:
    """从上传的文件中提取文本内容"""
    if uploaded_file is None:
        return ""

    filename = uploaded_file.name.lower()

    try:
        if filename.endswith('.txt'):
            content = uploaded_file.read()
            for encoding in ['utf-8', 'gbk', 'gb2312']:
                try:
                    return content.decode(encoding)
                except UnicodeDecodeError:
                    continue
            return content.decode('utf-8', errors='ignore')

        elif filename.endswith('.docx'):
            doc = Document(io.BytesIO(uploaded_file.read()))
            text_parts = []
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            return '\n'.join(text_parts)

        elif filename.endswith('.pdf'):
            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(uploaded_file.read()))
                text_parts = []
                for page in pdf_reader.pages:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text_parts.append(page_text)
                return '\n'.join(text_parts)
            except ImportError:
                return "[错误: 需要安装PyPDF2库来处理PDF文件]"

        else:
            return f"[不支持的文件格式: {filename}]"

    except Exception as e:
        return f"[文件解析错误: {str(e)}]"


def tree_to_docx(tree_text: str, department_name: str) -> Document:
    """将树状图文本转换为Word文档"""
    doc = Document()

    title_para = doc.add_heading(f"{department_name}端到端三级流程架构键盘图", level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    from datetime import datetime
    info_para = doc.add_paragraph()
    info_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info_para.add_run(f"生成时间：{datetime.now().strftime('%Y年%m月%d日')}")
    doc.add_paragraph()

    lines = tree_text.split('\n')
    for line in lines:
        if not line.strip():
            continue

        if line.strip().startswith('L1：') or line.strip().startswith('L1:'):
            para = doc.add_heading(line.strip(), level=1)
        elif line.strip().startswith('L2：') or line.strip().startswith('L2:'):
            para = doc.add_heading(line.strip(), level=2)
        elif line.strip().startswith('L3：') or line.strip().startswith('L3:'):
            para = doc.add_paragraph(line.strip())
            para.paragraph_format.left_indent = Inches(0.5)
        else:
            para = doc.add_paragraph(line)

    return doc


def get_client(api_key: str, base_url: str):
    """创建 OpenAI 客户端"""
    return OpenAI(api_key=api_key, base_url=base_url)


def generate_architecture(client, model: str, department_name: str, business_areas: str, existing_doc: str = None) -> str:
    """生成流程架构"""

    granularity_rules = """
## 核心流程知识与颗粒度规范（严格遵循）

**L1（一级流程 / 价值流 / 业务大类）：** 代表一个完整的端到端业务循环或高阶价值链。
例如："战略规划到执行 (DSTE)"、"集成产品开发 (IPD)"、"线索到回款 (LTC)"。

**L2（二级流程 / 流程组 / 业务阶段）：** L1 的逻辑切分，代表该端到端链路中的核心阶段或专业领域。

**L3（三级流程 / 业务模块）：** L2 的细分，是相对独立的**业务管理模块**，有明确的输入输出边界。

【颗粒度红线（绝对禁止）】：
L3 绝对不可以是具体的执行动作、会议、文档撰写或任务步骤！
❌ 错误：组织研讨会、收集市场数据、编写战略草案、审批绩效合约
✅ 正确：宏观环境与行业洞察、战略规划评估与调整、组织绩效评价
"""

    self_check_rules = """
## 输出前强制自检规则
1. 只输出树状图，不要任何前言、背景分析、边界定义或总结
2. L3 不能出现"编写"、"组织"、"开会"、"收集"、"审批"等具体动作词汇
"""

    doc_section = ""
    if existing_doc and existing_doc.strip():
        doc_section = f"\n### 参考文档：\n```\n{existing_doc.strip()}\n```\n"

    prompt = f"""{granularity_rules}

{self_check_rules}

---

## 输入信息

**部门/业务模块全称**：{department_name}
**核心细分业务板块**：{business_areas}
{doc_section}

---

请直接输出树状图格式的流程架构键盘图：

L1：[业务大类名称]
├── L2：[流程组名称]
│   ├── L3：[业务模块名称]
│   ├── L3：[业务模块名称]
│   └── L3：[业务模块名称]
├── L2：[流程组名称]
│   ├── L3：[业务模块名称]
│   └── L3：[业务模块名称]
"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是集团型企业端到端流程架构专家。输出符合APQC标准的L1-L3三级流程架构键盘图。"},
            {"role": "user", "content": prompt}
        ],
        max_tokens=8192,
        temperature=0.7,
        timeout=300
    )

    return response.choices[0].message.content


# ==================== 主应用 ====================

def main():
    st.title("🏗️ 企业流程架构设计智能体")
    st.markdown("**基于 APQC 国际标准的端到端三级流程架构设计**")
    st.markdown("---")

    # 侧边栏 - API 配置
    with st.sidebar:
        st.header("⚙️ API 配置")

        # 优先读取 st.secrets（Streamlit Cloud），其次读取环境变量
        default_key = st.secrets.get("DEEPSEEK_API_KEY", os.getenv("DEEPSEEK_API_KEY", ""))
        default_url = st.secrets.get("DEEPSEEK_BASE_URL", os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"))
        default_model = st.secrets.get("DEEPSEEK_MODEL", os.getenv("DEEPSEEK_MODEL", "deepseek-chat"))

        api_key = st.text_input(
            "DEEPSEEK_API_KEY",
            value=default_key,
            type="password",
            placeholder="sk-xxxxxxxx",
            help="输入你的 DeepSeek API Key"
        )

        base_url = st.text_input(
            "DEEPSEEK_BASE_URL",
            value=default_url,
            help="API 地址，一般无需修改"
        )

        model = st.selectbox(
            "模型选择",
            options=["deepseek-chat", "deepseek-coder"],
            index=0 if default_model == "deepseek-chat" else 1
        )

        st.markdown("---")

        # 测试连接
        if st.button("测试连接", key="test_conn"):
            if not api_key:
                st.error("请先输入 API Key")
            else:
                with st.spinner("测试中..."):
                    try:
                        client = get_client(api_key, base_url)
                        resp = client.chat.completions.create(
                            model=model,
                            messages=[{"role": "user", "content": "hi"}],
                            max_tokens=10,
                            timeout=30
                        )
                        st.success("✓ 连接成功")
                    except Exception as e:
                        st.error(f"✗ 连接失败: {str(e)}")

        st.markdown("---")
        st.markdown("""
        ### 使用说明

        1. 在上方输入 API Key
        2. 点击测试连接确认
        3. 输入部门名称和业务板块
        4. 点击"开始设计"

        ### 架构层级
        - **L1**：价值流/业务大类
        - **L2**：流程组/业务阶段
        - **L3**：业务模块

        ### 支持文件
        .txt / .docx / .pdf
        """)

    # 主区域 - 输入
    st.header("📋 基础信息输入")

    col1, col2 = st.columns(2)
    with col1:
        department_name = st.text_input(
            "部门/业务模块全称",
            placeholder="例如：人力资源部、供应链管理部"
        )

    with col2:
        business_areas = st.text_area(
            "核心细分业务板块",
            placeholder="例如：招聘、培训、绩效、薪酬",
            height=80
        )

    # 文件上传
    st.subheader("📄 上传现有流程文档（可选）")
    uploaded_file = st.file_uploader("上传参考文档", type=['txt', 'docx', 'pdf'])

    existing_doc_text = ""
    if uploaded_file:
        with st.spinner("解析中..."):
            existing_doc_text = extract_file_text(uploaded_file)
        if existing_doc_text and not existing_doc_text.startswith("["):
            st.success(f"✓ 已解析: {uploaded_file.name}")

    st.markdown("---")

    # 开始按钮
    col_btn1, col_btn2, col_btn3 = st.columns([1, 1, 1])
    with col_btn2:
        start_button = st.button(
            "🚀 开始设计",
            type="primary",
            use_container_width=True,
            disabled=not (api_key and department_name and business_areas)
        )

    # 执行与结果
    if start_button or ('result' in st.session_state and st.session_state.result):
        if start_button:
            if 'result' in st.session_state:
                del st.session_state.result

            st.header("⏳ 正在生成架构...")
            progress_bar = st.progress(0)
            status_text = st.empty()

            try:
                status_text.text("正在连接 API...")
                progress_bar.progress(10)

                client = get_client(api_key, base_url)

                status_text.text("🏗️ 正在构建三级流程架构...")
                progress_bar.progress(50)

                result = generate_architecture(
                    client, model,
                    department_name,
                    business_areas,
                    existing_doc_text if existing_doc_text and not existing_doc_text.startswith("[") else None
                )

                progress_bar.progress(100)
                status_text.text("✓ 架构设计完成！")

                st.session_state.result = result
                st.session_state.department_name = department_name

            except Exception as e:
                progress_bar.empty()
                status_text.empty()
                st.error(f"❌ 执行失败: {str(e)}")
                return

        # 显示结果
        if 'result' in st.session_state:
            st.markdown("---")
            st.header(f"📊 {st.session_state.get('department_name', '')}端到端三级流程架构键盘图")
            st.code(st.session_state.result, language=None)

            st.markdown("---")
            col_dl1, col_dl2, col_dl3 = st.columns([1, 1, 1])
            with col_dl2:
                doc = tree_to_docx(
                    st.session_state.result,
                    st.session_state.get('department_name', '企业')
                )
                doc_bytes = io.BytesIO()
                doc.save(doc_bytes)
                doc_bytes.seek(0)

                st.download_button(
                    label="📥 下载Word文档",
                    data=doc_bytes,
                    file_name=f"{st.session_state.get('department_name', '流程架构')}_架构键盘图.docx",
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    use_container_width=True
                )


if __name__ == "__main__":
    main()
