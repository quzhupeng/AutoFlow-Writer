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

from llm_client import DeepSeekClient, test_connection

# ==================== 页面配置 ====================
st.set_page_config(
    page_title="流程架构设计智能体",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ==================== 工具函数 ====================

def get_secret(key: str, default: str = "") -> str:
    """统一获取配置"""
    return os.getenv(key, default)


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

    # 设置文档标题
    title_para = doc.add_heading(f"{department_name}端到端三级流程架构键盘图", level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 添加生成信息
    from datetime import datetime
    info_para = doc.add_paragraph()
    info_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    info_para.add_run(f"生成时间：{datetime.now().strftime('%Y年%m月%d日')}")
    doc.add_paragraph()

    # 添加树状图内容
    lines = tree_text.split('\n')
    for line in lines:
        if not line.strip():
            continue

        # 判断层级
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


# ==================== 主应用 ====================

def main():
    # 标题
    st.title("🏗️ 企业流程架构设计智能体")
    st.markdown("**基于 APQC 国际标准的端到端三级流程架构设计**")
    st.markdown("---")

    # 侧边栏
    with st.sidebar:
        st.header("⚙️ 系统状态")
        if st.button("检查API连接", key="check_api"):
            with st.spinner("正在连接DeepSeek API..."):
                if test_connection():
                    st.success("✓ API连接正常")
                else:
                    st.error("✗ API连接失败，请检查配置")

        st.markdown("---")
        st.markdown("""
        ### 使用说明

        1. 输入**部门/业务模块全称**
        2. 输入**核心细分业务板块**
        3. （可选）上传现有流程文档
        4. 点击"开始设计"
        5. 下载架构键盘图

        ### 架构层级说明

        - **L1**：价值流/业务大类
        - **L2**：流程组/业务阶段
        - **L3**：业务模块

        ### 支持的文件格式
        - .txt / .docx / .pdf
        """)

    # 输入区域
    st.header("📋 基础信息输入")

    col1, col2 = st.columns(2)
    with col1:
        department_name = st.text_input(
            "部门/业务模块全称",
            placeholder="例如：人力资源部、供应链管理部、研发中心",
            help="待搭建流程架构的部门或业务模块全称"
        )

    with col2:
        business_areas = st.text_area(
            "核心细分业务板块",
            placeholder="例如：招聘、培训、绩效、薪酬\n或：采购、仓储、物流、库存",
            height=80,
            help="该部门/业务需覆盖的核心细分业务板块（可多选/自定义补充）"
        )

    # 文件上传
    st.subheader("📄 上传现有流程文档（可选）")
    uploaded_file = st.file_uploader(
        "上传参考文档，系统会参考现有流程进行设计",
        type=['txt', 'docx', 'pdf'],
        help="上传已有的流程文档，确保与现有流程保持一致"
    )

    existing_doc_text = ""
    if uploaded_file:
        with st.spinner("正在解析文档..."):
            existing_doc_text = extract_file_text(uploaded_file)
        if existing_doc_text and not existing_doc_text.startswith("["):
            st.success(f"✓ 已解析文档: {uploaded_file.name}")
            with st.expander("预览文档内容"):
                st.text(existing_doc_text[:1000] + "..." if len(existing_doc_text) > 1000 else existing_doc_text)
        elif existing_doc_text.startswith("["):
            st.warning(existing_doc_text)

    st.markdown("---")

    # 开始按钮
    col_btn1, col_btn2, col_btn3 = st.columns([1, 1, 1])
    with col_btn2:
        start_button = st.button(
            "🚀 开始设计",
            type="primary",
            use_container_width=True,
            disabled=not (department_name and business_areas)
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
                status_text.text("正在初始化...")
                progress_bar.progress(10)

                client = DeepSeekClient()

                status_text.text("🏗️ 正在构建端到端三级流程架构...")
                progress_bar.progress(50)

                result = client.generate_process_architecture(
                    department_name=department_name,
                    business_areas=business_areas,
                    existing_doc=existing_doc_text if existing_doc_text and not existing_doc_text.startswith("[") else None
                )

                progress_bar.progress(100)
                status_text.text("✓ 架构设计完成！")

                st.session_state.result = result
                st.session_state.department_name = department_name
                st.session_state.business_areas = business_areas

            except Exception as e:
                progress_bar.empty()
                status_text.empty()
                st.error(f"❌ 执行失败: {str(e)}")
                st.info("请检查：\n1. API Key是否正确配置\n2. 网络连接是否正常\n3. 输入信息是否完整")
                return

        # 显示结果
        if 'result' in st.session_state:
            st.markdown("---")
            st.header(f"📊 {st.session_state.get('department_name', '')}端到端三级流程架构键盘图")

            # 用代码块展示树状图（保留格式）
            st.code(st.session_state.result, language=None)

            # 下载按钮
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
