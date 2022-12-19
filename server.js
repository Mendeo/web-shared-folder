#!/usr/bin/env node

/*
The MIT License (MIT)

Copyright (c) Aleksandr Meniailo, Mendeo 2022 (thesolve@mail.ru, deorathemen@gmail.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict';
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const JSZip = require('jszip');
const cpus = os.cpus;
const net = os.networkInterfaces();

const USE_CLUSTER_MODE = Number(process.env.SERVER_USE_CLUSTER_MODE);
const SHOULD_RESTART_WORKER = Number(process.env.SERVER_SHOULD_RESTART_WORKER);
const DIRECTORY_MODE = Number(process.env.SERVER_DIRECTORY_MODE);
const DIRECTORY_MODE_TITLE = process.env.SERVER_DIRECTORY_MODE_TITLE;
const AUTO_REDIRECT_HTTP_PORT = Number(process.env.SERVER_AUTO_REDIRECT_HTTP_PORT);
const DISABLE_COMPRESSION = Number(process.env.SERVER_DISABLE_COMPRESSION);
const UPLOAD_ENABLE = Number(process.env.SERVER_UPLOAD_ENABLE);

let ICONS_TYPE = process.env.SERVER_ICONS_TYPE;

const MAX_FILE_LENGTH = 2147483647;
const MAX_STRING_LENGTH = require('buffer').constants.MAX_STRING_LENGTH;

const DEFAULT_ICON_TYPE = 'square-o';
if (!ICONS_TYPE)
{
	ICONS_TYPE = DEFAULT_ICON_TYPE;
}
else
{
	if (ICONS_TYPE !== 'square-o' && ICONS_TYPE !== 'classic' && ICONS_TYPE !== 'vivid')
	{
		console.log(`Icon type ${ICONS_TYPE} not found. Using ${DEFAULT_ICON_TYPE}.`);
		ICONS_TYPE = DEFAULT_ICON_TYPE;
	}
}

const DEFAULT_LANG = 'en-US';
let DEFAULT_LOCALE_TRANSLATION = null;

let cluster;
if (USE_CLUSTER_MODE)
{
	cluster = require('cluster');
}
else
{
	cluster = { isPrimary: true };
}

const ROOT_PATH_RAW = (process.argv[2] || process.env.SERVER_ROOT);
const ROOT_PATH = ROOT_PATH_RAW ? ROOT_PATH_RAW.replace(/"/g, '') : null; //Папка относительно которой будут задаваться все папки, которые идут с адресом
const PORT = Number(process.argv[3] || process.env.SERVER_PORT);
const key = process.argv[4] || process.env.SERVER_KEY;
const cert = process.argv[5] || process.env.SERVER_CERT;
const username = process.argv[6] || process.env.SERVER_USERNAME;
const password = process.argv[7] || process.env.SERVER_PASSWORD;

if (!ROOT_PATH || !PORT)
{
	console.log(`Convenient http server on nodejs. Designed to share some folder on a local network or even on the Internet.
It can also be used as a web server to serve static sites.

Usage:
web-shared-folder <path to the folder for sharing> <port> [<key> <cert>] [<username> <password>]

If there is the "index.html" file in the specified folder, then the server will start in the static web site mode, not in the folder viewing mode.
The folder contents viewing mode can be forced by setting the environment variable SERVER_DIRECTORY_MODE=1.
Also, this mode can be forcibly disabled by setting SERVER_DIRECTORY_MODE=0.

In order to start the server to work over https, you must specify the path to the private key file (<key>) and the path to the certificate file (<cert>).
In https mode, it is possible to enable automatic redirection from http to https.
To do this, in the SERVER_AUTO_REDIRECT_HTTP_PORT environment variable, specify the port number from which the redirection will be performed (usually 80).

If the keys <username> and <password> are given, then HTTP authentication is enabled with the given login and password.

All command line options can also be set in the environment variables: SERVER_ROOT, SERVER_PORT, SERVER_KEY, SERVER_CERT, SERVER_USERNAME, SERVER_PASSWORD.
Options specified on the command line have higher precedence.

In order to allow users not only download files and folders from server, but also upload it to the server, it is necessary to set the environment variable SERVER_UPLOAD_ENABLE to 1.
In particular, in this mode, the user can upload a zip archive to the server and then unzip it by clicking on the unzip icon.

You can set the page title in the SERVER_DIRECTORY_MODE_TITLE environment variable.

It is possible to run server in cluster mode. To do this, set the SERVER_USE_CLUSTER_MODE environment variable to 1.
In cluster mode, nodejs child processes will be created according to the number of processor cores.
This mode allows you to use all the processor resources, but at the same time it increases the consumption of RAM.
If SERVER_SHOULD_RESTART_WORKER=1 is given, the child process will be automatically restarted if it terminates unexpectedly.

By default, the server returns the contents of the web page in a compressed form.
If you want to disable this behavior, you can set SERVER_DISABLE_COMPRESSION=1

The server uses the "file-icon-vectors" npm package (https://www.npmjs.com/package/file-icon-vectors) to display file icons.
Three types of icons are available: "classic", "square-o", "vivid" (see the package page for more details).
You can set the SERVER_ICONS_TYPE environment variable to one of these values. The default is "square-o".`);
	process.exit(0);
}

const numCPUs = cpus().length;
if (cluster.isPrimary)
{
	console.log('Port = ' + PORT);
	console.log('Root = ' + ROOT_PATH);
	if (USE_CLUSTER_MODE) console.log('CPUs number = ' + numCPUs);
	console.log();
	console.log('Available on:');
	getIpV4().forEach((ip) => console.log(ip));
	console.log();
}

function getIpV4()
{
	const ips = [];
	for (let iface in net)
	{
		const ifaceData = net[iface];
		if (Array.isArray(ifaceData) && ifaceData.length > 0)
		{
			for (let ip of ifaceData)
			{
				if (ip.family === 'IPv4' || Number(ip.family) === 4)
				{
					ips.push(ip.address);
				}
			}
		}
	}
	return ips;
}

let _generateIndex = false;
let _indexHtmlbase = null;
let _favicon = null;
let _index_js = null;
let _index_css = null;
let _robots_txt = null;
let _locales = null;
let _icons_css = null;
let _icons_svg_map = new Map();
let _icons_catalog = new Set();

fs.stat(ROOT_PATH, (err, stats) =>
{
	if (err)
	{
		console.log(err?.message);
		process.exit(1);
	}
	else if (stats.isFile())
	{
		console.log('Переданный путь не является директорией!');
		process.exit(1);
	}
	else
	{
		if (!isNaN(DIRECTORY_MODE))
		{
			_generateIndex = DIRECTORY_MODE > 0;
		}
		else
		{
			let indexFile = path.join(ROOT_PATH, 'index.html');
			_generateIndex = !fs.existsSync(indexFile);
		}
		if (_generateIndex)
		{
			if (cluster.isPrimary)
			{
				console.log('Directory watch mode.');
				if (DISABLE_COMPRESSION) console.log('Compression is disable.');
				if (UPLOAD_ENABLE) console.log('\x1b[31m%s\x1b[0m', 'Upload to server is enabled!');
			}
			_indexHtmlbase = fs.readFileSync(path.join(__dirname, 'app_files', 'index.html')).toString().split('~%~');
			_favicon = fs.readFileSync(path.join(__dirname, 'app_files', 'favicon.ico'));
			_index_js = fs.readFileSync(path.join(__dirname, 'app_files', 'index.js'));
			_index_css = fs.readFileSync(path.join(__dirname, 'app_files', 'index.css'));
			_robots_txt = fs.readFileSync(path.join(__dirname, 'app_files', 'robots.txt'));
			readIconsFiles();
			readTranslationFiles();
		}
		let isHttps = key && cert;
		if (cluster.isPrimary)
		{
			if (isHttps)
			{
				console.log('Start in https mode');
			}
			else
			{
				console.log('Start in http mode');
			}
			if (username && password) console.log('Using http authentication.');
			if (USE_CLUSTER_MODE)
			{
				console.log(`Primary ${process.pid} is running`);
				// Fork workers.
				for (let i = 0; i < numCPUs; i++)
				{
					cluster.fork();
				}
				cluster.on('exit', (worker, code, signal) =>
				{
					console.log(`Worker ${worker.process.pid} died. Code ${code}, signal: ${signal}`);
					if (SHOULD_RESTART_WORKER)
					{
						console.log('Restarting...');
						cluster.fork();
					}
				});
			}
			else
			{
				start(isHttps);
			}
		}
		else
		{
			console.log(`Worker ${process.pid} started`);
			start(isHttps);
		}
	}
});

function readIconsFiles()
{
	let pathCombined = path.join(__dirname, 'node_modules', 'file-icon-vectors', 'dist');
	_icons_css = fs.readFileSync(path.join(pathCombined, `file-icon-${ICONS_TYPE}.min.css`));
	pathCombined = path.join(pathCombined, 'icons', ICONS_TYPE);
	const iconFileNames = fs.readdirSync(pathCombined);
	for (let fileName of iconFileNames)
	{
		if (fileName === 'catalog.json')
		{
			const catalog = JSON.parse(fs.readFileSync(path.join(pathCombined, fileName)).toString());
			for (let ext of catalog)
			{
				_icons_catalog.add(ext);
			}
		}
		else
		{
			_icons_svg_map.set(`/icons/${ICONS_TYPE}/${fileName}`, fs.readFileSync(path.join(pathCombined, fileName)));
		}
	}
	_icons_svg_map.set('/icons/eye.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'eye.svg')));
	_icons_svg_map.set('/icons/unzip.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'unzip.svg')));
}

function readTranslationFiles()
{
	//Считываем файлы с локализациями.
	_locales = new Map();
	const localeDir = path.join(__dirname, 'app_files', 'locale');
	const localeFiles = fs.readdirSync(localeDir);
	for (let file of localeFiles)
	{
		const filePath = path.join(localeDir, file);
		_locales.set(path.basename(file, '.json'), JSON.parse(fs.readFileSync(filePath).toString()));
	}
	DEFAULT_LOCALE_TRANSLATION = _locales.get(DEFAULT_LANG);
}

let _lastReqTime = new Date(0);
let _lastIP = '';

function start(isHttps)
{
	if (isHttps)
	{
		const ssl_cert =
		{
			key: fs.readFileSync(key),
			cert: fs.readFileSync(cert)
		};
		https.createServer(ssl_cert, app).listen(PORT);
		if (AUTO_REDIRECT_HTTP_PORT)
		{
			http.createServer(redirectApp).listen(AUTO_REDIRECT_HTTP_PORT);
		}
	}
	else
	{
		http.createServer(app).listen(PORT);
	}
}

function redirectApp(req, res)
{
	const html = `<html>
<head><title>301 Moved Permanently</title></head>
<body><h1>301 Moved Permanently</h1></body>
</html>`;
	const urlArray = req.url.split('/');
	let tail = urlArray.slice(1).join('/');
	if (tail !== '')
	{
		if (tail[tail.length - 1] === '/')
		{
			tail = tail.slice(0, tail.length - 1);
		}
		if (tail !== '') tail = '/' + tail;
	}
	const url = `${urlArray[0]}:${PORT}${tail}`;
	const uri = `https://${req.headers.host}${url}`;
	console.log('Redirect to ' + uri);
	res.writeHead(301,
		{
			'Content-Type': 'text/html',
			'Content-Length': html.length,
			'Location': uri
		});
	res.end(html);
}

function app(req, res)
{
	let now = new Date();
	let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
	if (now - _lastReqTime > 1000 || _lastIP !== ip) console.log(`*******${ip}, ${now.toLocaleString('ru-RU', { hour: 'numeric', minute: 'numeric', second: 'numeric' })} *******`);
	_lastReqTime = now;
	_lastIP = ip;
	//Проводим аутентификацию
	if (username && password)
	{
		if (req.headers.authorization)
		{
			const data = req.headers.authorization.split(' ');
			if (data[0] !== 'Basic')
			{
				authForm();
			}
			else
			{
				const cred = Buffer.from(data[1], 'base64').toString().split(':');
				if (cred[0] === username && cred[1] === password)
				{
					normalWork();
				}
				else
				{
					authForm();
				}
			}
		}
		else
		{
			authForm();
		}

		function authForm()
		{
			console.log('Authentication form');
			const msg = 'Authentication required.';
			res.writeHead(401,
				{
					'WWW-Authenticate': 'Basic realm="Please input correct username and password before viewing this page."',
					'Content-Length': msg.length,
					'Content-Type': 'text/plain'
				});
			res.end(msg);
		}
	}
	else
	{
		normalWork();
	}

	function normalWork()
	{
		const url = req.url.split('?');
		const urlPath = decodeURI(url[0]);
		console.log('url: ' + urlPath);
		if (urlPath.match(/[/\\]\.+\.[/\\]/))
		{
			error(`You can watch only ${ROOT_PATH} directory`, res);
			return;
		}
		const cookie = parseCookie(req.headers?.cookie);
		const paramsGet = parseRequest(url[1]);
		const acceptEncoding = req.headers['accept-encoding'];
		const acceptLanguage = req.headers['accept-language'];
		/*Post данные*/
		const contentType = req.headers['content-type']?.split(';').map((value) => value.trim());
		if (contentType)
		{
			if (contentType[0] === 'multipart/form-data' || contentType[0] === 'application/x-www-form-urlencoded')
			{
				getPostBody(req, (err, postBody) =>
				{
					if (err)
					{
						answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, { error: err.message });
					}
					else
					{
						if (UPLOAD_ENABLE && contentType[0] === 'multipart/form-data')
						{
							let boundary = '';
							for (let i = 1; i < contentType.length; i++)
							{
								const pair = contentType[i].split('=');
								if (pair[0] === 'boundary')
								{
									boundary = pair[1];
									break;
								}
							}
							parseMultiPartFormData(postBody, boundary, (postData) =>
							{
								console.log('parse complete');
								answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, postData);
							});
						}
						else if (contentType[0] === 'application/x-www-form-urlencoded')
						{
							const postData = parseXwwwFormUrlEncoded(postBody);
							answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, postData);
						}
						else
						{
							answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage);
						}
					}
				});
			}
			else
			{
				answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage);
			}
		}
		else
		{
			answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage);
		}
	}
}

