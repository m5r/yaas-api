const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { unlinkSync, createReadStream } = require('fs');
const { send, json } = require('micro');
const AWS = require('aws-sdk');
const microCors = require('micro-cors');
const { computeResponse, computeOutputFileName, cache } = require('./utils');
const { accessKeyId, secretAccessKey, region } = require('./aws');

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
  const keyFromUrl = await cache.get(url);

  if (keyFromUrl) {
    return send(res, 200, await cache.get(keyFromUrl));
  }

  const { stdout } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --get-filename --restrict-filenames --dump-json ${url}`);
  const [fileName, meta] = stdout.split('\n');
  const outputFileName = computeOutputFileName(fileName);
  const Key = path.basename(outputFileName);
  const dataFromKey = await cache.get(Key);

  if (dataFromKey) {
    cache.set(url, Key);
    return send(res, 200, dataFromKey);
  }

  try {
    const { Metadata: { source, thumbnail, title } } = await s3.headObject({ Key }).promise();
    const response = computeResponse({ Key, source, thumbnail, title });

    cache.set(Key, response);
    cache.set(url, Key);
    cache.set(source, Key);

    return send(res, 200, computeResponse({ Key, source, thumbnail, title }));
  } catch (e) {
    const { stderr } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --restrict-filenames --add-metada --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`);

    if (stderr !== '') {
      console.error(stderr);
      send(res, 500, 'Error when calling youtube-dl');
    }

    const { thumbnail, title, webpage_url: source } = JSON.parse(meta);
    const response = computeResponse({ Key, source, thumbnail, title });

    cache.set(Key, response);
    cache.set(url, Key);
    cache.set(source, Key);

    const fileStream = createReadStream(outputFileName);
    return s3.upload({
      Key,
      Body: fileStream,
      ACL: 'public-read',
      ContentType: 'audio/mpeg',
      ContentDisposition: 'attachment',
      Tagging: `requester=${(req.headers['x-forwarded-for'] || '').split(',')[0] || req.connection.remoteAddress}`,
      Metadata: {
        source,
        thumbnail,
        title: encodeURI(title),
      },
    })
      .promise()
      .then(() => send(res, 200, response))
      .catch(err => send(res, 500, err))
      .then(() => unlinkSync(outputFileName));
  }
});
