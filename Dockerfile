FROM node:9-alpine

WORKDIR /root/yaas
COPY . .

RUN apk add --update \
    python \
    ffmpeg

RUN yarn config set no-progress && \
    yarn --prod && \
    yarn cache clean

RUN ./bin/youtube-dl --no-check-certificate -U

EXPOSE 3000
CMD yarn start
