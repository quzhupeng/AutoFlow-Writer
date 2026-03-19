# -*- coding: utf-8 -*-
"""
流程架构设计智能体 - DeepSeek API客户端封装
"""

import os
import logging
from typing import Optional
from openai import OpenAI
from dotenv import load_dotenv

from config import (
    DEEPSEEK_CONFIG,
    EXISTING_DOC_TEMPLATE,
    FULL_EXECUTION_PROMPT,
    GRANULARITY_RULES,
    REASONING_LOGIC,
    SELF_CHECK_RULES,
    SYSTEM_PROMPT,
)

# 加载环境变量
load_dotenv()

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_secret(key: str, default: str = "") -> str:
    """统一获取配置（优先环境变量，其次.env文件）"""
    return os.getenv(key, default)


class DeepSeekClient:
    """DeepSeek API客户端"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None
    ):
        self.api_key = api_key or get_secret("DEEPSEEK_API_KEY")
        self.base_url = base_url or get_secret("DEEPSEEK_BASE_URL", DEEPSEEK_CONFIG["base_url"])
        self.model = model or get_secret("DEEPSEEK_MODEL", DEEPSEEK_CONFIG["model"])

        if not self.api_key:
            raise ValueError("DEEPSEEK_API_KEY 未配置，请在 .env 文件中设置")

        self.client = OpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )
        logger.info(f"DeepSeek客户端初始化完成: model={self.model}")

    def generate_process_architecture(
        self,
        department_name: str,
        business_areas: str,
        existing_doc: Optional[str] = None
    ) -> str:
        """
        生成流程架构键盘图

        Args:
            department_name: 部门/业务模块名称
            business_areas: 核心细分业务板块
            existing_doc: 现有流程文档内容（可选）

        Returns:
            生成的流程架构内容（纯文本树状图格式）
        """
        # 处理现有文档注入
        if existing_doc and existing_doc.strip():
            doc_section = EXISTING_DOC_TEMPLATE.format(doc_content=existing_doc.strip())
        else:
            doc_section = ""

        # 构建完整提示词
        prompt = FULL_EXECUTION_PROMPT.format(
            department_name=department_name,
            business_areas=business_areas,
            existing_process_doc_section=doc_section,
            granularity_rules=GRANULARITY_RULES,
            reasoning_logic=REASONING_LOGIC,
            self_check_rules=SELF_CHECK_RULES
        )

        logger.info(f"开始生成流程架构: department={department_name}")

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=DEEPSEEK_CONFIG["max_tokens"],
                temperature=DEEPSEEK_CONFIG["temperature"],
                timeout=DEEPSEEK_CONFIG["timeout"]
            )

            result = response.choices[0].message.content or ""
            logger.info("流程架构生成完成")

            return result

        except Exception as e:
            logger.error(f"API调用失败: {str(e)}")
            raise RuntimeError(f"流程架构生成失败: {str(e)}")

    def chat(self, messages: list) -> str:
        """
        多轮对话接口

        Args:
            messages: 完整的对话历史 [{"role": "system/user/assistant", "content": "..."}]

        Returns:
            模型回复内容
        """
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=DEEPSEEK_CONFIG["max_tokens"],
                temperature=DEEPSEEK_CONFIG["temperature"],
                timeout=DEEPSEEK_CONFIG["timeout"]
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"对话API调用失败: {str(e)}")
            raise RuntimeError(f"对话失败: {str(e)}")

    def test_connection(self) -> str:
        """测试API连接并返回响应文本"""
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": "你好，请回复'连接成功'"}],
            max_tokens=50,
            timeout=30
        )
        return response.choices[0].message.content or ""


def test_connection() -> bool:
    """测试API连接"""
    try:
        client = DeepSeekClient()
        result = client.test_connection()
        logger.info(f"API连接测试成功: {result}")
        return True
    except Exception as e:
        logger.error(f"API连接测试失败: {str(e)}")
        return False


if __name__ == "__main__":
    # 测试连接
    print("测试DeepSeek API连接...")
    if test_connection():
        print("✓ 连接成功")
    else:
        print("✗ 连接失败")
