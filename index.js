const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { existsSync, statSync, createReadStream } = require('fs');
const { send, json } = require('micro');

module.exports = async (req, res) => {
  await exec('./bin/youtube-dl -U');

  const { url } = await json(req);
  const { stdout: filename } = await exec(`./bin/youtube-dl -o './out/%(title)s.%(ext)s' --get-filename --restrict-filenames ${url}`);
  const { dir, name } = path.parse(filename);
  const outputFileName = `${path.join(dir, name)}.mp3`;

  if (!existsSync(outputFileName)) {
    const { stdout, stderr } = await exec(`./bin/youtube-dl -o './out/%(title)s.%(ext)s' --restrict-filenames --add-metada --extract-audio --audio-format mp3 --audio-quality 0 "${url}"`);

    if (stderr !== '') {
      send(res, 500, stderr);
    }
  }

  const outputFileStat = statSync(outputFileName);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', outputFileStat.size);

  return send(res, 200, createReadStream(outputFileName));
};