function getPostBody(req, callback)
{
	const size = Number(req.headers['content-length']);
	if (isNaN(size))
	{
		callback({ message: 'Content-Length header is invalid' });
	}
	else if (size > MAX_FILE_LENGTH)
	{
		callback({ message: `Max upload size (with headers) is ${MAX_FILE_LENGTH} bytes` });
	}
	else
	{
		let postChunks = [];
		let postLength = 0;
		req.on('data', (chunk) =>
		{
			postLength += chunk.byteLength;
			if (postLength > size)
			{
				req.destroy();
				return;
			}
			else
			{
				postChunks.push(chunk);
			}
		});
		req.on('end', () =>
		{
			//console.log('all post data received');
			if (postLength !== size)
			{
				callback({ message: 'Not all data received' });
			}
			else if (postLength === 0)
			{
				callback({ message: 'Size of post data is 0' });
			}
			else
			{
				let postBody = Buffer.concat(postChunks);
				callback(null, postBody);
			}
		});
	}
}

function parseMultiPartFormData(postBody, boundary, callback)
{
	//console.log(postBody.toString());
	if (postBody.error)
	{
		callback(postBody);
		return;
	}
	let boundaryIndex = 0;
	const boundaryStart = '--' + boundary;
	let prevBoundaryIndex = postBody.indexOf(boundaryStart);
	if (prevBoundaryIndex === -1)
	{
		callback({ error: 'Post data is invalid.' });
		return;
	}
	const boundarySize = boundaryStart.length;
	const entries = [];
	split();
	function split()
	{
		let startSearchIndex = prevBoundaryIndex + boundarySize;
		boundaryIndex = postBody.indexOf(boundaryStart, startSearchIndex);
		if (boundaryIndex === -1)
		{
			getData();
			return;
		}
		else if(boundaryIndex < 0)
		{
			callback({ error: 'Maximum allowed size of transferred data exceeded.' });
			return;
		}
		const entry = postBody.subarray(startSearchIndex, boundaryIndex);
		entries.push(entry);
		prevBoundaryIndex = boundaryIndex;
		setImmediate(split);
	}
	function getData()
	{
		const result = [];
		for (let entry of entries)
		{
			const dataIndex = entry.indexOf('\r\n\r\n', 72) + 4;
			const startFileNameIndex = entry.indexOf('filename="') + 10;
			if (startFileNameIndex === -1 || startFileNameIndex > dataIndex)
			{
				callback({ error: 'No file name in post data.' });
				return;
			}
			const endFileNameIndex = entry.indexOf('"', startFileNameIndex);
			if (endFileNameIndex === -1 || endFileNameIndex > dataIndex)
			{
				callback({ error: 'No file name in post data.' });
				return;
			}
			const fileName = entry.subarray(startFileNameIndex, endFileNameIndex).toString();
			if (!fileName || fileName === '')
			{
				callback({ error: 'No file selected!' });
				return;
			}
			const data = entry.subarray(dataIndex, entry.length - 2);
			result.push({ fileName, data });
		}
		callback(result);
	}
}

