const http = require('http');
const fs = require('fs').promises;
const path = require("path");
const server = http.createServer();

const MIME_TYPES = {
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.html': 'text/html'
}

server.on('request', async (req, res)=>{
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ext = path.extname(url.pathname)
    try {
        const body = await fs.readFile(path.join(__dirname, url.pathname))
        res.writeHead(200, {
            'Content-Length': body.length,
            "Content-Type": MIME_TYPES[ext]
        }).end(body)
    } catch (e) {
        console.error(e)
        if (e.code == "ENOENT" || e.code == "EPERM") {
            res.writeHead(400, e.code).end()
        } else {
            res.writeHead(500, e.toString()).end()
        }
    }
})

server.listen(3000, ()=>console.log("Listening..."))