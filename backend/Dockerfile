FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml .
COPY uv.lock* .

COPY backend ./backend
COPY api ./api
COPY main.py .

RUN pip install --no-cache-dir uv
RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]