function parseXwwwFormUrlEncoded(postBody)
{
	if (postBody.byteLength > MAX_STRING_LENGTH)
	{
		return { error: 'Request too big' };
	}
	else
	{
		return parseRequest(postBody.toString());
	}
}

function parseRequest(str)
{
	let params = null;
	if (str)
	{
		params = {};
		str = str.split('&');
		str.forEach((p) =>
		{
			let keyVal = p.split('=');
			params[keyVal[0]] = keyVal[1];
		});
	}
	return params;
}

function answer(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, postData)
{

	sendFileByUrl(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, postData);
	//if (paramsGet) console.log(paramsGet);
	//if (postData) console.log(postData);
}

function sendCachedFile(res, file, contentType, acceptEncoding)
{
	const headers =
	{
		'Content-Type': contentType,
		'Cache-Control': 'max-age=86400',
		'Content-Security-Policy': 'default-src \'self\''
	};
	sendCompressed(res, headers, file, acceptEncoding);
}

function sendCompressed(res, headers, data, acceptEncoding)
{
	const compress = compressPrepare(acceptEncoding);
	if (compress)
	{
		headers['Content-Encoding'] = compress.compressType;
		compress.compressFunction(data, (err, cData) =>
		{
			if (err) error500(err, res);
			headers['Content-Length'] = cData.byteLength;
			send200(res, headers, cData);
		});
	}
	else
	{
		if (!data.byteLength) data = Buffer.from(data);
		headers['Content-Length'] = data.byteLength;
		send200(res, headers, data);
	}
}

