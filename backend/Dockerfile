FROM python:3.12-slim

WORKDIR /app

COPY . .

RUN pip install --no-cache-dir uv

RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "agent:app", "--host", "0.0.0.0", "--port", "8000"]