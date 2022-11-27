#!/usr/bin/env node
'use strict';
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const cpus = require('os').cpus;
const JSZip = require('jszip');

const USE_CLUSTER_MODE = process.env.SERVER_USE_CLUSTER_MODE;
const SHOULD_RESTART_WORKER = process.env.SERVER_SHOULD_RESTART_WORKER;
const DIRECTORY_MODE = process.env.SERVER_DIRECTORY_MODE;
const DIRECTORY_MODE_TITLE = process.env.SERVER_DIRECTORY_MODE_TITLE;
const AUTO_REDIRECT_HTTP_PORT = process.env.SERVER_AUTO_REDIRECT_HTTP_PORT;

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
const PORT = process.argv[3] || process.env.SERVER_PORT;
const key = process.argv[4] || process.env.SERVER_KEY;
const cert = process.argv[5] || process.env.SERVER_CERT;
const username = process.argv[6] || process.env.SERVER_USERNAME;
const password = process.argv[7] || process.env.SERVER_PASSWORD;

if (!ROOT_PATH || !PORT)
{
	console.log(`Для запуска требуется ввести нужные параметры:
node server.js <Путь к папке с веб сайтом> <port> [<key> <cert>] [<username> <password>]

Путь может быть относительным или абсолютным.
Если в заданной папке не будет файла "index.html", то сервер запустится в режиме отображения содержимого директории.
В этом случае при запросе к серверу будет отдаваться веб страница с сылками для скачивания файлов, лежащих в этой папке.
Режим отображения содержмимого директориии можно включить принудительно, задав переменную окружения SERVER_DIRECTORY_MODE=1.
Также этот режим можно принудительно отключить, задав SERVER_DIRECTORY_MODE=0.
В режиме отображения содержимого директории можно задать заголовок страницы в переменной окружения SERVER_DIRECTORY_MODE_TITLE.

В квадратных скобках указаны необязательные параметры:
К серверу можно подключить ssl сертификат, чтобы он работал через https.
<key> и <cert> - Путь к файлу закрытого ключа, и путь к файлу сертификата соответственно.
Если эти параметры заданы, то сервер будет использовать https вместо http.
В этом режиме, можно включить автоматическое перенаправление с http на https.
Для этого нужно в переменной окружения SERVER_AUTO_REDIRECT_HTTP_PORT указать номер http порта, с которого будет осуществляться перенаправление (обычно 80).

<username> и <password> - Включает базовую HTTP аутентификацию с заданными именем пользователя и паролем.

Все параметры коммандной строки можно задавать также в переменных окружения: SERVER_ROOT, SERVER_PORT, SERVER_KEY, SERVER_CERT, SERVER_USERNAME, SERVER_PASSWORD.
Параметры, заданные в коммандной строке имеют более высокий приоритет.

Кроме того, сервер можно запустить в режиме кластера путём задания переменной окрежения SERVER_USE_CLUSTER_MODE=1.
В этом случае будут созданы дочерние процессы nodejs по числу ядер процессора.
Этот режим позволяет задействовать в работе сервера весь ресурс процессора, но при этом кратно возрастает потребление опертивной памяти.
Для режима кластера имеется возможность задать переменную окружения SERVER_SHOULD_RESTART_WORKER=1.
Это приведёт к автоматическому перезапуску дочернего процесса в случае его непредвиденного завершения.`);
	process.exit(0);
}

const numCPUs = cpus().length;
if (cluster.isPrimary)
{
	console.log('Port = ' + PORT);
	console.log('Root = ' + ROOT_PATH);
	if (USE_CLUSTER_MODE) console.log('CPUs number = ' + numCPUs);
}

let _generateIndex = false;
let _indexHtmlbase = null;
let _favicon = null;
let _index_js = null;
let _index_css = null;
let _robots_txt = null;
let _locales = null;