function send200(res, headers, data)
{
	res.writeHead(200, headers);
	res.end(data);
}

function compressPrepare(acceptEncoding)
{
	if (DISABLE_COMPRESSION) return null;
	let compressType = null;
	let compressFunction = null;
	if (acceptEncoding)
	{
		if (/\bdeflate\b/.test(acceptEncoding))
		{
			compressType = 'deflate';
			compressFunction = zlib.deflate;
		}
		else if (/\bgzip\b/.test(acceptEncoding))
		{
			compressType = 'gzip';
			compressFunction = zlib.gzip;
		}
		else if (/\bbr\b/.test(acceptEncoding))
		{
			compressType = 'br';
			compressFunction = zlib.brotliCompress;
		}
		else
		{
			return null;
		}
		return { compressType, compressFunction };
	}
	return null;
}

function isAppFile(name)
{
	switch (name)
	{
	case 'favicon.ico':
		return true;
	case 'index.js':
		return true;
	case 'index.css':
		return true;
	case 'robots.txt':
		return true;
	case 'icons.css':
		return true;
	}
	return false;
}
//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath, paramsGet, cookie, acceptEncoding, acceptLanguage, postData)
{
	if (_generateIndex)
	{
		switch (urlPath)
		{
		case '/favicon.ico':
			sendCachedFile(res, _favicon, 'image/x-icon');
			return;
		case '/index.js':
			sendCachedFile(res, _index_js, 'text/javascript; charset=utf-8', acceptEncoding);
			return;
		case '/index.css':
			sendCachedFile(res, _index_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/robots.txt':
			sendCachedFile(res, _robots_txt, 'text/plain; charset=utf-8', acceptEncoding);
			return;
		case '/icons.css':
			sendCachedFile(res, _icons_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/icons/eye.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/icons/unzip.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/_favicon.ico':
			urlPath = '/favicon.ico';
			break;
		case '/_index.js':
			urlPath = '/index.js';
			break;
		case '/_index.css':
			urlPath = '/index.css';
			break;
		case '/_robots.txt':
			urlPath = '/robots.txt';
			break;
		case '/_icons.css':
			urlPath = '/icons.css';
			break;
		}
		if (urlPath.startsWith(`/icons/${ICONS_TYPE}`))
		{
			if (_icons_svg_map.has(urlPath))
			{
				sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
				return;
			}
		}
	}
	let filePath = path.join(ROOT_PATH, urlPath);
	fs.stat(filePath, (err, stats) =>
	{
		if (err)
		{
			error(err, res);
		}
		else if (_generateIndex)
		{
			const responseCookie = [];
			const clientLang = getClientLanguage(acceptLanguage, cookie, responseCookie);
			let localeTranslation = _locales.get(clientLang);
			ifGenetateIndex(res, urlPath, filePath, acceptEncoding, paramsGet, cookie, responseCookie, localeTranslation, clientLang, postData, stats.isFile(), stats.size);
		}
		else if (stats.isFile())
		{
			sendFile(res, filePath, stats.size);
		}
		else
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
	});
}

function ifGenetateIndex(res, urlPath, filePath, acceptEncoding, paramsGet, cookie, responseCookie, localeTranslation, clientLang, postData, isFile, fileSize)
{
	if (!isFile)
	{
		if (postData && !Array.isArray(postData) && typeof postData === 'object')
		{
			if (postData.error)
			{
				generateAndSendIndexHtmlAlias(postData.error);
			}
			else if (postData.dir)
			{
				if (UPLOAD_ENABLE)
				{
					createUserDir(postData, filePath, localeTranslation, (errorMessage) =>
					{
						generateAndSendIndexHtmlAlias(errorMessage);
					});
				}
				else
				{
					generateAndSendIndexHtmlAlias();
				}
			}
			else if (Object.keys(postData).length < 2)
			{
				generateAndSendIndexHtmlAlias('No files selected!');
			}
			else
			{
				if (postData.download)
				{
					zipFolder(res, urlPath, filePath, postData);
				}
				else if (postData.delete)
				{
					if (UPLOAD_ENABLE)
					{
						deleteFiles(filePath, postData, (errorMessage) =>
						{
							if (errorMessage)
							{
								generateAndSendIndexHtmlAlias(errorMessage);
							}
							else
							{
								reloadResponse(res, urlPath); //Отправляем заголовок Location, чтобы стереть кэшированную форму.
							}
						});
					}
					else
					{
						generateAndSendIndexHtmlAlias();
					}
				}
				else
				{
					generateAndSendIndexHtmlAlias();
				}
			}
		}
		else if (postDataHasFiles(postData))
		{
			saveUserFiles(postData, filePath, localeTranslation, (errorMessage) =>
			{
				if (paramsGet?.xhr) //Если запрос пришёл из xhr, то обновление происходит в скрипте на странице. Мы просто отсылаем сообщение об ошибке без html.
				{
					xhrAnswer(res, errorMessage);
				}
				else if(errorMessage)
				{
					generateAndSendIndexHtmlAlias(errorMessage);
				}
				else
				{
					reloadResponse(res, urlPath); //Отправляем заголовок Location, чтобы стереть кэшированную форму.
				}
			});
		}
		else
		{
			generateAndSendIndexHtmlAlias();
		}
	}
	else if (paramsGet?.unzip && UPLOAD_ENABLE)
	{
		unzip(filePath, errorMessage =>
		{
			if (errorMessage)
			{
				console.log(`${urlPath} unziped failed: ${errorMessage}`);
				generateAndSendIndexHtmlAlias(errorMessage);
			}
			else
			{
				console.log(`${urlPath} unziped successfully.`);
				let urlPathDir = urlPath.slice(0, urlPath.lastIndexOf('/'));
				if (urlPathDir === '') urlPathDir = '/';
				reloadResponse(res, urlPathDir);
			}
		});
	}
	else
	{
		sendFile(res, filePath, fileSize);
	}

	function generateAndSendIndexHtmlAlias(errorMessage)
	{
		generateAndSendIndexHtml(res, urlPath, filePath, acceptEncoding, paramsGet, cookie, responseCookie, localeTranslation, clientLang, errorMessage);
	}
}

function reloadResponse(res, urlPath)
{
	res.writeHead(302,
		{
			'Location': urlPath
		});
	res.end();
}
function xhrAnswer(res, errorMessage)
{
	const dataToSend = Buffer.from(errorMessage);
	res.writeHead(200,
		{
			'Content-Type': 'text/plain',
			'Content-Length': dataToSend.byteLength
		});
	res.end(dataToSend);
}

function getTranslation(value, localeTranslation)
{
	let locale = localeTranslation || DEFAULT_LOCALE_TRANSLATION;
	if (locale[value]) return locale[value];
	return DEFAULT_LOCALE_TRANSLATION[value];
}

function parseCookie(cookie)
{
	if (!cookie) return null;
	let cookieObj = {};
	for (let c of cookie.split(';'))
	{
		const aux = c.split('=');
		const key = aux[0].trim();
		const value = aux[1].trim();
		cookieObj[key] = value;
	}
	return cookieObj;
}

function getClientLanguage(acceptLanguage, cookie, responseCookie)
{
	let success = true;
	let clientLang = cookie?.lang;
	if (!clientLang && acceptLanguage) clientLang = acceptLanguage.split(',')[0];
	if (!clientLang) clientLang = cookie?.nav_lang;
	if (!_locales.has(clientLang))
	{
		success = false;
		for (let locale of _locales)
		{
			if (locale[0].startsWith(clientLang))
			{
				clientLang = locale[0];
				success = true;
				break;
			}
		}
	}
	if (success)
	{
		if (!cookie?.lang)
		{
			//Сохраним в куках найденную локаль, чтобы каждый раз не искать.
			responseCookie.push(`lang=${clientLang}; path=/; max-age=86400; samesite=strict`);
			return clientLang;
		}
	}
	else
	{
		clientLang = DEFAULT_LANG;
	}
	return clientLang;
}

function getIconClassName(ext)
{
	if (ext[0] === '.') ext = ext.slice(1, ext.length);
	let classPrefix = '';
	if (ICONS_TYPE === 'square-o')
	{
		classPrefix = 'sqo';
	}
	else if (ICONS_TYPE === 'classic')
	{
		classPrefix = 'cla';
	}
	else if (ICONS_TYPE === 'vivid')
	{
		classPrefix = 'viv';
	}
	else
	{
		throw new Error(`Don't now class prefix for icons ${ICONS_TYPE}`);
	}
	if (_icons_catalog.has(ext)) return `fiv-${classPrefix} fiv-icon-${ext}`;
	return `fiv-${classPrefix} fiv-icon-blank`;
}

function postDataHasFiles(postData)
{
	return Array.isArray(postData) && postData.length > 0 && postData.reduce((hasFileName, item) => hasFileName & (item.fileName && item.fileName !== '' && item.data !== undefined), true);
}

function createUserDir(postData, absolutePath, localeTranslation, callback)
{
	if (!postData.dir || postData.dir.length === 0)
	{
		callback(`${getTranslation('createFolderError', localeTranslation)}`);
	}
	else
	{
		fs.mkdir(path.join(absolutePath, decodeURIComponent(postData.dir)), { recursive: true }, (err) =>
		{
			if (err)
			{
				callback(`${getTranslation('createFolderError', localeTranslation)}`);
			}
			else
			{
				callback(null);
			}
		});
	}
}

function saveUserFiles(postData, absolutePath, localeTranslation, callback)
{
	if (!postData?.length || postData.length === 0)
	{
		callback(`${getTranslation('sendingFilesError', localeTranslation)} No data received.`);
	}
	else
	{
		let errorSendingFile = '';
		let numOfFiles = postData.length;
		for (let fileData of postData)
		{
			fs.writeFile(path.join(absolutePath, fileData.fileName), fileData.data, (err) =>
			{
				numOfFiles--;
				if (err)
				{
					errorSendingFile = `${getTranslation('sendingFilesError', localeTranslation)} Server error while saving files.`;
					console.log(`File ${fileData.fileName} was not saved: ${err.message}`);
				}
				else
				{
					console.log(`File ${fileData.fileName} was saved`);
				}
				if (numOfFiles === 0) callback(errorSendingFile);
			});
		}
	}
}

function zipFolder(res, urlPath, absolutePath, postData)
{
	const selectedFiles = [];
	let keys = Object.keys(postData);
	for (let key of keys)
	{
		if (key === 'download') continue;
		if (postData[key] === 'on')
		{
			const file = Buffer.from(key, 'base64url').toString(); //decodeURIComponent(decodeURIComponent(key))
			selectedFiles.push(file);
		}
	}
	const zip = new JSZip();

	let numberOfFile = 0;
	let numberOfRecursive = 0;

	readFolderRecursive(absolutePath, true);

	function readFolderRecursive(folderPath, isRoot)
	{
		numberOfRecursive++;
		fs.readdir(folderPath, { withFileTypes: true }, (err, files) =>
		{
			if (err)
			{
				zipError(err, res);
			}
			else if (files.length > 0)
			{
				for (let file of files)
				{
					if (isRoot && !selectedFiles.includes(file.name)) continue;
					if (!file.isFile())
					{
						readFolderRecursive(path.join(folderPath, file.name), false);
					}
					else if (file.isFile())
					{
						numberOfFile++;
						fs.readFile(path.join(folderPath, file.name), (err, data) =>
						{
							if (err)
							{
								zipError(err, res);
							}
							else
							{
								numberOfFile--;
								const relativePath = path.join(path.relative(absolutePath, folderPath), file.name);
								zip.file(relativePath, data);
								if (numberOfRecursive === 0 && numberOfFile === 0) sendZip();
							}
						});
					}
				}
			}
			else
			{
				const relativePath = path.join(path.relative(absolutePath, folderPath));
				zip.folder(relativePath);
			}
			numberOfRecursive--;
			if (numberOfRecursive === 0 && numberOfFile === 0) sendZip();
		});
	}

	function zipError(err, res)
	{
		const commonMsg = 'Zip generate error!';
		console.log(commonMsg + ' ' + err?.message);
		const msg = commonMsg + (err?.code === 'ERR_FS_FILE_TOO_LARGE' ? ' File size is greater than 2 GiB' : '');
		error500(msg, res);
	}

	function sendZip()
	{
		const zipStream = zip.generateNodeStream();
		zipStream.pipe(res);
		zipStream.on('error', (err) => error(err, res));
		res.writeHead(200,
			{
				'Content-Type': 'application/zip'
			});
		res.on('close', () =>
		{
			if (!res.writableFinished)
			{
				zipStream.destroy();
				console.log('Connection lost while transferring zip archive.');
			}
		});
		res.on('finish', () =>
		{
			console.log('Zip archive sent successfully.');
		});
	}
}

function deleteFiles(absolutePath, postData, callback)
{
	let keys = Object.keys(postData);
	let numOfFiles = keys.length - 1;
	for (let key of keys)
	{
		if (key === 'delete') continue;
		if (postData[key] === 'on')
		{
			const fileName = Buffer.from(key, 'base64url').toString(); //decodeURIComponent(decodeURIComponent(key));
			const filePath = path.join(absolutePath, fileName);
			fs.rm(filePath, { force: true, recursive: true }, (err) =>
			{
				if (err)
				{
					console.log(err.message);
					callback(`Server error. Can't delete ${fileName}`);
					return;
				}
				else
				{
					numOfFiles--;
					if (numOfFiles === 0) callback(null);
				}
			});
		}
		else
		{
			numOfFiles--;
			if (numOfFiles === 0) callback(null);
		}
	}
}

function generateAndSendIndexHtml(res, urlPath, absolutePath, acceptEncoding, paramsGet, cookie, responseCookie, localeTranslation, clientLang, errorMessage)
{
	if (!errorMessage) errorMessage = '';
	fs.readdir(absolutePath, { withFileTypes: true }, (err, files) =>
	{
		if (err)
		{
			error(err, res);
		}
		else
		{
			let hrefs = [];
			const urlHeader = urlPath[urlPath.length - 1] === '/' ? urlPath.slice(0, urlPath.length - 1) : urlPath;
			let folderName = '/';
			const folderSizeStub = getTranslation('folderSizeStub', localeTranslation);
			let hrefsResult = '';
			let filesNumber = 0;
			let foldersNumber = 0;
			let filesSize = 0;
			//Массив sortLinks содержит html код ссылок для сортировки.
			const sortLinks = new Array(3);
			if (urlPath !== '/')
			{
				const lastField = urlHeader.lastIndexOf('/');
				const backUrl = lastField === 0 ? '/' : urlHeader.slice(0, lastField);
				const iconnClassName = getIconClassName('folder');
				hrefsResult =
`			<div class="main_container__first_column">
				<input type="checkbox" class="hidden-in-flow">
				<div class="${iconnClassName}"></div>
				<a href="/">[/]</a>
			</div>
			<span>${folderSizeStub}</span>
			<span>-</span>
			<div class="main_container__first_column">
			<input type="checkbox" class="hidden-in-flow">
				<div class = "${iconnClassName}"></div>
				<a href="${backUrl}">[..]</a>
			</div>
			<span>${folderSizeStub}</span>
			<span>-</span>
`;
				folderName = urlHeader.slice(lastField + 1);
			}
			if (files.length > 0)
			{
				for (let file of files)
				{
					fs.stat(path.join(absolutePath, file.name), (err, stats) =>
					{
						if (err)
						{
							console.log(err?.message);
							return;
						}
						const isDirectory = !file.isFile();
						const linkName = isDirectory ? `[${file.name}]` : file.name;
						const sizeStr = isDirectory ? folderSizeStub : getStrSize(stats.size, localeTranslation);
						const modify = stats.mtime.toLocaleDateString(clientLang) + ' ' + stats.mtime.toLocaleTimeString(clientLang);
						const linkHref = encodeURI(`${urlHeader}/${isAppFile(file.name) ? '_' : ''}${file.name}`);
						const ext = isDirectory ? 'folder' : path.extname(file.name);
						const iconnClassName = getIconClassName(ext);
						const showInBrowser = !isDirectory && canShowInBrowser(ext);
						hrefs.push({ value:
`				<div class="main_container__first_column">
					<input type="checkbox" name="${Buffer.from(file.name).toString('base64url')}">
					<div class="${iconnClassName}"></div>
					<a href="${linkHref}"${isDirectory ? '' : ' download'}>${linkName}</a>
					${ext === '.zip' && UPLOAD_ENABLE ? `<a href="${linkHref}?unzip=true" class="flex_right_icons unzip-icon" aria-label="${getTranslation('linkToUnzip', localeTranslation)}"></a>` : ''}
					${showInBrowser ? `<a href="${linkHref}" class="flex_right_icons open-in-browser-icon" target="_blank" aria-label="${getTranslation('linkToOpenInBrowser', localeTranslation)}"></a>` : ''}
				</div>
				<span>${sizeStr}</span>
				<span>${modify}</span>
`, isDirectory, name: file.name, size: stats.size, modify: stats.mtime });
						if (isDirectory)
						{
							foldersNumber++;
						}
						else
						{
							filesNumber++;
							filesSize += stats.size;
						}
						if (hrefs.length === files.length)
						{
							const sortType = getFromObjectsWithEqualKeys(paramsGet, cookie, 'sortType', 'name', setSortCookie, null, setSortCookie);
							const sortDirection = getFromObjectsWithEqualKeys(paramsGet, cookie, 'sortDirection', 'asc', setSortCookie, null, setSortCookie);
							sortHrefs(sortType, sortDirection, hrefs);
							for (let h of hrefs)
							{
								hrefsResult += h.value;
							}
							//Массив sortLinks содержит html код ссылок для сортировки.
							sortLinks[0] = setSortHref(sortType, sortDirection, 'name');
							sortLinks[1] = setSortHref(sortType, sortDirection, 'size');
							sortLinks[2] = setSortHref(sortType, sortDirection, 'time');
							sendHtmlString(res, combineHtml(true), responseCookie, acceptEncoding);
						}
					});
				}
			}
			else
			{
				sendHtmlString(res, combineHtml(false), responseCookie, acceptEncoding);
			}
			function setSortHref(sortType, sortDirection, sortHrefType)
			{
				const sortHrefUp = `<a href="${urlHeader}/?sortType=${sortHrefType}&sortDirection=desc">&uarr;</a>`;
				const sortHrefDown = `<a href="${urlHeader}/?sortType=${sortHrefType}&sortDirection=asc">&darr;</a>`;
				return sortType === sortHrefType ? (sortDirection === 'asc' ? sortHrefUp : sortHrefDown) : sortHrefUp + sortHrefDown;
			}
			function setSortCookie(key, value)
			{
				responseCookie.push(`${key}=${value}; path=/; max-age=86400; samesite=strict`);
			}
			function combineHtml(hasFiles)
			{
				return  _indexHtmlbase[0] + clientLang +
						_indexHtmlbase[1] + (DIRECTORY_MODE_TITLE ? DIRECTORY_MODE_TITLE : getTranslation('defaultTitle', localeTranslation)) +
						_indexHtmlbase[2] + folderName +
						_indexHtmlbase[3] + getTranslation('selectAll', localeTranslation) +
						_indexHtmlbase[4] + getTranslation('deselectAll', localeTranslation) +
						_indexHtmlbase[5] + getTranslation('downloadZip', localeTranslation) +
						_indexHtmlbase[6] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[7] + getTranslation('deleteFiles', localeTranslation) +
						_indexHtmlbase[8]) : ''}` +
						_indexHtmlbase[9] + `${getTranslation('filesStats', localeTranslation)}: ${filesNumber} (${getStrSize(filesSize, localeTranslation)}). ${getTranslation('foldersStats', localeTranslation)}: ${foldersNumber}` +
						_indexHtmlbase[10] + getTranslation('fileName', localeTranslation) +
						_indexHtmlbase[11] + (hasFiles ? sortLinks[0] : '') +
						_indexHtmlbase[12] + getTranslation('fileSize', localeTranslation) +
						_indexHtmlbase[13] + (hasFiles ? sortLinks[1] : '') +
						_indexHtmlbase[14] + getTranslation('modifyDate', localeTranslation) +
						_indexHtmlbase[15] + (hasFiles ? sortLinks[2] : '') +
						_indexHtmlbase[16] + hrefsResult +
						_indexHtmlbase[17] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[18] + getTranslation('createFolder', localeTranslation) +
						_indexHtmlbase[19] + getTranslation('uploadFiles', localeTranslation) +
						_indexHtmlbase[20] + getTranslation('dragAndDropText', localeTranslation) +
						_indexHtmlbase[21] + getTranslation('deleteFilesWarning', localeTranslation) +
						_indexHtmlbase[22] + getTranslation('yes', localeTranslation) +
						_indexHtmlbase[23] + getTranslation('no', localeTranslation) +
						_indexHtmlbase[24] + getTranslation('deleteWithoutAsk', localeTranslation) +
						_indexHtmlbase[25]) : ''}` +
						_indexHtmlbase[26] + errorMessage +
						_indexHtmlbase[27];
			}
		}
	});
}

