'use strict';
const PORT =3128;
const http = require('http');
const path = require('path');
const fs = require('fs');
const dirPath = process.argv[2];

if (!path.isAbsolute(dirPath)) path.join(__dirname, dirPath);

function getContentType(ext)
{
	//Text
	if (ext == '.html') return 'text/html';
	if (ext == '.txt') return 'text/plain';
	if (ext == '.css') return 'text/css';
	if (ext == '.js') return 'text/javascript';
	if (ext == '.csv') return 'text/csv';
	
	//Application
	if (ext == '.pdf') return 'application/pdf';
	if (ext == '.zip') return 'application/zip';
	
	//Images
	if (ext == '.apng') return 'image/apng';
	if (ext == '.bmp') return 'image/bmp';
	if (ext == '.gif') return 'image/gif';
	if (ext == '.ico' || ext == '.cur') return 'image/x-icon';
	if (ext == '.jpg' || ext == '.jpeg' || ext == '.jfif' || ext == '.pjpeg' || ext == '.pjp') return 'image/jpeg';
	if (ext == '.png') return 'image/png';
	if (ext == '.svg') return 'image/svg+xml';
	if (ext == '.tif' || ext == '.tiff') return 'image/tiff';
	if (ext == '.webp') return 'image/webp';
	return 'application/octet-stream';
}

http.createServer((req, res) =>
{
	let url = req.url;
	if (url === '/') url = 'index.html';
	let filePath = path.join(dirPath, url);
	console.log(filePath);
	let file = fs.readFile(filePath, (err, data) =>
	{
		if (err)
		{
			console.log(req.url + ' not found');
			res.writeHead(500);
			res.end('Internal sever error');
		}
		else
		{
			res.writeHead(200, 
			{
				'Content-Length': Buffer.byteLength(data),
				'Content-Type': getContentType(path.extname(filePath))
			});
			res.end(data);
		}
	})
}).listen(PORT);
