const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { unlinkSync, createReadStream } = require('fs');
const { send, json } = require('micro');
const AWS = require('aws-sdk');
const microCors = require('micro-cors');
const { accessKeyId, secretAccessKey, region } = require('./aws');

const cors = microCors({
  allowMethods: ['POST'],
  allowHeaders: ['Accept', 'Content-Type'],
  origin: 'https://www.yaas.tools',
});

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

module.exports = cors(async (req, res) => {
  await exec('./bin/youtube-dl --no-check-certificate -U');

  const { url } = await json(req);
  const { stdout: filename } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --get-filename --restrict-filenames ${url}`);
  const { dir, name } = path.parse(filename);
  const outputFileName = `${path.join(dir, name)}.mp3`;
  const Key = path.basename(outputFileName);

  try {
    await s3.headObject({ Key }).promise();

    return send(res, 200, `https://s3-eu-west-1.amazonaws.com/yaas/${Key}`);
  } catch (e) {
    const { stderr } = await exec(`./bin/youtube-dl --no-check-certificate -o './out/%(title)s.%(ext)s' --restrict-filenames --add-metada --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`);

    if (stderr !== '') {
      send(res, 500, stderr);
    }

    const fileStream = createReadStream(outputFileName);

    return s3.upload({
      Key,
      Body: fileStream,
      ACL: 'public-read',
    })
      .promise()
      .then(data => send(res, 200, data.Location))
      .catch(err => send(res, 500, err))
      .then(() => unlinkSync(outputFileName));
  }
});