//Если key есть и в primary и в secondary, то вернёт из primary, иначе: вернёт из secondary.
//Если и в secondary нет, то вернёт defaultValue.
//Выполнятся функции ifPrimary, ifSecondary, ifDefault в зависимости от того, откуда вернулось.
function getFromObjectsWithEqualKeys(primary, secondary, key, defaultValue, ifPrimary, ifSecondary, ifDefault)
{
	if (primary)
	{
		if (primary[key])
		{
			if (ifPrimary) ifPrimary(key, primary[key]);
			return primary[key];
		}
		if (secondary)
		{
			if (secondary[key])
			{
				if (ifSecondary) ifSecondary(key, secondary[key]);
				return secondary[key];
			}
			if (ifDefault) ifDefault(key, defaultValue);
			return defaultValue;
		}
		if (ifDefault) ifDefault(key, defaultValue);
		return defaultValue;
	}
	if (secondary)
	{
		if (secondary[key])
		{
			if (ifSecondary) ifSecondary(key, secondary[key]);
			return secondary[key];
		}
		if (ifDefault) ifDefault(key, defaultValue);
		return defaultValue;
	}
	if (ifDefault) ifDefault(key, defaultValue);
	return defaultValue;
}

function sortHrefs(sortType, sortDirection, hrefs)
{
	hrefs.sort((val1, val2) =>
	{
		let ab = direction(val1, val2);
		let a = ab[0];
		let b = ab[1];
		if (sortType !== 'time') //Сортируем, но так, чтобы папки были сверху.
		{
			if (a.isDirectory && !b.isDirectory) return -1;
			if (a.isDirectory && b.isDirectory) return a.name.localeCompare(b.name);
			if (!a.isDirectory && b.isDirectory) return 1;
			if (!a.isDirectory && !b.isDirectory)
			{
				if (sortType === 'name') return a.name.localeCompare(b.name);
				if (sortType === 'size') return a.size - b.size;
				return Math.random() * 2 - 1;
			}
		}
		else
		{
			return a.modify - b.modify;
		}
	});
	function direction(val1, val2)
	{
		let a, b;
		if (sortDirection === 'asc')
		{
			a = val1;
			b = val2;
		}
		else if (sortDirection === 'desc')
		{
			a = val2;
			b = val1;
		}
		else
		{
			a = val1;
			b = val1;
		}
		return [a, b];
	}
}

