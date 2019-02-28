"use strict";
global.__NEXT_DATA__ = {
    nextExport: true
};
const { extname, join, dirname, sep } = require('path');
const mkdirp = require('mkdirp-then');
const { renderToHTML } = require('next-server/dist/server/render');
const { writeFile, removeSync } = require('fs-extra');
const Sema = require('async-sema');
const { loadComponents } = require('next-server/dist/server/load-components');
const envConfig = require('next-server/config');
const nextRouter = require('next/router');
const routes = require('./routes');
const sema = new Sema(1, { capacity: 10 });

async function render(r, action, id, {distDir, buildId, outDir, renderOpts, serverRuntimeConfig}) {
    const query = (id) ? {id} : {};
    const url = r.getAs(query);
    const req = { url };
    const res = {};
    envConfig.setConfig({
        serverRuntimeConfig,
        publicRuntimeConfig: renderOpts.runtimeConfig
    });
    let htmlFilename = `${url}${sep}index.html`;
    if (extname(r.page) !== '') {
        // If the path has an extension, use that as the filename instead
        htmlFilename = r.page;
    }
    else if (r.page === '/') {
        // If the path is the root, just use index.html
        htmlFilename = 'index.html';
    }
    const baseDir = join(outDir, dirname(htmlFilename));
    const htmlFilepath = join(outDir, htmlFilename);
    if (action === 'del' && id) {
        removeSync(baseDir);
        return;
    }
    await mkdirp(baseDir);
    routes.Router.router = {
        asPath: url,
        pathname: r.page,
        route: r.page,
        query
    };
    const components = await loadComponents(distDir, buildId, r.page);
    const html = await renderToHTML(req, res, r.page, query, Object.assign({}, components, renderOpts));
    await new Promise((resolve, reject) => writeFile(htmlFilepath, html, 'utf8', err => (err ? reject(err) : resolve())));
}

process.on('message', async ({ action, group, ids, ...rest }) => {
    try {
        await sema.acquire();
        const rs = routes.routes.filter((p) => !group || p.groups && p.groups.indexOf(group) > -1);
        const w = rs.map((r) => new Promise(async (resolve) => {
            if (ids && r.keyNames.indexOf('id') > -1) {
                ids.forEach(async (id) => {
                    await render(r, action, id, rest);
                });
            } else {
                const url = r.getAs({});
                await render(r, action, null, rest);
            }
            resolve();
        }));
        await Promise.all(w);
        process.send({ type: 'done' });
    } catch (err) {
        console.error(err);
        process.send({ type: 'error', payload: err });
    } finally {
        sema.release();
    }
});
