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

const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')).toString()).version;
{ //Show version
	const v = process.argv.includes('-v') || process.argv.includes('-V') || process.argv.includes('--version');
	if (v)
	{
		console.log(VERSION);
		process.exit(0);
	}
}
{//Show help
	const h = process.argv.includes('-h') || process.argv.includes('-H') || process.argv.includes('--help');
	if (h)
	{
		const help =
`Web server on nodejs, designed to share user directory from network.
It can also be used as a web server to serve static sites.

Usage:
web-shared-folder [--upload or -u] <path to the directory for sharing> <port> [<key> <cert>] [<username> <password>]

If there is the "index.html" file in the specified directory,
then the server will start in the static web site mode.
The directory contents viewing mode can be forced.
To do this, set the environment variable SERVER_DIRECTORY_MODE=1.
Also, this mode can be forcibly disabled by setting SERVER_DIRECTORY_MODE=0.

In order to allow users to upload files to the server,
it is necessary to add command key **--upload** or **-u** or set the environment variable SERVER_UPLOAD_ENABLE to 1.

In order to start the server to work over https, you must specify the files:
the private key file (<key>) and the certificate file (<cert>).

In https mode, it is possible to enable automatic redirection from http.
To do this, set to the SERVER_AUTO_REDIRECT_HTTP_PORT environment variable
the port number from which the redirection will be performed (usually 80).

If the keys <username> and <password> are given,
then HTTP authentication is enabled with the given login and password.

All command line options can also be set in the environment variables:
SERVER_ROOT, SERVER_PORT, SERVER_KEY,
SERVER_CERT, SERVER_USERNAME, SERVER_PASSWORD.
Also in the SERVER_PASSWORD_MD5 environment variable
the server password can be set as a md5 hash.
Options specified on the command line have higher precedence.

In particular, in this mode, the user can upload a zip archive to the server
and then unzip it by clicking on the unzip icon.

User can set the page title in the
SERVER_DIRECTORY_MODE_TITLE environment variable.

It is possible to run server in cluster mode.
To do this, set the SERVER_USE_CLUSTER_MODE environment variable to 1.
In cluster mode, nodejs child processes will be created according to
the number of processor cores. This mode allows you to use all 
processor resources, but at the same time it increases the consumption of RAM.
If SERVER_SHOULD_RESTART_WORKER=1 is given, the child process will be
automatically restarted if it terminates unexpectedly.

By default, the server returns the contents in a compressed form.
If you want to disable this behavior, you can set SERVER_DISABLE_COMPRESSION=1

The server uses the "file-icon-vectors" npm package to display file icons.
(https://www.npmjs.com/package/file-icon-vectors)
Three types of icons are available: "classic", "square-o", "vivid"
(see the package page for more details).
You can set the SERVER_ICONS_TYPE environment variable to one of these values.
The default is "square-o".`;
		console.log(help);
		process.exit(0);
	}
}
const ARGS = [];
for (let arg of process.argv)
{
	ARGS.push(arg);
}
const UPLOAD_ENABLE = checkUpload(ARGS);
const USE_CLUSTER_MODE = Number(process.env.SERVER_USE_CLUSTER_MODE);
const SHOULD_RESTART_WORKER = Number(process.env.SERVER_SHOULD_RESTART_WORKER);
const DIRECTORY_MODE = Number(process.env.SERVER_DIRECTORY_MODE);
const DIRECTORY_MODE_TITLE = process.env.SERVER_DIRECTORY_MODE_TITLE;
const AUTO_REDIRECT_HTTP_PORT = Number(process.env.SERVER_AUTO_REDIRECT_HTTP_PORT);
const DISABLE_COMPRESSION = Number(process.env.SERVER_DISABLE_COMPRESSION);

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