function getStrSize(size, localeTranslation)
{
	if (size === 0) return '0 ' + getTranslation('sizeByte', localeTranslation);
	const sizeOfSize = Math.floor(Math.log2(size) / 10);
	let suffix = '';
	switch (sizeOfSize)
	{
	case 0:
		return size + ' ' + getTranslation('sizeByte', localeTranslation);
	case 1:
		suffix = getTranslation('sizeKiB', localeTranslation);
		break;
	case 2:
		suffix = getTranslation('sizeMiB', localeTranslation);
		break;
	case 3:
		suffix = getTranslation('sizeGiB', localeTranslation);
		break;
	case 4:
		suffix = getTranslation('sizeTiB', localeTranslation);
		break;
	case 5:
		suffix = getTranslation('sizePiB', localeTranslation);
		break;
	}
	return (size / Math.pow(2, sizeOfSize * 10)).toFixed(1) + ' ' + suffix;
}

function error(err, res)
{
	console.log('Not found: ' + err);
	const msg = '404 Not Found';
	res.writeHead(404,
		{
			'Content-Length': msg.length,
			'Content-Type': 'text/plain'
		});
	res.end(msg);
}
function error500(err, res)
{
	const msg = 'Internal server error!';
	console.log(msg + ' ' + err?.message);
	res.writeHead(500,
		{
			'Content-Length': msg.length,
			'Content-Type': 'text/plain'
		});
	res.end(msg);
}