fs.stat(ROOT_PATH, (err, stats) =>
{
	if (err)
	{
		console.log(err.message);
		process.exit(1);
	}
	else if (!stats.isDirectory())
	{
		console.log('Переданный путь не является директорией!');
		process.exit(1);
	}
	else
	{
		if (DIRECTORY_MODE !== undefined)
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
			if (cluster.isPrimary) console.log('Directory watch mode.');
			_indexHtmlbase = fs.readFileSync(path.join(__dirname, 'app_files', 'index.html')).toString().split('~%~');
			_favicon = fs.readFileSync(path.join(__dirname, 'app_files', 'favicon.ico'));
			_index_js = fs.readFileSync(path.join(__dirname, 'app_files', 'index.js'));
			_index_css = fs.readFileSync(path.join(__dirname, 'app_files', 'index.css'));
			_robots_txt = fs.readFileSync(path.join(__dirname, 'app_files', 'robots.txt'));
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
		/*Post данные*/
		let body = '';
		req.on('data', chunk =>
		{
			body += chunk;
			if (body.length > 1e6) req.connection.destroy();
		});
		req.on('end', () =>
		{
			const paramsPost = parseRequest(body);
			answer(res, urlPath, paramsGet, cookie, paramsPost);
		});
	}
}

function parseRequest(data)
{
	let params = null;
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

function answer(res, urlPath, paramsGet, cookie, paramsPost)
{

	sendFileByUrl(res, urlPath, paramsGet, cookie, paramsPost);
	if (paramsGet) console.log(paramsGet);
	if (paramsPost) console.log(paramsPost);
}

function sendCachedFile(res, file, contentType)
{
	res.writeHead(200,
		{
			'Content-Length': file.byteLength,
			'Content-Type': contentType,
			'Cache-Control': 'max-age=86400'
		});
	res.end(file);
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
	}
	return false;
}
//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath, paramsGet, cookie)
{
	if (_generateIndex)
	{
		switch (urlPath)
		{
		case '/favicon.ico':
			sendCachedFile(res, _favicon, 'image/x-icon');
			return;
		case '/index.js':
			sendCachedFile(res, _index_js, 'text/javascript; charset=utf-8');
			return;
		case '/index.css':
			sendCachedFile(res, _index_css, 'text/css; charset=utf-8');
			return;
		case '/robots.txt':
			sendCachedFile(res, _robots_txt, 'text/plain; charset=utf-8');
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
		}
	}
	let filePath = path.join(ROOT_PATH, urlPath);
	fs.stat(filePath, (err, stats) =>
	{
		if (err)
		{
			error(err, res);
		}
		else if (stats.isDirectory())
		{
			if (_generateIndex)
			{
				if (paramsGet?.download)
				{
					zipFolder(filePath, res);
				}
				else
				{
					generateAndSendIndexHtml(res, urlPath, filePath, cookie, paramsGet);
				}
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
		}
		else
		{
			sendFile(res, filePath, stats.size);
		}
	});
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

function getClientLanguageFromCookie(cookie, responseCookie)
{
	let clientLang = cookie?.lang;
	if (!clientLang) return DEFAULT_LANG;
	if (_locales.has(clientLang)) return clientLang;
	for (let locale of _locales)
	{
		if (locale[0].startsWith(clientLang))
		{
			//Сохраним в куках найденную локаль, чтобы каждый раз не искать.
			responseCookie.push(`lang=${locale[0]}; path=/; max-age=86400; samesite=strict`);
			return locale[0];
		}
	}
	return DEFAULT_LANG;
}

function generateAndSendIndexHtml(res, urlPath, absolutePath, cookie, paramsGet)
{
	const responseCookie = [];
	fs.readdir(absolutePath, { withFileTypes: true }, (err, files) =>
	{
		if (err)
		{
			error(err, res);
		}
		else
		{
			const clientLang = getClientLanguageFromCookie(cookie, responseCookie);
			let localeTranslation = _locales.get(clientLang);
			let hrefs = [];
			const urlHeader = urlPath[urlPath.length - 1] === '/' ? urlPath.slice(0, urlPath.length - 1) : urlPath;
			let folderName = '/';
			const folderSizeStub = getTranslation('folderSizeStub', localeTranslation);
			let hrefsResult = '';
			//Массив sortLinks содержит html код ссылок для сортировки.
			const sortLinks = new Array(3);
			if (urlPath !== '/')
			{
				const lastField = urlHeader.lastIndexOf('/');
				const backUrl = lastField === 0 ? '/' : urlHeader.slice(0, lastField);
				hrefsResult = `<a href="/">[/]</a><span>${folderSizeStub}</span><span>-</span><a href="${backUrl}">[..]</a><span>${folderSizeStub}</span><span>-</span>`;
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
							console.log(err.message);
							return;
						}
						const isDirectory = file.isDirectory();
						const linkName = isDirectory ? `[${file.name}]` : file.name;
						const sizeStr = isDirectory ? folderSizeStub : getStrSize(stats.size, localeTranslation);
						const modify = stats.mtime.toLocaleDateString(clientLang) + ' ' + stats.mtime.toLocaleTimeString(clientLang);
						const linkHref = encodeURI(`${urlHeader}/${isAppFile(file.name) ? '_' : ''}${file.name}`);
						hrefs.push({ value: `<a href="${linkHref}"${isDirectory ? '' : ' download'}>${linkName}</a><span>${sizeStr}</span><span>${modify}</span>`, isDirectory, name: file.name, size: stats.size, modify: stats.mtime });
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
							sendHtmlString(res, combineHtml(true), responseCookie);
						}
					});
				}
			}
			else
			{
				sendHtmlString(res, combineHtml(false), responseCookie);
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
				return  _indexHtmlbase[0] + (DIRECTORY_MODE_TITLE ? DIRECTORY_MODE_TITLE : getTranslation('defaultTitle', localeTranslation)) +
						_indexHtmlbase[1] + folderName +
						_indexHtmlbase[2] + `${urlPath}?download=true` +
						_indexHtmlbase[3] + getTranslation('downloadAll', localeTranslation) +
						_indexHtmlbase[4] + getTranslation('fileName', localeTranslation) +
						_indexHtmlbase[5] + (hasFiles ? sortLinks[0] : '') +
						_indexHtmlbase[6] + getTranslation('fileSize', localeTranslation) +
						_indexHtmlbase[7] + (hasFiles ? sortLinks[1] : '') +
						_indexHtmlbase[8] + getTranslation('modifyDate', localeTranslation) +
						_indexHtmlbase[9] + (hasFiles ? sortLinks[2] : '') +
						_indexHtmlbase[10] + hrefsResult +
						_indexHtmlbase[11];
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

function sendHtmlString(res, data, cookie)
{
	const head =
	{
		'Content-Length': Buffer.from(data).byteLength,
		'Content-Type': 'text/html; charset=utf-8'
	};
	if (cookie)
	{
		if (cookie?.length)
		{
			head['Set-Cookie'] = cookie;
		}
	}
	res.writeHead(200, head);
	res.end(data);
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
			console.log('Connection lost: ' + filePath);
		}
	});
	res.on('finish', () =>
	{
		console.log('Sent successfully: ' + filePath);
	});

}

