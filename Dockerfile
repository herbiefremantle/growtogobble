# Railway builds this automatically when it finds a Dockerfile.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
ENV HOST=0.0.0.0
# Railway's edge proxy connects from addresses we can't list in advance; only it can reach the container
ENV FORWARDED_ALLOW_IPS=*
# the SQLite database lives on the Railway volume mounted at /data
ENV GARDEN_DB=/data/garden.db

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
COPY static ./static
RUN mkdir -p /data
EXPOSE 8000
CMD ["python", "-m", "app"]