function sendHtmlString(res, data, cookie, acceptEncoding)
{
	const headers =
	{
		'Content-Length': Buffer.from(data).byteLength,
		'Content-Type': 'text/html; charset=utf-8',
		'Content-Security-Policy': 'default-src \'self\'',
		'Cache-Control': 'no-cache'
	};
	if (cookie)
	{
		if (cookie?.length)
		{
			headers['Set-Cookie'] = cookie;
		}
	}
	sendCompressed(res, headers, data, acceptEncoding);
}

//Отправка файлов с использованием файловых потоков.
function sendFile(res, filePath, size)
{
	let file = fs.createReadStream(filePath);
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
			console.log('Connection lost: ' + filePath);
		}
	});
	res.on('finish', () =>
	{
		console.log('Sent successfully: ' + filePath);
	});

}

function unzip(pathToZip, callback)
{
	const zip = new JSZip();
	fs.readFile(pathToZip, (err, data) =>
	{
		if (err)
		{
			callback(err.message);
		}
		else
		{
			zip.loadAsync(data, { createFolders: true }).then(zipData =>
			{
				const files = Object.keys(zipData.files);
				if (files.length > 0) next(0);

				function next(index)
				{
					const file = files[index];
					const name = zipData.files[file].name;
					const isDir = zipData.files[file].dir;
					const fullPath = path.join(path.dirname(pathToZip), name);
					if (isDir)
					{
						fs.mkdir(fullPath, { recursive: true }, err =>
						{
							perform(err);
						});
					}
					else
					{
						zipData.files[file].async('uint8array').then(data =>
						{
							fs.writeFile(fullPath, data, err =>
							{
								perform(err);
							});
						}).catch(perform);
					}

					function perform(err)
					{
						if (err)
						{
							console.log('Unzip error: ' + err.message);
							callback('Server error while uziping');
						}
						else
						{
							if (index < files.length - 1)
							{
								next(index + 1);
							}
							else
							{
								callback();
							}
						}
					}
				}
			}).catch(err =>
			{
				callback(err?.message || err);
			});
		}
	});
}

