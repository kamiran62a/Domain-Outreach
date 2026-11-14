# n8n + ffmpeg + Arabic fonts, so the workflow can render videos itself.
FROM node:24-alpine

ARG N8N_VERSION=2.47.7

RUN apk add --no-cache ffmpeg font-noto-arabic fontconfig tzdata tini \
 && apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm install -g --omit=dev n8n@${N8N_VERSION} \
 && npm cache clean --force \
 && apk del .build-deps \
 && fc-cache -f \
 && mkdir -p /data/work /home/node/.n8n \
 && chown -R node:node /data/work /home/node/.n8n

COPY --chown=node:node scripts/ /scripts/

USER node
WORKDIR /home/node
EXPOSE 5678
ENTRYPOINT ["tini", "--", "n8n"]
