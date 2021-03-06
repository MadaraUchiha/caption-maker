import Promise from 'bluebird';
import express from 'express';
import {json, urlencoded} from 'body-parser';
import request from 'request';
import sizeOf from 'image-size';
import del from 'del';
import imgur from 'imgur';
import gm from 'gm';

import fs from 'fs';
import url from 'url';
import crypto from 'crypto';

import {Cache} from './cache';

Promise.longStackTraces();

let delAsync = Promise.promisify(del);

let app = express();

Promise.promisifyAll(request);
Promise.promisifyAll(fs);
Promise.promisifyAll(gm.prototype);

let targetDir = process.env.CAPTION_MAKER_TARGET_DIR || "target";
let cache = Cache.fromCsvFile('cache.csv');

app.use(json());
app.use(urlencoded({extended: false}));
app.post('/', function handlePost(req, res, next) {
    try {
        console.log(req.body);

        req.body.top = req.body.top.toUpperCase();
        req.body.bottom = req.body.bottom.toUpperCase();

        let sha = sha1(JSON.stringify(req.body));
        console.log("SHA1:", sha);
        if (cache.get(sha)) {
            console.log("Getting from cache:", cache.get(sha));
            res.end(cache.get(sha));
            return;
        }
        req.sha = sha;

        req.location = `./${targetDir}/${sha}`;
        req.linkPromise = main(req).catch(next);

        if (req.body.websocket === undefined) {
            req.linkPromise.then(res.end.bind(res));
        }
        else {
            console.log('Coming soon!');
        }
    } catch (err) {
        next(err);
    }
});

async function main(req) {
    console.log("Fetching image");
    await fetchImage(req.body.uri, req.location);
    console.log("Done. Adding text");
    await addText(req.location, req.body.top, req.body.bottom);
    console.log("Done. Uploading to imgur");
    let json = await imgur.uploadFile(`${req.location}/output`);
    console.log("Done. Imgur link", json.data.link, "Adding to cache");
    cache.set(req.sha, json.data.link);
    console.log("Removing from filesystem");
    await delAsync(req.location);
    return json.data.link;
}

app.use(function(error, req, res, next) {
    console.error(error.stack);
    console.error(`Removing ${req.location}`);
    res.status(500).end(error.message);
    delAsync(req.location);
});

app.get('/', (req, res) => fs.readFileAsync('index.html', {encoding: 'utf8'}).then(data => res.end(data)));

async function fetchImage(uri, location) {
    console.log("Saving to", location);
    await fs.mkdirAsync(location);
    return new Promise((resolve, reject) => {
        let stream = request(uri).pipe(fs.createWriteStream(`${location}/input`));
        stream.on('error', reject);
        stream.on('close', resolve);
    })
}

function getTextSizes(width, height, topText, bottomText) {
    let maxTextWidth = width * 1.5;
    let maxTextHeight = height * 0.2;
    let maxLetterHeightPt = maxTextHeight * 1.25; // Px size is 80% of pt size

    let topMaxLetterWidthPx = maxTextWidth / topText.length;
    let topMaxLetterWidthPt = topMaxLetterWidthPx * 1.33; // Px size is 75% of pt size
    let topPtSize = Math.min(maxLetterHeightPt, topMaxLetterWidthPt);

    let bottomMaxLetterWidthPx = maxTextWidth / bottomText.length;
    let bottomMaxLetterWidthPt = bottomMaxLetterWidthPx * 1.33; // Px size is 75% of pt size
    let bottomPtSize = Math.min(maxLetterHeightPt, bottomMaxLetterWidthPt);

    return {topPtSize: topPtSize, bottomPtSize: bottomPtSize};
}

async function addText(location, topText, bottomText) {
    let {width, height} = sizeOf(`${location}/input`);
    let {topPtSize, bottomPtSize} = getTextSizes(width, height, topText, bottomText);
    await fs.mkdirAsync(`${location}/images`);
    await gm(`${location}/input`)
        .coalesce()
        .writeAsync(`${location}/output`);
    return gm(`${location}/output`)
        .fill("white")
        .stroke("black")
        .font("/usr/share/fonts/truetype/msttcorefonts/Impact.ttf")
        .pointSize(topPtSize)
        .drawText(0, (topPtSize * .8) + 20, topText.toUpperCase(), "North") // topPtSize * .8 == Letter height in px
        .pointSize(bottomPtSize)
        .drawText(0, 20, bottomText.toUpperCase(), "South")
        .writeAsync(`${location}/output`);
}

function sha1(string) {
    let hash = crypto.createHash('sha1');
    hash.update(string);
    return hash.digest('hex');
}

let server = app.listen(process.env.CAPTION_MAKER_PORT || 8080, () => {
    del(`${targetDir}/*`);
    console.log("Server running!")
});
