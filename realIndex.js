// Created by madara all rights reserved.

import Promise from 'bluebird';
import express from 'express';
import {json, urlencoded} from 'body-parser';
import request from 'request';
import sizeOf from 'image-size';
import del from 'del';
import imgur from 'imgur';

import {exec} from 'child_process';
import fs from 'fs';
import url from 'url';

let execAsync = Promise.promisify(exec);
let delAsync = Promise.promisify(del);

let app = express();

Promise.promisifyAll(request);
Promise.promisifyAll(fs);

app.use(json());
app.use(urlencoded({extended: false}));
app.post('/', async function handlePost(req, res) {
    console.log(req.body);
    let {location, extension} = await fetchImage(req.body.uri);
    await (extension === 'gif' ? addTextGif(location, extension, req.body.top, req.body.bottom) : addText(location, extension, req.body.top, req.body.bottom));
    let json = await imgur.uploadFile(`${location}/output.${extension}`);
    res.end(json.data.link);
});

app.get('/', (req, res) => fs.readFileAsync('index.html', {encoding: 'utf8'}).then(data => res.end(data)));

async function fetchImage(uri, location = "./target") {
    await delAsync(`${location}/*`);
    let path = url.parse(uri).path;
    let parts = path.split('.');
    let extension = parts[parts.length - 1];
    await new Promise((resolve, reject) => {
        request(uri)
            .pipe(fs.createWriteStream(`${location}/input.${extension}`))
            .on('close', resolve)
            .on('error', reject);
    });
    return {location, extension};
}

function getTextSizes(width, height, topText, bottomText) {
    let maxTextWidth = width * 1.5;
    let maxTextHeight = height * 0.1;
    let maxLetterHeightPt = maxTextHeight * 1.25; // Px size is 80% of pt size

    let topMaxLetterWidthPx = maxTextWidth / topText.length;
    let topMaxLetterWidthPt = topMaxLetterWidthPx * 1.33; // Px size is 75% of pt size
    let topPtSize = Math.min(maxLetterHeightPt, topMaxLetterWidthPt);

    let bottomMaxLetterWidthPx = maxTextWidth / bottomText.length;
    let bottomMaxLetterWidthPt = bottomMaxLetterWidthPx * 1.33; // Px size is 75% of pt size
    let bottomPtSize = Math.min(maxLetterHeightPt, bottomMaxLetterWidthPt);

    return {topPtSize: topPtSize, bottomPtSize: bottomPtSize};
}

function addText(location, extension, topText, bottomText) {
    let {width, height} = sizeOf(`${location}/input.${extension}`);
    let {topPtSize, bottomPtSize} = getTextSizes(width, height, topText, bottomText);
    return execAsync(`convert -font "Impact" -fill white -stroke black \
     -pointsize ${topPtSize} -gravity north -draw "text 0,20 '${topText}'" \
     -pointsize ${bottomPtSize} -gravity south -draw "text 0,20 '${bottomText}'" \
     ${location}/input.${extension} ${location}/output.${extension}`);
}

async function addTextGif(location, extension, topText, bottomText) {
    let {width, height} = sizeOf(`${location}/input.${extension}`);
    let {topPtSize, bottomPtSize} = getTextSizes(width, height, topText, bottomText);
    await fs.mkdirAsync(`${location}/images`);
    let [stdout,] = await execAsync(`identify -verbose ${location}/input.${extension} | grep -i delay`);
    let animationDelay = stdout.split('\n')[0].replace(/.+Delay: /, "");
    await execAsync(`convert -coalesce ${location}/input.${extension} ${location}/images/input_%06d.${extension}`);
    await execAsync(`mogrify -font "Impact" -fill white -stroke black \
                     -pointsize ${topPtSize} -gravity north -draw "text 0,20 '${topText}'" \
                     -pointsize ${bottomPtSize} -gravity south -draw "text 0,20 '${bottomText}'" \
                     ${location}/images/*`);
    return execAsync(`convert -delay ${animationDelay} -loop 0 ${location}/images/input_* ${location}/output.${extension}`);
}
let server = app.listen(8080, () => console.log("Server running!"));

//fetchImage("https://i.imgur.com/zekdGh4.png", ".").then(console.log);