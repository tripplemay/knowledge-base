"""知识库摄取服务（设计方案 v0.3 第③④步）。

- app.py    FastAPI：上传 / jobs CRUD / SSE 进度 / 取消重试（/api/v1，auth DI 留缝）
- db.py     SQLite 四表（jobs/stages/chunks/events）——可丢弃重建的运行态索引
- tasks.py  Huey(SqliteHuey) 任务：以子进程跑 pipeline，JSON 事件行入库

启动：
    cd _kb && .venv/bin/uvicorn server.app:app --port 8794          # api
    cd _kb && .venv/bin/huey_consumer server.tasks.huey -w 1 -k thread  # worker
"""
