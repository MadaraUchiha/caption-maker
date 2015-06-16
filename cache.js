import fs from 'fs';
import {parse} from 'csv';
import {promisify} from 'bluebird';

let parseAsync = promisify(parse);

export class Cache {
    constructor(file) {
        this.file = file;
        this.cache = new Map();
    }

    static fromCsvFile(file) {
        let cacheInstance = new Cache(file);
        fs.readFileAsync('cache.csv', {flag: 'a+'})
            .then(parseAsync)
            .then(parsed => {
                debugger;
                cacheInstance.cache = parsed.reduce((map, row) => map.set(row[0], row[1]), new Map());
                return Promise.resolve();
            })
            .then(() => console.log('Cache is ready!'));
        return cacheInstance;
    }

    get(hash) {
        return this.cache.get(hash);
    }

    set(hash, link) {
        this.cache.set(hash, link);
        return fs.appendFileAsync(this.file, hash+","+link+"\n")
    }
}