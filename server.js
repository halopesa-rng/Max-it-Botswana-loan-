const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'public');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg'};
http.createServer((req,res)=>{
  const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
  });
}).listen(process.env.PORT || 3000,()=>console.log('Independent demo running on port '+(process.env.PORT||3000)));
