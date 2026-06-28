# Image backend (API FastAPI). Le frontend est buildé/déployé séparément.
FROM python:3.11-slim

WORKDIR /app

# uv pour installer les dépendances depuis le lockfile (build reproductible).
RUN pip install --no-cache-dir uv

# Couche de dépendances séparée du code → cache Docker réutilisé tant que le
# lockfile ne change pas.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Code applicatif (cf. .dockerignore : frontend/, tests/, .venv/, .env exclus).
COPY . .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
