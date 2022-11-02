'use strict';
const USE_CLUSTER_MODE = true;
const SHOULD_RESTART_WORKER = true;
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const cpus = require('os').cpus;

let cluster;
if (USE_CLUSTER_MODE)
{
	cluster = require('cluster');
}
else
{
	cluster = { isPrimary: true };
}

const ROOT_PATH = process.argv[2]; //Папка относительно которой будут задаваться все папки, которые идут с адресом
const PORT = process.argv[3];
const key = process.argv[4];
const cert = process.argv[5];
const username = process.argv[6];
const password = process.argv[7];

if (!ROOT_PATH)
{
	console.log(`Для запуска требуется ввести нужные параметры:
node server.js <Путь к папке с веб сайтом> <port> [<key> <cert>] [<username> <password>]

Путь может быть относительным или абсолютным.

В квадратных скобках указаны необязательные параметры:
К серверу можно подключить ssl сертификат, чтобы он работал через https.
В этом случае можно задать базовую http аутентификацию, чтобы ограничить доступ.

<key> и <cert> - Путь к файлу закрытого ключа, и путь к файлу сертификата соответственно.
Если эти параметры заданы, то сервер будет использовать https вместо http.

<username> и <password> - Включает базовую HTTP аутентификацию с заданными именем пользователя и паролем`);
	process.exit(0);
}

const numCPUs = cpus().length;
if (cluster.isPrimary)
{
	console.log('port = ' + PORT);
	console.log('CPUs number = ' + numCPUs);
}

let _generateIndex = false;
let _indexHtmlbase = null;
let _favicon = null;

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
		let indexFile = path.join(ROOT_PATH, 'index.html');
		if (!fs.existsSync(indexFile))
		{
			_generateIndex = true;
			if (cluster.isPrimary) console.log('Directory watch mode.');
			_indexHtmlbase = fs.readFileSync('index.html').toString().split('|');
			_favicon = fs.readFileSync('favicon.ico');
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
	}
	else
	{
		http.createServer(app).listen(PORT);
	}
}

function app(req, res)
{
	let now = new Date();
	let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
	if (now - _lastReqTime > 1000 || _lastIP !== ip) console.log(`*******${ip}, ${now.toLocaleString('ru-RU', { hour: 'numeric', minute: 'numeric', second: 'numeric' })} *******`);
	_lastReqTime = now;
	_lastIP = ip;
	//Проводим аутентификацию
	if (username)
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
		if (urlPath.match(/[/\\]\.+\.[/\\]/)) error(`You can watch only ${ROOT_PATH} directory`, res);
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
			answer(res, urlPath, paramsGet, paramsPost);
		});
	}
}

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

//Поиск и сопоставление нужных путей
function sendFileByUrl(res, urlPath)
{
	if (_generateIndex && urlPath === '/favicon.ico')
	{
		sendIcon(res);
		return;
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
				fs.readdir(filePath, { withFileTypes: true }, (err, files) =>
				{
					if (err)
					{
						error(err, res);
					}
					else
					{
						let hrefs = [];
						const urlHeader = urlPath[urlPath.length - 1] === '/' ? urlPath.slice(0, urlPath.length - 1) : urlPath;
						let title = '/';
						if (urlPath !== '/')
						{
							hrefs.push('<a href="/">[/]</a>');
							const lastField = urlHeader.lastIndexOf('/');
							const backUrl = lastField === 0 ? '/' : urlHeader.slice(0, lastField);
							hrefs.push(`<a href="${backUrl}">[..]<a/>`);
							title = urlHeader.slice(lastField + 1);
						}
						//Сортируем по алфавиту, но так, чтобы папки были сверху.
						files.sort((a, b) =>
						{
							if (a.isDirectory() && !b.isDirectory()) return -1;
							if (a.isDirectory() && b.isDirectory()) return a.name.localeCompare(b.name);
							if (!a.isDirectory() && b.isDirectory()) return 1;
							if (!a.isDirectory() && !b.isDirectory()) return a.name.localeCompare(b.name);
						});
						for (let file of files)
						{
							const hrefName = file.isDirectory() ? `[${file.name}]` : file.name;
							hrefs.push(`<a href="${urlHeader}/${file.name}">${hrefName}<a/>`);
						}
						let resultHtml = _indexHtmlbase[0] + title + _indexHtmlbase[1] + hrefs.join('<br>') + _indexHtmlbase[2];
						sendHtmlString(res, resultHtml);
					}
				});
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
function sendHtmlString(res, data)
{
	res.writeHead(200,
		{
			'Content-Length': Buffer.from(data).byteLength,
			'Content-Type': 'text/html; charset=utf-8'
		});
	res.end(data);
}

function sendIcon(res)
{
	res.writeHead(200,
		{
			'Content-Length': _favicon.byteLength,
			'Content-Type': 'image/x-icon'
		});
	res.end(_favicon);
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
	if (_generateIndex) return 'application/octet-stream'; //Если мы просто расшариваем папку, то все файлы отдавать как бинарники.
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