function canShowInBrowser(ext)
{
	switch (ext.toLowerCase())
	{
	case '.html':
	case '.htm':
	case '.shtml':
	case '.css':
	case '.xml':
	case '.gif':
	case '.jpeg':
	case '.jpg':
	case '.js':
	case '.txt':
	case '.png':
	case '.svg':
	case '.svgz':
	case '.tif':
	case '.tiff':
	case '.wbmp':
	case '.webp':
	case '.ico':
	case '.jng':
	case '.bmp':
	case '.json':
	case '.pdf':
	case '.mp3':
	case '.ogg':
	case '.m4a':
	case '.ra':
	case '.ts':
	case '.mp4':
	case '.mpeg':
	case '.mov':
	case '.webm':
	case '.flv':
	case '.m4v':
	case '.mng':
	case '.asx':
	case '.md':
		return true;
	}
	return false;
}

function getContentType(ext)
{
	ext = ext.toLowerCase();
	//Взял из настроек nginx
	if (ext === '.html' || ext === '.htm' || ext === '.shtml') return 'text/html; charset=utf-8';
	if (ext === '.css') return 'text/css; charset=utf-8';
	if (ext === '.xml') return 'text/xml; charset=utf-8';
	if (ext === '.gif') return 'image/gif';
	if (ext === '.jpeg' || ext === '.jpg') return 'image/jpeg';
	if (ext === '.js') return 'text/javascript; charset=utf-8';
	if (ext === '.atom') return 'application/atom+xml';
	if (ext === '.rss') return 'application/rss+xml';
	if (ext === '.mml') return 'text/mathml';
	if (ext === '.txt') return 'text/plain; charset=utf-8';
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
	if (ext === '.json') return 'application/json; charset=utf-8';
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
	if (ext === '.wasm') return 'application/wasm';
	if (ext === '.md') return 'text/plain; charset=UTF-8';
	if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=UTF-8';
	return 'application/octet-stream';
}