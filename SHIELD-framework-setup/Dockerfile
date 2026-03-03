FROM ubuntu:22.04

LABEL org.opencontainers.image.source=https://github.com/Georges034302/SHIELD-scanner
LABEL org.opencontainers.image.description="SHIELD Scanner - Containerized security assessment"
LABEL org.opencontainers.image.licenses="Proprietary"

# Avoid interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install required tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    wget \
    git \
    ca-certificates \
    openssl \
    jq \
    dnsutils \
    netcat \
    net-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone SHIELD Framework repository
RUN git clone https://github.com/Georges034302/SHIELD-framework.git /app/framework

# Copy the entrypoint wrapper script
COPY entrypoint-wrapper.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create output directory
RUN mkdir -p /app/output

WORKDIR /app

# Entry point wrapper
ENTRYPOINT ["/app/entrypoint.sh"]

# Default: show help
CMD ["--help"]
