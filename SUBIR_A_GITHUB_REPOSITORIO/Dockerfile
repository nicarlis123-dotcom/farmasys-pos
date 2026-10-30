FROM python:3.11-slim

WORKDIR /app

# Copiar todo el sistema de la farmacia
COPY . /app

# Exponer el puerto del servidor
EXPOSE 8080

# Comando de inicio del servidor omnicanal
CMD ["python", "backend/server.py"]
