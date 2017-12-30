const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { unlinkSync, createReadStream } = require('fs');
const { send, json } = require('micro');
const AWS = require('aws-sdk');
const microCors = require('micro-cors');
const Redis = require('ioredis');
const { accessKeyId, secretAccessKey, region } = require('./aws');

const redis = new Redis('redis://redis:6379');

AWS.config.update({
  region,
  accessKeyId,
  secretAccessKey,
});

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {
    Bucket: 'yaas',
  },
});

const cors = microCors({
  allowMethods: ['POST'],
  allowHeaders: ['Accept', 'Content-Type'],
  origin: 'https://www.yaas.tools',
});

module.exports = cors(async (req, res) => {
  const { url } = await json(req);
  const keyFromUrl = await redis.get(url);

  if (keyFromUrl) {
    return send(res, 200, `https://s3-eu-west-1.amazonaws.com/yaas/${keyFromUrl}`);
  }

  const { stdout: filename } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --get-filename --restrict-filenames ${url}`);
  const { dir, name } = path.parse(filename);
  const outputFileName = `${path.join(dir, name)}.mp3`;
  const Key = path.basename(outputFileName);

  if (await redis.get(Key)) {
    return send(res, 200, `https://s3-eu-west-1.amazonaws.com/yaas/${Key}`);
  }

  try {
    await s3.headObject({ Key }).promise();

    return send(res, 200, `https://s3-eu-west-1.amazonaws.com/yaas/${Key}`);
  } catch (e) {
    const { stderr } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --restrict-filenames --add-metada --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`);

    if (stderr !== '') {
      console.error(stderr);
      send(res, 500, 'Error when calling youtube-dl');
    }

    redis.set(Key, url);
    redis.set(url, Key);

    const fileStream = createReadStream(outputFileName);
    return s3.upload({
      Key,
      Body: fileStream,
      ACL: 'public-read',
      ContentType: 'audio/mpeg',
      ContentDisposition: 'attachment',
      Tagging: `requester=${(req.headers['x-forwarded-for'] || '').split(',')[0] || req.connection.remoteAddress}`,
      Metadata: {
        from: url,
      },
    })
      .promise()
      .then(data => send(res, 200, data.Location))
      .catch(err => send(res, 500, err))
      .then(() => unlinkSync(outputFileName));
  }
});