const FILES_REG_EXP = new RegExp(/[<>":?*|\\/]/g);
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

const ROOT_PATH_RAW = (ARGS[2] || process.env.SERVER_ROOT);
const ROOT_PATH = ROOT_PATH_RAW ? ROOT_PATH_RAW.replace(/"/g, '') : null; //Папка относительно которой будут задаваться все папки, которые идут с адресом
const PORT = Number(ARGS[3] || process.env.SERVER_PORT);
const key = ARGS[4] || process.env.SERVER_KEY;
const cert = ARGS[5] || process.env.SERVER_CERT;
const username = ARGS[6] || process.env.SERVER_USERNAME;
const _isMd5Password = process.env.SERVER_PASSWORD_MD5 ? true : false;
const password = ARGS[7] || (_isMd5Password ? process.env.SERVER_PASSWORD_MD5.toLowerCase() : process.env.SERVER_PASSWORD);

if (!ROOT_PATH || !PORT)
{
	console.log(`web-shared-folder, version ${VERSION}
To show help use "--help" key`);
	process.exit(0);
}

const numCPUs = cpus().length;
if (cluster.isPrimary)
{
	console.log('web-shared-folder, version ' + VERSION);
	console.log('Port = ' + PORT);
	console.log('Root = ' + ROOT_PATH);
	if (USE_CLUSTER_MODE) console.log('CPUs number = ' + numCPUs);
	console.log();
	console.log('Available on:');
	getIpV4().forEach((ip) => console.log(ip));
	console.log();
}

let _generateIndex = false;
let _indexHtmlbase = null;
let _favicon = null;
let _index_js = null;
let _index_css = null;
let _light_css = null;
let _dark_css = null;
let _robots_txt = null;
let _locales = null;
let _icons_css = null;
let _404_css = null;
let _404_html = null;
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
		console.log('Path is not directory');
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
			const indexFile = path.join(ROOT_PATH, 'index.html');
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
			const index_js_splitted = fs.readFileSync(path.join(__dirname, 'app_files', 'index.js')).toString().split('/*---UPLOAD_SPLITTER---*/');
			_index_js = UPLOAD_ENABLE ? index_js_splitted.join('') : index_js_splitted[0] + index_js_splitted[2];
			const index_css_splitted = fs.readFileSync(path.join(__dirname, 'app_files', 'index.css')).toString().split('/*---UPLOAD_SPLITTER---*/');
			_index_css = UPLOAD_ENABLE ? index_css_splitted.join('') : index_css_splitted[0];
			_light_css = fs.readFileSync(path.join(__dirname, 'app_files', 'light.css'));
			_dark_css = fs.readFileSync(path.join(__dirname, 'app_files', 'dark.css'));
			_robots_txt = fs.readFileSync(path.join(__dirname, 'app_files', 'robots.txt'));
			_404_css = fs.readFileSync(path.join(__dirname, 'app_files', '404.css'));
			_404_html = fs.readFileSync(path.join(__dirname, 'app_files', '404.html')).toString().split('~%~');
			readIconsFiles();
			readTranslationFiles();
		}
		const isHttps = key && cert;
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
			_icons_svg_map.set(`/wsf_app_files/icons/${ICONS_TYPE}/${fileName}`, fs.readFileSync(path.join(pathCombined, fileName)));
		}
	}
	_icons_svg_map.set('/wsf_app_files/eye.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'eye.svg')));
	_icons_svg_map.set('/wsf_app_files/unzip.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'unzip.svg')));
	_icons_svg_map.set('/wsf_app_files/sun.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'sun.svg')));
	_icons_svg_map.set('/wsf_app_files/auto.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'auto.svg')));
	_icons_svg_map.set('/wsf_app_files/moon.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'moon.svg')));
	_icons_svg_map.set('/wsf_app_files/circle.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'circle.svg')));
	_icons_svg_map.set('/wsf_app_files/rename.svg', fs.readFileSync(path.join(__dirname, 'app_files', 'img', 'rename.svg')));
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
	if (now - _lastReqTime > 1000 || _lastIP !== ip) console.log(`*******${ip}, ${now.toLocaleString()} *******`);
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
				const passwordEntered = _isMd5Password ? Buffer.from(md5(Buffer.from(cred[1]))).toString('hex') : cred[1];
				if (cred[0] === username && passwordEntered === password)
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
		const urlPath = decodeURIComponent(url[0]);
		console.log('url: ' + urlPath);
		const cookie = parseCookie(req.headers?.cookie);
		const reqGetData = parseRequest(url[1]);
		const acceptEncoding = req.headers['accept-encoding'];
		const acceptLanguage = req.headers['accept-language'];
		if (urlPath.match(/[/\\]\.+\.[/\\]/))
		{
			const clientLang = getClientLanguage(acceptLanguage, cookie);
			const localeTranslation = _locales.get(clientLang);
			error404(`You can watch only ${ROOT_PATH} directory`, res, acceptEncoding, localeTranslation, clientLang);
			return;
		}
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
						answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage, { error: err.message });
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
							parseMultiPartFormData(postBody, boundary, (reqPostData) =>
							{
								//console.log('parse complete');
								answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage, reqPostData);
							});
						}
						else if (contentType[0] === 'application/x-www-form-urlencoded')
						{
							const reqPostData = parseXwwwFormUrlEncoded(postBody);
							answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage, reqPostData);
						}
						else
						{
							answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage);
						}
					}
				});
			}
			else
			{
				answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage);
			}
		}
		else
		{
			answer(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage);
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
				console.log('The request was destroyed due to a size error.');
				return;
			}
			else
			{
				postChunks.push(chunk);
			}
		});
		req.on('error', (err) =>
		{
			console.log('An error occured while uploading!');
			console.log(err);
			req.destroy();
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

function sendCachedFile(res, file, contentType, acceptEncoding, code)
{
	const headers =
	{
		'Content-Type': contentType,
		'Cache-Control': 'max-age=86400',
		'Content-Security-Policy': 'default-src \'self\''
	};
	sendCompressed(res, headers, file, acceptEncoding, code);
}

function sendCompressed(res, headers, data, acceptEncoding, code)
{
	const compress = compressPrepare(acceptEncoding);
	if (compress)
	{
		headers['Content-Encoding'] = compress.compressType;
		compress.compressFunction(data, (err, cData) =>
		{
			if (err) error500(err, res);
			headers['Content-Length'] = cData.byteLength;
			send(res, headers, cData, code);
		});
	}
	else
	{
		if (!data.byteLength) data = Buffer.from(data);
		headers['Content-Length'] = data.byteLength;
		send(res, headers, data, code);
	}
}

function send(res, headers, data, code)
{
	if (!code) code = 200;
	res.writeHead(code, headers);
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

//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath, reqGetData, cookie, acceptEncoding, acceptLanguage, reqPostData)
{
	let localeTranslation = '';
	const responseCookie = [];
	let clientLang = '';
	if (_generateIndex)
	{
		clientLang = getClientLanguage(acceptLanguage, cookie, responseCookie);
		localeTranslation = _locales.get(clientLang);
		switch (urlPath)
		{
		case '/wsf_app_files/favicon.ico':
			sendCachedFile(res, _favicon, 'image/x-icon');
			return;
		case '/wsf_app_files/index.js':
			sendCachedFile(res, _index_js, 'text/javascript; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/index.css':
			sendCachedFile(res, _index_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/light.css':
			sendCachedFile(res, _light_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/dark.css':
			sendCachedFile(res, _dark_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/robots.txt':
			sendCachedFile(res, _robots_txt, 'text/plain; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/icons.css':
			sendCachedFile(res, _icons_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/404.css':
			sendCachedFile(res, _404_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/eye.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/unzip.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/sun.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/auto.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/moon.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/circle.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/wsf_app_files/rename.svg':
			sendCachedFile(res, _icons_svg_map.get(urlPath), 'image/svg+xml; charset=utf-8', acceptEncoding);
			return;
		case '/_index.html':
			urlPath = '/index.html';
			break;
		case '/_robots.txt':
			urlPath = '/robots.txt';
			break;
		}
		if (urlPath.startsWith(`/wsf_app_files/icons/${ICONS_TYPE}`))
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
			error404(err, res, acceptEncoding, localeTranslation, clientLang);
		}
		else if (_generateIndex)
		{
			ifGenetateIndex(res, urlPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, reqPostData, stats.isFile(), stats.size);
		}
		else if (stats.isFile())
		{
			sendFile(res, filePath, stats.size, acceptEncoding, localeTranslation, clientLang);
		}
		else
		{
			filePath = path.join(filePath, 'index.html');
			fs.stat(filePath, (err, stats) =>
			{
				if (err)
				{
					error404(err, res, acceptEncoding, localeTranslation, clientLang);
				}
				else
				{
					sendFile(res, filePath, stats.size, acceptEncoding, localeTranslation, clientLang);
				}
			});
		}
	});
}

function ifGenetateIndex(res, urlPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, reqPostData, isFile, fileSize)
{
	if (!isFile)
	{
		if (reqPostData && !Array.isArray(reqPostData) && typeof reqPostData === 'object')
		{
			if (reqPostData.error)
			{
				generateAndSendIndexHtmlAlias(reqPostData.error);
			}
			else if (reqPostData.dir)
			{
				if (UPLOAD_ENABLE)
				{
					createUserDir(reqPostData, filePath, localeTranslation, (errorMessage) =>
					{
						generateAndSendIndexHtmlAlias(errorMessage);
					});
				}
				else
				{
					generateAndSendIndexHtmlAlias();
				}
			}
			else if (Object.keys(reqPostData).length < 2)
			{
				generateAndSendIndexHtmlAlias('No files selected!');
			}
			else
			{
				if (UPLOAD_ENABLE && reqPostData.delete)
				{
					deleteFiles(filePath, reqPostData, (errorMessage) =>
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
				else if (UPLOAD_ENABLE && reqPostData.rename_from && reqPostData.rename_to)
				{
					renameFile(filePath, reqPostData, (errorMessage) =>
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
		}
		else if (UPLOAD_ENABLE && postDataHasFiles(reqPostData))
		{
			saveUserFiles(reqPostData, filePath, localeTranslation, (errorMessage) =>
			{
				if (reqGetData?.xhr) //Если запрос пришёл из xhr, то обновление происходит в скрипте на странице. Мы просто отсылаем сообщение об ошибке без html.
				{
					simpleAnswer(res, errorMessage);
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
		else if (reqGetData?.download)
		{
			zipFolder(res, urlPath, filePath, reqGetData, acceptEncoding, localeTranslation, clientLang);
		}
		else
		{
			generateAndSendIndexHtmlAlias();
		}
	}
	else if (reqGetData?.unzip && UPLOAD_ENABLE)
	{
		unzip(filePath, errorMessage =>
		{
			let urlPathDir = urlPath.slice(0, urlPath.lastIndexOf('/'));
			if (urlPathDir === '') urlPathDir = '/';
			if (errorMessage)
			{
				const msg = `${urlPath} unzipped failed`;
				console.log(`${msg}: ${errorMessage}`);
				simpleAnswer(res, msg);
			}
			else
			{
				console.log(`${urlPath} unzipped successfully.`);
				reloadResponse(res, urlPathDir);
			}
		});
	}
	else
	{
		sendFile(res, filePath, fileSize, acceptEncoding, localeTranslation, clientLang);
	}

	function generateAndSendIndexHtmlAlias(errorMessage)
	{
		generateAndSendIndexHtml(res, urlPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, errorMessage);
	}
}

function reloadResponse(res, urlPath)
{
	res.writeHead(302,
		{
			'Location': encodeURI(urlPath)
		});
	res.end();
}
function simpleAnswer(res, errorMessage)
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
			if (responseCookie) responseCookie.push(`lang=${clientLang}; path=/; max-age=86400; samesite=strict`);
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
	if (!UPLOAD_ENABLE)
	{
		callback('Writing is not allowed!');
		return;
	}
	if (!postData.dir || postData.dir.length === 0 || postData.dir.length > 255)
	{
		callback(`${getTranslation('createFolderError', localeTranslation)}`);
	}
	else
	{
		let dpath = postData.dir.replace(/\+/g, ' ');
		dpath = decodeURIComponent(dpath);
		if (dpath.match(FILES_REG_EXP) !== null)
		{
			callback(`${getTranslation('createFolderError', localeTranslation)}`);
			return;
		}
		fs.mkdir(path.join(absolutePath, dpath), { recursive: true }, (err) =>
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

function saveUserFiles(reqPostData, absolutePath, localeTranslation, callback)
{
	if (!reqPostData?.length || reqPostData.length === 0)
	{
		callback(`${getTranslation('sendingFilesError', localeTranslation)} No data received.`);
	}
	else
	{
		let errorSendingFile = '';
		let numOfFiles = reqPostData.length;
		for (let fileData of reqPostData)
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

function zipFolder(res, urlPath, absolutePath, postData, acceptEncoding, localeTranslation, clientLang)
{
	const selectedFiles = [];
	const rootFolderName = urlPath === '/' ? 'archive' : path.basename(absolutePath);
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
					const fullPath = path.join(folderPath, file.name);
					checkIsDirectory(fullPath, file, afterIsDirectory);
					function afterIsDirectory(isDirectory)
					{
						if (isDirectory)
						{
							const relativePath = path.join(path.relative(absolutePath, fullPath)).replace(/\\/g, '/');
							zip.folder(relativePath);
							readFolderRecursive(fullPath, false);
						}
						else if (isDirectory !== null)
						{
							numberOfFile++;
							fs.readFile(fullPath, (err, data) =>
							{
								numberOfFile--;
								if (!err)
								{
									const relativePath = path.join(path.relative(absolutePath, folderPath), file.name).replace(/\\/g, '/');
									zip.file(relativePath, data);
									if (numberOfRecursive === 0 && numberOfFile === 0) sendZip();
								}
							});
						}
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
		const zipStream = zip.generateNodeStream({ compression: 'STORE' });
		zipStream.pipe(res);
		zipStream.on('error', (err) => error404(err, res, acceptEncoding, localeTranslation, clientLang));
		res.writeHead(200,
			{
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename=${encodeURI(rootFolderName)}.zip`
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
			console.log('Zip archive sent successfully: ' + selectedFiles.join(', '));
		});
	}
}

function renameFile(absolutePath, postData, callback)
{
	if (!UPLOAD_ENABLE)
	{
		callback('Writing is not allowed!');
		return;
	}
	if (!postData.rename_from || !postData.rename_to)
	{
		callback('No "rename_from" or "postData.rename_to"');
		return;
	}
	const newName = decodeURIComponent(postData.rename_to.replace(/\+/g, ' '));
	if (newName.length > 255)
	{
		callback('Name error!');
		return;
	}
	const oldName = Buffer.from(postData.rename_from, 'base64url').toString();
	if (newName === oldName)
	{
		callback(null);
		return;
	}
	if ((newName.match(FILES_REG_EXP) !== null) || oldName.match(FILES_REG_EXP) !== null)
	{
		callback('Name error!');
		return;
	}
	fs.rename(path.join(absolutePath, oldName), path.join(absolutePath, newName), (err) =>
	{
		if (err)
		{
			console.log(err.message);
			callback(`Server error. Can't rename ${oldName}`);
			return;
		}
		else
		{
			callback(null);
		}
	});
}

function deleteFiles(absolutePath, postData, callback)
{
	if (!UPLOAD_ENABLE)
	{
		callback('Writing is not allowed!');
		return;
	}
	let keys = Object.keys(postData);
	let numOfFiles = keys.length - 1;
	for (let key of keys)
	{
		if (key === 'delete') continue;
		if (postData[key] === 'on')
		{
			const fileName = Buffer.from(key, 'base64url').toString();
			if (fileName.match(FILES_REG_EXP) !== null)
			{
				callback('Name error!');
				return;
			}
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
			error404(err, res, acceptEncoding, localeTranslation, clientLang);
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
				let countFiles = files.length;
				let fileIndex = -1;
				for (let file of files)
				{
					const filePath = path.join(absolutePath, file.name);
					fs.stat(filePath, (err, stats) =>
					{
						if (err)
						{
							console.log(err?.message);
							countFiles--;
							if (countFiles === 0) prepareToSendFiles();
							return;
						}
						fileIndex++;
						checkIsDirectory(filePath, file, afterIsDirectory);

						function afterIsDirectory(isDirectory)
						{
							countFiles--;
							if (isDirectory === null)
							{
								if (countFiles === 0) prepareToSendFiles();
								return;
							}
							let linkName = isDirectory ? `[${file.name}]` : file.name;
							linkName = linkName.replace(/ /g, '&nbsp;');
							const sizeStr = isDirectory ? folderSizeStub : getStrSize(stats.size, localeTranslation);
							const modify = stats.mtime.toLocaleDateString(clientLang) + ' ' + stats.mtime.toLocaleTimeString(clientLang);
							if (urlHeader === '' && (file.name === 'index.html' || file.name === 'robots.txt')) file.name = '_' + file.name;
							const linkHref = encodeURI(urlHeader) + '/' + encodeURIComponent(file.name);
							const ext = isDirectory ? 'folder' : path.extname(file.name);
							const iconnClassName = getIconClassName(ext);
							const showInBrowser = !isDirectory && canShowInBrowser(ext);
							const fileNameInBase64 = Buffer.from(file.name).toString('base64url');
							hrefs.push({ value:
`				<div class="main_container__first_column">
					<input id="item-checkbox-${fileIndex}" aria-label="${getTranslation('select', localeTranslation)}" type="checkbox" name="${fileNameInBase64}">${UPLOAD_ENABLE ? `
					<div class="rename_button"><button hidden title="${getTranslation('rename', localeTranslation)}" id="rename-button-${fileIndex}"></button><div></div></div>` : ''}
					<div class="${iconnClassName}"></div>
					<a href="${linkHref}"${isDirectory ? '' : ' download'}>${linkName}</a>${ext === '.zip' && UPLOAD_ENABLE ? `
					<a href="${linkHref}?unzip=true" class="flex_right_icons unzip_icon" aria-label="${getTranslation('linkToUnzip', localeTranslation)}"></a>` : ''}${showInBrowser ? `
					<a href="${linkHref}" class="flex_right_icons open-in-browser-icon" target="_blank" aria-label="${getTranslation('linkToOpenInBrowser', localeTranslation)}"></a>` : ''}
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
							if (countFiles === 0) prepareToSendFiles();
						}
					});
				}
				function prepareToSendFiles()
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
						_indexHtmlbase[4] + getTranslation('downloadZip', localeTranslation) +
						_indexHtmlbase[5] + getTranslation('deselectAll', localeTranslation) +
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
						_indexHtmlbase[19] + getTranslation('invalidName', localeTranslation) +
						_indexHtmlbase[20] + getTranslation('folderName', localeTranslation) +
						_indexHtmlbase[21] + getTranslation('uploadFiles', localeTranslation) +
						_indexHtmlbase[22] + getTranslation('dragAndDropText', localeTranslation) +
						_indexHtmlbase[23] + getTranslation('deleteFilesWarning', localeTranslation) +
						_indexHtmlbase[24] + getTranslation('yes', localeTranslation) +
						_indexHtmlbase[25] + getTranslation('no', localeTranslation) +
						_indexHtmlbase[26] + getTranslation('deleteWithoutAsk', localeTranslation) +
						_indexHtmlbase[27]) : ''}` +
						_indexHtmlbase[28] + errorMessage +
						_indexHtmlbase[29] + getTranslation('poweredBy', localeTranslation) +
						_indexHtmlbase[30] + getTranslation('lightTheme', localeTranslation) +
						_indexHtmlbase[31] + getTranslation('lightTheme', localeTranslation) +
						_indexHtmlbase[32] + getTranslation('autoTheme', localeTranslation) +
						_indexHtmlbase[33] + getTranslation('autoTheme', localeTranslation) +
						_indexHtmlbase[34] + getTranslation('darkTheme', localeTranslation) +
						_indexHtmlbase[35] + getTranslation('darkTheme', localeTranslation) +
						_indexHtmlbase[36] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[37] + getTranslation('inputNewName', localeTranslation) +
						_indexHtmlbase[38] + getTranslation('invalidName', localeTranslation) +
						_indexHtmlbase[39] + getTranslation('newName', localeTranslation) +
						_indexHtmlbase[40] + getTranslation('ok', localeTranslation) +
						_indexHtmlbase[41] + getTranslation('cancel', localeTranslation) +
						_indexHtmlbase[42]) : ''}` +
						_indexHtmlbase[43];
			}
		}
	});
}

function checkIsDirectory(path, dirent, next)
{
	if (dirent.isSymbolicLink())
	{
		fs.readlink(path, (err, linkPath) =>
		{
			if (err)
			{
				console.log(err?.message);
				next(null);
			}
			fs.stat(linkPath, (err, stats) =>
			{
				if (err)
				{
					console.log(err?.message);
					next(null);
				}
				next(stats.isDirectory());
			});
		});
	}
	else
	{
		next(dirent.isDirectory());
	}
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
			if (typeof ifPrimary === 'function') ifPrimary(key, primary[key]);
			return primary[key];
		}
		if (secondary)
		{
			if (secondary[key])
			{
				if (typeof ifSecondary === 'function') ifSecondary(key, secondary[key]);
				return secondary[key];
			}
			if (typeof ifDefault  === 'function') ifDefault(key, defaultValue);
			return defaultValue;
		}
		if (typeof ifDefault === 'function') ifDefault(key, defaultValue);
		return defaultValue;
	}
	if (secondary)
	{
		if (secondary[key])
		{
			if (typeof ifSecondary === 'function') ifSecondary(key, secondary[key]);
			return secondary[key];
		}
		if (typeof ifDefault === 'function') ifDefault(key, defaultValue);
		return defaultValue;
	}
	if (typeof ifDefault === 'function') ifDefault(key, defaultValue);
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

function error404(err, res, acceptEncoding, localeTranslation, clientLang)
{
	sendCachedFile(res,
		_404_html[0] + clientLang +
		_404_html[1] + (DIRECTORY_MODE_TITLE ? DIRECTORY_MODE_TITLE : getTranslation('defaultTitle', localeTranslation)) +
		_404_html[2] + getTranslation('pageNotPhound', localeTranslation) +
		_404_html[3],
		'text/html; charset=utf-8', acceptEncoding, 404);
	console.log('Not found: ' + err);
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
function sendFile(res, filePath, size, acceptEncoding, localeTranslation, clientLang)
{
	let file = fs.createReadStream(filePath);
	file.pipe(res);
	file.on('error', (err) => error404(err, res, acceptEncoding, localeTranslation, clientLang));
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
							const fileDir = path.dirname(fullPath);
							fs.mkdir(fileDir, { recursive: true }, err =>
							{
								if (err)
								{
									perform(err);
								}
								else
								{
									fs.writeFile(fullPath, data, err =>
									{
										perform(err);
									});
								}
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
	case '.mjs':
	case '.csv':
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
	if (ext === '.mjs') return 'text/javascript; charset=utf-8';
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
	if (ext === '.csv') return 'text/plain; charset=UTF-8';
	if (ext === '.yml' || ext === '.yaml') return 'text/yaml; charset=UTF-8';
	return 'application/octet-stream';
}

function md5(buffer)
{
	const data = new Uint8Array(buffer);
	const ABCD0 = new Uint32Array(4);
	ABCD0[0] = 0x67452301;
	ABCD0[1] = 0xefcdab89;
	ABCD0[2] = 0x98badcfe;
	ABCD0[3] = 0x10325476;

	const s1 = [7, 12, 17, 22];
	const s2 = [5, 9, 14, 20];
	const s3 = [4, 11, 16, 23];
	const s4 = [6, 10, 15, 21];
	const T = new Uint32Array([0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391]);

	//Считаем размер сообщения
	let originalMessageSize = new BigUint64Array(1);
	originalMessageSize[0] = BigInt(data.length) * 8n;
	originalMessageSize = new Uint8Array(originalMessageSize.buffer);

	//Выравниваем сообщение
	let addToMessageSize = 64 - (data.length + 8) % 64;
	if (addToMessageSize === 0) addToMessageSize = 1;
	const newData = new Uint8Array(data.length + addToMessageSize + 8);
	for (let i = 0; i < data.length; i++)
	{
		newData[i] = data[i];
	}
	newData[data.length] = 128;
	for (let i = data.length + 1; i < newData.length - 8; i++)
	{
		newData[i] = 0;
	}
	for (let i = newData.length - 8; i < newData.length; i++)
	{
		newData[i] = originalMessageSize[i - newData.length + 8];
	}

	//Работем с сообщением
	const chunk = new Uint8Array(64);
	const chunk32 = new Uint32Array(chunk.buffer);
	const ABCDF = new Uint32Array(5);
	for (let i = 0; i < newData.length / 64; i++)
	{
		for (let j = 0; j < 64; j++)
		{
			chunk[j] = newData[i * 64 + j];
		}
		for (let j = 0; j < 4; j++)
		{
			ABCDF[j] = ABCD0[j];
		}
		let g = 0;
		let s;
		for (let j = 0; j < 64; j++)
		{
			if (0 <= j && j <= 15)
			{
				ABCDF[4] = (ABCDF[1] & ABCDF[2]) | ((~ABCDF[1]) & ABCDF[3]);
				g = j;
				s = s1;
			}
			else if (16 <= j && j <= 31)
			{
				ABCDF[4] = (ABCDF[3] & ABCDF[1]) | ((~ABCDF[3]) & ABCDF[2]);
				g = (5 * j + 1) % 16;
				s = s2;
			}
			else if (32 <= j && j <= 47)
			{
				ABCDF[4] = ABCDF[1] ^ ABCDF[2] ^ ABCDF[3];
				g = (3 * j + 5) % 16;
				s = s3;
			}
			else
			{
				ABCDF[4] = ABCDF[2] ^ (ABCDF[1] | (~ABCDF[3]));
				g = (7 * j) % 16;
				s = s4;
			}
			ABCDF[4] += ABCDF[0] + T[j] + chunk32[g];
			ABCDF[0] = ABCDF[3];
			ABCDF[3] = ABCDF[2];
			ABCDF[2] = ABCDF[1];
			ABCDF[1] += cycleLeftShift(ABCDF[4], s[j % 4]);
		}
		for (let j = 0; j < 4; j++)
		{
			ABCD0[j] += ABCDF[j];
		}
	}
	return ABCD0.buffer;

	function cycleLeftShift(data, n)
	{
		return (data << n) | (data >>> 32 - n);
	}
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
function checkUpload(args)
{
	let flag = false;
	let index = args.indexOf('--upload');
	if (index !== -1)
	{
		args.splice(index, 1);
		flag = true;
	}
	index = args.indexOf('-u');
	if (index !== -1)
	{
		args.splice(index, 1);
		flag = true;
	}
	index = args.indexOf('-U');
	if (index !== -1)
	{
		args.splice(index, 1);
		flag = true;
	}
	let env = Number(process.env.SERVER_UPLOAD_ENABLE);
	if (!Number.isNaN(env) && env > 0) flag = true;
	return flag;
}