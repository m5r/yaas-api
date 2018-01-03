const path = require('path');
const Redis = require('ioredis');
const redis = new Redis('redis://redis:6379');

const computeOutputFileName = (filename) => {
  const { dir, name } = path.parse(filename);
  return `${path.join(dir, name)}.mp3`;
};

const computeResponse = ({ Key, source, thumbnail, title }) => ({
  url: `https://s3-eu-west-1.amazonaws.com/yaas/${Key}`,
  source,
  thumbnail,
  title: decodeURI(title),
});

const cache = {
  async get(key) {
    return JSON.parse(await redis.get(key));
  },
  set(key, value) {
    redis.set(key, JSON.stringify(value));
  },
};

module.exports = {
  computeOutputFileName,
  computeResponse,
  cache
};
