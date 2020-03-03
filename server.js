'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const dirPath = process.argv[2];
const PORT = process.argv[3];

console.log('port = ' + PORT);

http.createServer((req, res) =>
{
	let url = req.url.split('?');
	let filePath = url[0];
	let paramsGet = parseGetString(url[1]);
	filePath = path.join(dirPath, filePath);
	console.log(filePath);
	answer(res, filePath, paramsGet);
}).listen(PORT);

function parseGetString(getStr)
{
	let paramsGet;
	if (getStr)
	{
		paramsGet = {};
		let params = getStr.split('&');
		params.forEach((p) =>
			{
				let keyVal = p.split('=');
				paramsGet[keyVal[0]] = keyVal[1];
			});
	}
	return paramsGet;
}

function answer(res, filePath, params)
{
	if (!params) 
	{
		sendFile(res, filePath);
	}
	else
	{
		sendFile(res, filePath);
		//Сделать что-то с параметрами.
		//res.writeHead(500);
		//res.end(JSON.stringify(params)); 
		console.log(params);
	}
}

/*Обычная отправка считанного файла без использования файловых потоков.
function sendFile(res, filePath)
{
	let file = fs.readFile(filePath, (err, data) =>
	{
		if (err)
		{
			console.log(filePath + ' not found');
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
	});
}
*/

//Отправка файлов с использованием файловых потоков.
function sendFile(res, filePath)
{
	fs.stat(filePath, (err, stats) =>
			{
				if (err)
				{
					error(err);
				}
				else if (stats.isDirectory()) 
				{
					filePath = path.join(filePath, 'index.html');
				}
				fs.stat(filePath, (err, stats) =>
					{
						if(err)
						{
							error(err);
						}
						else
						{
							let file = fs.ReadStream(filePath);
							file.pipe(res);
							file.on('error', (err) => error(err));
							let size = stats.size;
							res.writeHead(200, 
							{
								'Content-Length': size,
								'Content-Type': getContentType(path.extname(filePath))
							});
							res.on('close', () => 
								{
									if (!res.writableFinished)
									{
										file.destroy();
										console.log('Conection lost: ' + filePath);
									}
								});
							res.on('finish', () =>
								{
									console.log('Sent successfully: ' + filePath);
								});

						}
					});
			});
	function error(err)
	{
		console.log('Not found: ' + filePath + ' ' + err);
		res.writeHead(404);
		res.end('404 Not Found');
	}
}

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
