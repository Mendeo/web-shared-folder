'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const ROOT_PATH = process.argv[2]; //Папка относительно которой будут задаваться все папки, которые идут с адресом
const PORT = process.argv[3];

console.log('port = ' + PORT);

let _lastReqTime = new Date(0);

http.createServer((req, res) =>
{
	let now = new Date();
	if (now - _lastReqTime > 1000) console.log('*******' + now.toLocaleString('ru-RU', {hour: 'numeric', minute: 'numeric', second: 'numeric'}) + '*******');
	_lastReqTime = now;
	let url = req.url.split('?');
	let urlPath = url[0];
	console.log('url: ' + urlPath);
	let paramsGet = parseRequest(url[1]);
	/*Post данные*/
	let paramsPost;
	let data = [];
	req.on('data', chunk => 
	{
		data.push(chunk);
	});
	req.on('end', () =>
	{
		paramsPost = parseRequest(data.join());
		answer(res, urlPath, paramsGet, paramsPost);
	});
}).listen(PORT);

function parseRequest(data)
{
	let params;
	if (data)
	{
		params = {};
		data = data.split('&');
		data.forEach((p) =>
			{
				let keyVal = p.split('=');
				params[keyVal[0]] = keyVal[1];
			});
	}
	return params;
}

function answer(res, urlPath, paramsGet, paramsPost)
{

	sendFileByUrl(res, urlPath);
	if (paramsGet) console.log(paramsGet);
	if (paramsPost) console.log(paramsPost);
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

//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath)
{
	let filePath = path.join(ROOT_PATH, urlPath);	
	fs.stat(filePath, (err, stats) =>
			{
				if (err)
				{
					error(err, res);
				}
				else if (stats.isDirectory()) 
				{
					filePath = path.join(filePath, 'index.html');
					fs.stat(filePath, (err, stats) =>
						{
							if (err)
							{
								error(err, res);
							}
							else
							{
								sendFile(res, filePath, stats.size);
							}
						});

				}
				else
				{
					sendFile(res, filePath, stats.size);
				}
			});
	
}

function error(err, res)
{
	console.log('Not found: ' + err);
	res.writeHead(404);
	res.end('404 Not Found');
}
//Отправка файлов с использованием файловых потоков.
function sendFile(res, filePath, size)
{
	let file = fs.ReadStream(filePath);
	file.pipe(res);
	file.on('error', (err) => error(err, res));
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

function getContentType(ext)
{
	//Взял из настроек nginx
	if (ext === '.html' || ext === '.htm' || ext === '.shtml') return 'text/html';
	if (ext === '.css') return 'text/css';
	if (ext === '.xml') return 'text/xml';
	if (ext === '.gif') return 'image/gif';
	if (ext === '.jpeg' || ext === '.jpg') return 'image/jpeg';
	if (ext === '.js') return 'application/javascript';
	if (ext === '.atom') return 'application/atom+xml';
	if (ext === '.rss') return 'application/rss+xml';
	if (ext === '.mml') return 'text/mathml';
	if (ext === '.txt') return 'text/plain';
	if (ext === '.jad') return 'text/vnd.sun.j2me.app-descriptor';
	if (ext === '.wml') return 'text/vnd.wap.wml';
	if (ext === '.htc') return 'text/x-component';
	if (ext === '.png') return 'image/png';
	if (ext === '.svg' || ext === '.svgz') return 'image/svg+xml';
	if (ext === '.tif' || ext === '.tiff') return 'image/tiff';
	if (ext === '.wbmp') return 'image/vnd.wap.wbmp';
	if (ext === '.webp') return 'image/webp';
	if (ext === '.ico') return 'image/x-icon';
	if (ext === '.jng') return 'image/x-jng';
	if (ext === '.bmp') return 'image/x-ms-bmp';
	if (ext === '.woff') return 'font/woff';
	if (ext === '.woff2') return 'font/woff2';
	if (ext === '.jar' || ext === '.war' || ext === '.ear') return 'application/java-archive';
	if (ext === '.json') return 'application/json';
	if (ext === '.hqx') return 'application/mac-binhex40';
	if (ext === '.doc') return 'application/msword';
	if (ext === '.pdf') return 'application/pdf';
	if (ext === '.ps' || ext === '.eps' || ext === '.ai') return 'application/postscript';
	if (ext === '.rtf') return 'application/rtf';
	if (ext === '.m3u8') return 'application/vnd.apple.mpegurl';
	if (ext === '.kml') return 'application/vnd.google-earth.kml+xml';
	if (ext === '.kmz') return 'application/vnd.google-earth.kmz';
	if (ext === '.xls') return 'application/vnd.ms-excel';
	if (ext === '.eot') return 'application/vnd.ms-fontobject';
	if (ext === '.ppt') return 'application/vnd.ms-powerpoint';
	if (ext === '.odg') return 'application/vnd.oasis.opendocument.graphics';
	if (ext === '.odp') return 'application/vnd.oasis.opendocument.presentation';
	if (ext === '.ods') return 'application/vnd.oasis.opendocument.spreadsheet';
	if (ext === '.odt') return 'application/vnd.oasis.opendocument.text';
	if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
	if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
	if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	if (ext === '.wmlc') return 'application/vnd.wap.wmlc';
	if (ext === '.7z') return 'application/x-7z-compressed';
	if (ext === '.cco') return 'application/x-cocoa';
	if (ext === '.jardiff') return 'application/x-java-archive-diff';
	if (ext === '.jnlp') return 'application/x-java-jnlp-file';
	if (ext === '.run') return 'application/x-makeself';
	if (ext === '.pl' || ext === '.pm') return 'application/x-perl';
	if (ext === '.prc' || ext === '.pdb') return 'application/x-pilot';
	if (ext === '.rar') return 'application/x-rar-compressed';
	if (ext === '.rpm') return 'application/x-redhat-package-manager';
	if (ext === '.sea') return 'application/x-sea';
	if (ext === '.swf') return 'application/x-shockwave-flash';
	if (ext === '.sit') return 'application/x-stuffit';
	if (ext === '.tcl' || ext === '.tk') return 'application/x-tcl';
	if (ext === '.der' || ext === '.pem' || ext === '.crt') return 'application/x-x509-ca-cert';
	if (ext === '.xpi') return 'application/x-xpinstall';
	if (ext === '.xhtml') return 'application/xhtml+xml';
	if (ext === '.xspf') return 'application/xspf+xml';
	if (ext === '.zip') return 'application/zip';
	if (ext === '.bin' || ext === '.exe' || ext === '.dll') return 'application/octet-stream';
	if (ext === '.deb') return 'application/octet-stream';
	if (ext === '.dmg') return 'application/octet-stream';
	if (ext === '.iso' || ext === '.img') return 'application/octet-stream';
	if (ext === '.msi' || ext === '.msp' || ext === '.msm') return 'application/octet-stream';
	if (ext === '.mid' || ext === '.midi' || ext === '.kar') return 'audio/midi';
	if (ext === '.mp3') return 'audio/mpeg';
	if (ext === '.ogg') return 'audio/ogg';
	if (ext === '.m4a') return 'audio/x-m4a';
	if (ext === '.ra') return 'audio/x-realaudio';
	if (ext === '.3gpp' || ext === '.3gp') return 'video/3gpp';
	if (ext === '.ts') return 'video/mp2t';
	if (ext === '.mp4') return 'video/mp4';
	if (ext === '.mpeg' || ext === '.mpg') return 'video/mpeg';
	if (ext === '.mov') return 'video/quicktime';
	if (ext === '.webm') return 'video/webm';
	if (ext === '.flv') return 'video/x-flv';
	if (ext === '.m4v') return 'video/x-m4v';
	if (ext === '.mng') return 'video/x-mng';
	if (ext === '.asx' || ext === '.asf') return 'video/x-ms-asf';
	if (ext === '.wmv') return 'video/x-ms-wmv';
	if (ext === '.avi') return 'video/x-msvideo';
}
