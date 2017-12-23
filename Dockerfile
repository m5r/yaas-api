FROM node:9-alpine

WORKDIR /root/yaas
COPY . .

RUN apk add --update \
    python

RUN yarn config set no-progress && \
    yarn --prod && \
    yarn cache clean

EXPOSE 3000
CMD yarn start