function zipFolder(folderPath, res)
{
	const folderName = path.basename(folderPath);
	const rootDir = path.dirname(folderPath);
	const zip = new JSZip();

	let numberOfFile = 0;
	let numberOfRecursive = 0;
	readFolderRecursive(folderPath);
	function readFolderRecursive(folderPath)
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
					if (file.isDirectory())
					{
						readFolderRecursive(path.join(folderPath, file.name), true);
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
								const relativePath = path.join(path.relative(rootDir, folderPath), file.name);
								zip.file(relativePath, data);
								if (numberOfRecursive === 0 && numberOfFile === 0) sendZip();
							}
						});
					}
				}
			}
			else
			{
				const relativePath = path.join(path.relative(rootDir, folderPath));
				zip.folder(relativePath);
			}
			numberOfRecursive--;
			if (numberOfRecursive === 0 && numberOfFile === 0) sendZip();
		});
		function zipError(err, res)
		{
			const commonMsg = 'Zip generate error!';
			console.log(commonMsg + ' ' + err.message);
			const msg = commonMsg + (err.code === 'ERR_FS_FILE_TOO_LARGE' ? ' File size is greater than 2 GiB' : '');
			res.writeHead(500,
				{
					'Content-Length': msg.length,
					'Content-Type': 'text/plain'
				});
			res.end(msg);
		}
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
			console.log(`Zip archive ${folderName}.zip sent successfully.`);
		});
	}
}

function getContentType(ext)
{
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
	return 'application/octet-stream';
}