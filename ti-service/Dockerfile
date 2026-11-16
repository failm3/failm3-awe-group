FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp
WORKDIR /app
ARG INSTALL_EXTRAS=""
COPY requirements.txt pyproject.toml README.md ./
COPY awe_ti ./awe_ti
COPY migrations ./migrations
COPY scripts/collect_history.py ./scripts/collect_history.py
RUN mkdir -p awe_ti/sql && cp migrations/*.sql awe_ti/sql/ && pip install --no-cache-dir . && \
    if [ -n "$INSTALL_EXTRAS" ]; then pip install --no-cache-dir ".[${INSTALL_EXTRAS}]"; fi && \
    mkdir -p research/posts evidence/coverage exports && \
    chown -R 10001:10001 /app
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "awe_ti.cli", "serve", "--host", "0.0.0.0"]
