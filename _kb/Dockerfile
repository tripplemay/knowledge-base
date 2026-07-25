# 摄取服务与流水线（FastAPI + Huey worker 共用一份镜像，靠启动命令区分）
# 构建上下文 = _kb/
FROM python:3.12-slim-bookworm

# git：知识提交写进数据仓（vcs.py）；其余是 pymupdf/lightrag 的运行时依赖
# qpdf：assemble 阶段做 PDF 线性化（缺失时代码会静默跳过，装上体验更好）
RUN apt-get update && apt-get install -y --no-install-recommends \
      git \
      qpdf \
      libgl1 \
      libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /kb/_kb

# 依赖层单独缓存：锁文件不变就不重装（lightrag/pymupdf 编译较慢）
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY . .

# 非 root；uid/gid 与 compose 中数据卷的属主保持一致
RUN groupadd -r -g 10001 kb && useradd -r -u 10001 -g kb kb \
    && chown -R kb:kb /kb
USER kb

# 数据仓提交需要身份，且容器内 HOME 可能不可写
ENV GIT_AUTHOR_NAME=KnowledgeBase \
    GIT_AUTHOR_EMAIL=kb@localhost \
    GIT_COMMITTER_NAME=KnowledgeBase \
    GIT_COMMITTER_EMAIL=kb@localhost \
    PYTHONUNBUFFERED=1

EXPOSE 8794
# 默认起 API；worker 在 compose 里覆盖 command
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8794"]
