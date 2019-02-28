const nextExport = require('next/dist/export');
const tmp = require('tmp');
const fs = require('fs-extra');
const childproc = require("child_process");
const net = require('net');
const id = process.argv.length > 2 && process.argv[2];
const tmpobj = tmp.dirSync(); // gets cleaned automatically on exit
const nextConfig = require("next-server/next-config");
const config = nextConfig('phase-export', process.cwd());

let port_no = 34500;

const worker = childproc.fork(require.resolve('./worker'), [], {
    env: process.env
});

const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8');

const renderOpts = {
    dir: process.cwd(),
    buildId,
    nextExport: true,
    assetPrefix: '',
    distDir: process.cwd() + '/.next',
    dev: false,
    staticMarkup: false,
    hotReloader: null,
    outDir: process.cwd() + '/out',
};

const pagesManifestData = fs.readFileSync('.next/server/pages-manifest.json', 'utf8');
const pagesManifest = JSON.parse(pagesManifestData);
const defaultPathMap = Object.keys(pagesManifest).reduce((acc, page) => {
    switch (page) {
        case '/_document':
        case '/_app':
            return acc;
        case '/_error':
            return {...acc, '/404.html': { page }};
    }
    return {...acc, [page]: { page }};
}, {});

if (typeof config.exportPathMap !== 'function') {
    config.exportPathMap = async (defaultMap) => {
        return defaultMap;
    };
}
let pathMap = null
const conf = {
    distDir: renderOpts.distDir,
    buildId: renderOpts.buildId,
    outDir: renderOpts.outDir,
    concurrency: 1,
    renderOpts,
};

async function generate({action, group, ids}, socket) {
    if (pathMap == null) {
        pathMap = await config.exportPathMap(defaultPathMap, {
            dev: false,
            distDir: renderOpts.distDir,
            buildId: renderOpts.buildId,
            outDir: renderOpts.outDir,
        });
    }
    console.log(`working ${action} for group "${group}" on ids`, ids);
    const w = new Promise((resolve, reject) => {
        const handler = async ({type, payload}) => {
            switch (type) {
                case 'done':
                    resolve();
                    worker.removeListener('message', handler);
                    break;
                case 'error':
                    reject(payload);
                    worker.removeListener('message', handler);
                    break;
            }
        };
        worker.on('message', handler);
        worker.send({
            ...conf,
            group: group === 'all' ? null : group,
            action,
            ids,
        });
    });
    try {
        await w;
        return ({success: true, error: null});
    } catch (e) {
        return ({success: false, error: e});
    }
}

const states = {
    INLEN: 0,
    INBUF: 1,
};

const server = net.createServer((socket) => {
    socket.setKeepAlive(false);
    let state = states.INLEN;
    let buf = Buffer.alloc(0);
    let inlen = 0;
    const processBuf = async () => {
        try {
            while (true) {
                switch (state) {
                    case states.INLEN:
                        if (buf.length < 4) {
                            return;
                        }
                        inlen = buf.readIntBE(0, 4);
                        buf = buf.slice(4);
                        state = states.INBUF;
                        break;
                    case states.INBUF:
                        if (buf.length < inlen) {
                            return;
                        }
                        const str = buf.toString('utf8', 0, inlen);
                        const json = JSON.parse(str);
                        state = states.OUTLEN;
                        const reply = await generate(json, socket);
                        const jstr = JSON.stringify(reply);
                        const outlen = Buffer.alloc(4);
                        outlen.writeInt32BE(jstr.length, 0);
                        socket.write(outlen);
                        socket.write(jstr);
                        socket.end();
                        socket.destroy();
                        return;
                    default:
                        return;
                }
            }
        } catch (e) {
            console.error(e);
            socket.end();
            socket.destroy();
        }
    }
    socket.on('data', async (b) => {
        buf = Buffer.concat([buf, b]);
        await processBuf();
    });
});

if (process.argv.length > 2) {
    generate({group: process.argv[2], ids: process.argv.slice(3)}).then(() => new Promise(async (resolve) => {
        if (fs.existsSync(process.cwd() + '/static')) {
            console.log('  copying "static" directory');
            await fs.copySync(process.cwd() + '/static', renderOpts.outDir);
        }
        if (fs.existsSync(renderOpts.distDir + '/static')) {
            console.log('  copying "static build" directory');
            await fs.copySync(renderOpts.distDir + '/static', renderOpts.outDir + '/_next/static');
        }
        resolve();
    })).then(() => process.exit());
} else {
    console.log('listening on ' + port_no);
    server.listen(port_no, '0.0.0.0');
}
