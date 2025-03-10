#!/usr/bin/env node

/*
The MIT License (MIT)

Copyright (c) Александр Меняйло (Aleksandr Meniailo), Mendeo 2025 (thesolve@mail.ru, deorathemen@gmail.com)

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
const crypto = require('crypto');
const cluster = require('cluster');
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
{//Show license
	const l = process.argv.includes('-l') || process.argv.includes('-L') || process.argv.includes('--license');
	if (l)
	{
		const license = fs.readFileSync(path.join(__dirname, 'LICENSE.txt')).toString();
		console.log(license);
		process.exit(0);
	}
}
{//Show help
	const h = process.argv.includes('-h') || process.argv.includes('-H') || process.argv.includes('--help');
	if (h)
	{
		const help =
`web-shared-folder

This is free software and is provided "as is", without warranty of any kind (MIT License).

Convenient http server on nodejs. Designed to share files and folders on a local network or even
on the Internet via a web interface. Can also be used as a web server to serve static sites.

Capabilities

- Shared directory in a local network or the Internet via a web interface.
- There is an option not only to download data from a specified folder but also to upload data to it.
- It is possible to create users with access only to a specified folder.
- It can work as a server for hosting a static website.
- It is possible to work over HTTPS protocol with an automatic redirect from HTTP.
- If the load is high, then you can enable cluster mode, using all cores of the server machine.
- There is a dark theme.
- Pages are automatically displayed in the user language (only two languages are available at the moment).

Usage
wsf </path/to/folder/for/sharing> <port> [</path/to/key> </path/to/cert>] [--upload or -u]

To output only the version number:
wsf -v [or --version]

To output license
wsf -l [or --license]

Instead of "wsf" you can use the full program name "web-shared-folder".

Basic

To run the server, you need to specify at least the path to the directory to be shared and
the port number on which the server will operate. The folder path is specified in the first
parameter, followed by the port number.

The web-shared-folder server operates as follows:
If there is an index.html file in the root of the specified directory, web-shared-folder
starts working as a web server that hosts a static website and sends index.html when the root URL
is requested. Otherwise, the server switches to a mode that displays the contents of the directory
specified in the startup parameters. In this case, the user can download files and folders located
in that directory.

Example:
wsf . 80

If there is no index.html file in the root directory, this command will start the server on port 80
and share the current folder for browsing and downloading.
The server will be accessible on all available network interfaces (this can be changed by setting
the appropriate environment variable). For example, if the server has an IP address of 192.168.1.2,
you can access it in the local network by entering the address http://192.168.1.2 in your browser.
Since the standard port number 80 is used, the port number does not need to be specified in the
address. If a non-standard port number is used, such as 8080, it must be included in the address:
http://192.168.1.2:8080. On Linux machines, you may need to run the program from root to work with
port 80.

The eye-shaped link next to the file allows you to open it directly in the browser in a separate tab.
This way, you can view, for example, text, photos, or some videos (if the browser supports the encoding).

If you need to give users the ability to upload files to the server in a shared folder, as well as the
ability to rename, delete, and move existing files and folders, then the web-shared-folder server must
be launched with the --upload or -u key.

However, there are limitations on file uploads. The issue is that the uploaded files are transmitted
in a single request, and browsers have a limit on the duration of such a request, typically 5 or 10
minutes (depending on the browser). If the upload duration exceeds this time, it will end with an
error. Another limitation is the total size of files uploaded at once. It should not exceed 2 GiB.

Example:
wsf . 80 -u

In this mode, clicking on the link in the form of an up arrow next to the zip archive file will unpack
this archive into the current directory.

Using the HTTPS

To work over HTTPS, you need to specify the path to the SSL secret key file (usually privkey.pem) and
the path to the SSL certificate file (usually fullchain.pem).

Example:
wsf . 443 /etc/ssl/privkey.pem /etc/ssl/fullchain.pem

or with upload capability enabled:
wsf . 443 /etc/ssl/privkey.pem /etc/ssl/fullchain.pem -u

In the examples above, the standard port number for HTTPS is used: 443. The private key and
certificate files are typically issued by certification authorities organizations. However,
you can also generate a self-signed certificate, for example, using openssl, but in this case,
the browser will display a warning.

Environment variables

Advanced server configuration is done by setting environment variables.
First of all, you can store the command-line arguments described above in these variables and run the
server without any additional arguments.

Below is a list with describing all possible environment variables.

    Basic environment variables

WSF_ROOT
Path to the folder that needs to be made publicly accessible.

WSF_PORT
Port that the server will listen on.

WSF_UPLOAD_ENABLE
Switches the server to a mode in which the user can upload their files to the shared folder, as well
as move, rename and delete files and folders within it.

WSF_DIRECTORY_MODE
If there is an "index.html" file in the root folder, the server by default starts in the mode of
displaying the web page associated with "index.html", rather than displaying the directory contents.
To forcibly switch to directory browsing mode, set "WSF_DIRECTORY_MODE=1".

WSF_DIRECTORY_MODE_TITLE
Sets the title of the pages displayed in the browser tab. By default, it displays "Remote file manager".

    Working via HTTPS

WSF_CERT
Path to the SSL certificate file (usually "fullchain.pem").

WSF_KEY
Path to the SSL private key file (usually "privkey.pem").

WSF_AUTO_REDIRECT_HTTP_PORT
When the server operates in secure mode (using HTTPS), it is possible to enable automatic redirection
for clients attempting to connect via HTTP. For example, if the server is running on the standard HTTPS
port 443, you can set up automatic redirection for clients connecting via HTTP (standard port 80) by
setting "WSF_AUTO_REDIRECT_HTTP_PORT=80".

    Security Settings

WSF_ALLOWED_INTERFACES
List of interfaces on which the server will be accessible. By default, the server is accessible on all
available network interfaces, but this is not desirable if, for example, you need to restrict access
from external networks. This variable specifies a list of IP addresses (separated by commas) on which
the server will operate. For example, to allow access only from localhost, set
"WSF_ALLOWED_INTERFACES=127.0.0.1".

WSF_FORBIDDEN_PATHS
List of paths, relative to the root directory, that will not be displayed to clients. Paths are separated
by a colon ":". For example, to hide the ".git" and "secret" folders, set "WSF_FORBIDDEN_PATHS=.git:secret".

    User creation and access restrictions

WSF_USERS
Setting this environment variable switches the server to a mode where access to files is allowed to
specified users. The format of this variable is as follows: username, followed by the "@" symbol, then
the SHA-256 hash (hex) of the user's password, followed by the path the user will have access to, then
a colon ":" and similar data for other users. The path must start with a "/", be relative to the root
directory, and point to a folder. If there are errors in the path, they will only become apparent when
the user attempts to log in. Example:
username1@sha256password1InHex/path1/relative/ROOT_PATH:username2@sha256password2InHex/path2/relative/ROOT_PATH

Note that operating in this mode over HTTP is insecure, as usernames and passwords are transmitted over
the network in plain text and can be easily intercepted. To securely operate in this mode, use HTTPS.
In this case even with a self-signed SSL certificate, communication with the server will be encrypted.

WSF_SESSION_TIMEOUT
User session timeout (in seconds). If the user is inactive for this period, the session ends, and the
user will need to re-enter their username and password upon the next request. By default, this time is
set to 30 minutes.

WSF_SESSION_UPDATE_PAUSE_MILLISECONDS
The time (in milliseconds) during which the session will not be extended, even if requests are received
from the user. By default, this value is set to 5000 milliseconds.

    Cluster mode operation

WSF_USE_CLUSTER_MODE
Switches the server to cluster mode. In this mode, multiple copies of the server process (by number of
CPU cores) are launched, and the load is distributed among these processes, allowing full utilization of
CPU resources and increasing server performance under high request loads. However, this mode also requires
a significant amount of RAM. At the same time, this mode makes the server more resilient, as setting the
"WSF_SHOULD_RESTART_WORKER" variable will automatically restart worker processes in case of failures.

WSF_SHOULD_RESTART_WORKER
Whether to restart worker processes in cluster mode in case of unexpected termination. By default, these
processes are not restarted.

    Appearance customization

WSF_ICONS_TYPE
Web-shared-folder uses the "file-icon-vectors" (https://www.npmjs.com/package/file-icon-vectors) npm
package to display file and folder icons. There are three available icon styles: "classic", "square-o",
and "vivid". You can set "WSF_ICONS_TYPE" to one of these options. By default, "square-o" is used.

    Other settings

WSF_DISABLE_COMPRESSION
Allows to forcibly disable file compression during network transmission. This is useful for debugging
purposes and does not affect what is displayed in the user's browser.

WSF_SHOW_SYSTEM_FILES_REQUESTS
Forces the server to log not only requests to shared files but also requests to the web-shared-folder
application files themselves, requested from a path starting with "/wsf_app_files", such as
"/wsf_app_files/favicon.icon" and others.
`;
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
const USE_CLUSTER_MODE = Number(process.env.WSF_USE_CLUSTER_MODE);
const SHOULD_RESTART_WORKER = Number(process.env.WSF_SHOULD_RESTART_WORKER);
const DIRECTORY_MODE = Number(process.env.WSF_DIRECTORY_MODE);
const AUTO_REDIRECT_HTTP_PORT = Number(process.env.WSF_AUTO_REDIRECT_HTTP_PORT);
const DISABLE_COMPRESSION = Number(process.env.WSF_DISABLE_COMPRESSION);
let ROOT_PATH_RAW = ARGS[2] || process.env.WSF_ROOT;
ROOT_PATH_RAW = ROOT_PATH_RAW ? ROOT_PATH_RAW.replace(/"/g, '') : null;
if (ROOT_PATH_RAW && !path.isAbsolute(ROOT_PATH_RAW)) ROOT_PATH_RAW = path.join(process.cwd(), ROOT_PATH_RAW);
const ROOT_PATH = ROOT_PATH_RAW; //Папка относительно которой будут задаваться все папки, которые идут с адресом
ROOT_PATH_RAW = null;
const PORT = Number(ARGS[3] || process.env.WSF_PORT);
const KEY = ARGS[4] || process.env.WSF_KEY;
const CERT = ARGS[5] || process.env.WSF_CERT;
const USERS_RAW = process.env.WSF_USERS;

//Format: username1@sha256password1InHex/path1/relative/ROOT_PATH:username2@sha256password2InHex/path2/relative/ROOT_PATH
let USERS = null;
if (USERS_RAW)
{
	const usersStrs = USERS_RAW.split(':');
	if (usersStrs.length > 0)
	{
		USERS = new Map();
		for (let ustr of usersStrs)
		{
			const ustrArr = ustr.split('@');
			if (ustrArr.length !== 2)
			{
				USERS = null;
				console.log('Error in WSF_USERS (@)');
				break;
			}
			const username = ustrArr[0];
			const pp = ustrArr[1];
			const pi = pp.indexOf('/');
			if (pi === -1)
			{
				USERS = null;
				console.log('Error in WSF_USERS (/)');
				break;
			}
			const passwordHash = pp.slice(0, pi);
			if (passwordHash.length !== 64 || (/[^0-9a-f]/gi).test(passwordHash))
			{
				USERS = null;
				console.log('Error in WSF_USERS (not sha256 password)');
				break;
			}
			const root = pp.slice(pi);
			USERS.set(username, { passwordHash, root });
		}
	}
}

let _primarySessions = USERS ? new Map() : null;
let SESSION_TIMEOUT = Number(process.env.WSF_SESSION_TIMEOUT);
if (!SESSION_TIMEOUT) SESSION_TIMEOUT = 1800;
//Если запросы приходят чаще, чем это время, то сессия на эти запросы не обновляется.
let SESSION_UPDATE_PAUSE_MILLISECONDS = Number(process.env.WSF_SESSION_UPDATE_PAUSE_MILLISECONDS);
if (!SESSION_UPDATE_PAUSE_MILLISECONDS) SESSION_UPDATE_PAUSE_MILLISECONDS = 5000;

if (!ROOT_PATH || !PORT)
{
	console.log(`web-shared-folder, version ${VERSION}
To show help use "--help" key`);
	process.exit(0);
}

let ALLOWED_INTERFACES = null;
{
	const ifs = process.env.WSF_ALLOWED_INTERFACES;
	if (ifs) ALLOWED_INTERFACES = ifs.split(',').map(v => v.trim());
}

const numCPUs = USE_CLUSTER_MODE ? cpus().length : 1;
if (cluster.isPrimary)
{
	console.log('web-shared-folder, version ' + VERSION);
	console.log();
	console.log('This is free software and is provided "as is", without warranty of any kind.');
	console.log();
	console.log('Port = ' + PORT);
	console.log('Root = ' + ROOT_PATH);
	if (USE_CLUSTER_MODE) console.log('CPUs number = ' + numCPUs);
	console.log();
	console.log('Available on:');
	if (ALLOWED_INTERFACES)
	{
		const realIfs = [];
		for (let ip of getIpV4())
		{
			if(ALLOWED_INTERFACES.includes(ip))
			{
				console.log(ip);
				realIfs.push(ip);
			}
		}
		ALLOWED_INTERFACES = realIfs;
	}
	else
	{
		getIpV4().forEach(ip => console.log(ip));
	}
	console.log();
}

let _generateIndex = false;

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
		if (_generateIndex && cluster.isPrimary)
		{
			console.log('Directory watch mode.');
			if (DISABLE_COMPRESSION) console.log('Compression is disable.');
			if (UPLOAD_ENABLE) console.log('\x1b[31m%s\x1b[0m', 'Upload to server is enabled!');
		}

		if (cluster.isPrimary)
		{
			if (KEY && CERT)
			{
				console.log('Started in secure (HTTPS) mode.');
				if (AUTO_REDIRECT_HTTP_PORT)
				{
					if (AUTO_REDIRECT_HTTP_PORT === PORT)
					{
						console.log('HTTP port for autoredirect is equal to HTTPS port!');
						process.exit(1);
					}
					else
					{
						console.log(`Auto redirect from http port ${AUTO_REDIRECT_HTTP_PORT} is enabled.`);
					}
				}
			}
			else
			{
				console.log('Started in NOT secure (HTTP) mode.');
			}
			if (USERS) console.log('Authentication mode enabled.');
			if (USE_CLUSTER_MODE)
			{
				console.log(`Primary ${process.pid} is running`);
				// Fork workers.
				const workers = new Set();
				for (let i = 0; i < numCPUs; i++)
				{
					workers.add(cluster.fork());
				}
				if (USERS)
				{
					for (let w of workers)
					{
						w.on('message', (msg) =>
						{
							if (msg.newSession)
							{
								onNewSession(msg, w, workers);
							}
							else if (msg.deleteSession)
							{
								onDeleteSession(msg, w, workers);
							}
							else if (msg.updateSession)
							{
								onUpdateSession(msg, w, workers);
							}
							else if (msg.hasSession)
							{
								onHasSession(msg, w);
							}
						});
					}
				}
				cluster.on('exit', (worker, code, signal) =>
				{
					console.log(`Worker ${worker.process.pid} died. Code ${code}, signal: ${signal}`);
					workers.delete(worker);
					if (SHOULD_RESTART_WORKER)
					{
						console.log('Restarting...');
						const w = cluster.fork();
						workers.add(w);
						if (USERS)
						{
							w.on('message', (msg) =>
							{
								if (msg === 'ready')
								{
									for (let session of _primarySessions)
									{
										w.send({ newSession: session[0], username: session[1].username });
									}
									console.log('Restat complete.');
								}
								else if (msg.newSession)
								{
									onNewSession(msg, w, workers);
								}
								else if (msg.deleteSession)
								{
									onDeleteSession(msg, w, workers);
								}
								else if (msg.updateSession)
								{
									onUpdateSession(msg, w, workers);
								}
								else if (msg.hasSession)
								{
									onHasSession(msg, w);
								}
							});
						}
					}
				});

				function onNewSession(msg, currentWorker, workers)
				{
					const sessionId = msg.newSession;
					const timerId = setTimeout(() =>
					{
						_primarySessions.delete(sessionId);
						for (let w of workers)
						{
							w.send({ deleteSession: sessionId });
						}
					}, SESSION_TIMEOUT * 1000);
					_primarySessions.set(sessionId, { username: msg.username, timerId });
					for (let w of workers)
					{
						if (currentWorker !== w) w.send(msg);
					}
				}

				function onDeleteSession(msg, currentWorker, workers)
				{
					const sessionId = msg.deleteSession;
					clearTimeout(_primarySessions.get(sessionId));
					_primarySessions.delete(sessionId);
					for (let w of workers)
					{
						if (currentWorker !== w) w.send(msg);
					}
				}

				function onUpdateSession(msg, currentWorker, workers)
				{
					const sessionId = msg.updateSession;
					const sessionData = _primarySessions.get(sessionId);
					if (sessionData)
					{
						clearTimeout(sessionData.timerId);
						sessionData.timeStamp = msg.timeStamp;
						for (let w of workers)
						{
							if (currentWorker !== w) w.send(msg);
						}
						sessionData.timerId = setTimeout(() =>
						{
							_primarySessions.delete(sessionId);
							for (let w of workers)
							{
								w.send({ deleteSession: sessionId });
							}
						}, SESSION_TIMEOUT * 1000);
					}
				}

				function onHasSession(msg, currentWorker)
				{
					currentWorker.send({ hasSession: _primarySessions.has(msg.hasSession) });
				}
			}
			else
			{
				workerFlow();
			}
		}
		else
		{
			console.log(`Worker ${process.pid} started`);
			workerFlow();
		}
	}
});

function workerFlow()
{
	const SHOW_SYSTEM_FILES_REQUESTS = Number(process.env.WSF_SHOW_SYSTEM_FILES_REQUESTS);
	const DIRECTORY_MODE_TITLE = process.env.WSF_DIRECTORY_MODE_TITLE;
	const MAX_FILE_LENGTH = 2147483647;
	const MAX_STRING_LENGTH = require('buffer').constants.MAX_STRING_LENGTH;

	let ICONS_TYPE = process.env.WSF_ICONS_TYPE;
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

	const FILE_REG_EXP = new RegExp(/[<>":?*|\\/]/g);
	const DEFAULT_LANG = 'en-US';
	let DEFAULT_LOCALE_TRANSLATION = null;

	let _workerSessions = null;
	let _loginExceptions = null;

	if (USERS)
	{
		if (USE_CLUSTER_MODE) _workerSessions = new Map();
		_loginExceptions = new Set();
		_loginExceptions.add('/wsf_app_files/login.css');
		_loginExceptions.add('/wsf_app_files/favicon.ico');
		_loginExceptions.add('/wsf_app_files/404.css');
		_loginExceptions.add('/robots.txt');
		if (USE_CLUSTER_MODE)
		{
			process.on('message', (msg) =>
			{
				//console.log(msg);
				if (msg.newSession)
				{
					_workerSessions.set(msg.newSession, { username: msg.username });
				}
				else if (msg.deleteSession)
				{
					_workerSessions.delete(msg.deleteSession);
				}
				else if (msg.updateSession)
				{
					const sessionData = _workerSessions.get(msg.updateSession);
					sessionData.timeStamp = msg.timeStamp;
				}
			});
		}
	}

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
	let _login_css = null;
	let _login_html = null;
	const _icons_svg_map = new Map();
	const _icons_catalog = new Set();
	const _forbidden_paths = new Set();

	const FORBIDDEN_PATHS = process.env.WSF_FORBIDDEN_PATHS;
	if (FORBIDDEN_PATHS)
	{
		FORBIDDEN_PATHS.split(':').forEach(fp => _forbidden_paths.add(path.join(ROOT_PATH, fp)));
	}
	_forbidden_paths.add(path.join(ROOT_PATH, 'wsf_app_files'));

	if (_generateIndex)
	{
		_indexHtmlbase = fs.readFileSync(path.join(__dirname, 'app_files', 'index.html')).toString().split('~%~');
		_favicon = fs.readFileSync(path.join(__dirname, 'app_files', 'favicon.ico'));
		const index_js_splitted = fs.readFileSync(path.join(__dirname, 'app_files', 'index.js')).toString().split('/*---UPLOAD_SPLITTER---*/');
		_index_js = UPLOAD_ENABLE ? index_js_splitted.join('') : index_js_splitted[0] + index_js_splitted[2];
		const index_css_splitted = fs.readFileSync(path.join(__dirname, 'app_files', 'index.css')).toString().split('/*---UPLOAD_SPLITTER---*/');
		_index_css = UPLOAD_ENABLE ? index_css_splitted.join('') : index_css_splitted[0];
		_light_css = fs.readFileSync(path.join(__dirname, 'app_files', 'light.css'));
		_dark_css = fs.readFileSync(path.join(__dirname, 'app_files', 'dark.css'));
		_robots_txt = fs.readFileSync(path.join(__dirname, 'app_files', 'robots.txt'));
		readIconsFiles();
	}
	if (USERS)
	{
		_login_css = fs.readFileSync(path.join(__dirname, 'app_files', 'login.css'));
		_login_html = fs.readFileSync(path.join(__dirname, 'app_files', 'login.html')).toString().split('~%~');
	}
	readTranslationFiles();
	_404_css = fs.readFileSync(path.join(__dirname, 'app_files', '404.css'));
	_404_html = fs.readFileSync(path.join(__dirname, 'app_files', '404.html')).toString().split('~%~');
	start();

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
	let _lastUser = '';

	function start()
	{
		if (KEY && CERT)
		{
			const ssl_cert =
			{
				key: fs.readFileSync(KEY),
				cert: fs.readFileSync(CERT)
			};
			createServer(app, PORT, ssl_cert);
			if (AUTO_REDIRECT_HTTP_PORT) createServer(redirectApp, AUTO_REDIRECT_HTTP_PORT);
		}
		else
		{
			createServer(app, PORT);
		}
	}

	function createServer(app, port, ssl_cert)
	{
		if (ALLOWED_INTERFACES)
		{
			for (let ip of ALLOWED_INTERFACES)
			{
				if (ssl_cert)
				{
					https.createServer(ssl_cert, app).listen(port, ip);
				}
				else
				{
					http.createServer(app).listen(port, ip);
				}
			}
		}
		else
		{
			if (ssl_cert)
			{
				https.createServer(ssl_cert, app).listen(port);
			}
			else
			{
				http.createServer(app).listen(port);
			}
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
		//console.log(`Pid: ${process.pid}, isPrimary: ${cluster.isPrimary}, size: ${USE_CLUSTER_MODE ? (cluster.isPrimary ? _primarySessions.size : _workerSessions.size) : 'not a cluster'}`);

		let now = new Date();
		let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
		const url = req.url.split('?');
		const urlPath = decodeURIComponent(url[0]);
		const cookie = parseCookie(req.headers?.cookie);
		const reqGetData = parseRequest(url[1]);
		const acceptEncoding = req.headers['accept-encoding'];
		const acceptLanguage = req.headers['accept-language'];
		const responseCookie = [];
		const clientLang = getClientLanguage(acceptLanguage, cookie, responseCookie);
		const localeTranslation = _locales.get(clientLang);
		//Проводим аутентификацию и вывод логов
		{
			if (USERS)
			{
				login((sessionId) =>
				{
					if (sessionId)
					{
						const username = cluster.isPrimary ? _primarySessions.get(sessionId).username : _workerSessions.get(sessionId).username;
						//console.log(sessionId, username);
						if (!urlPath.startsWith('/wsf_app_files')) updateSessionTimeout(sessionId);
						const userdata = { username, root: USERS.get(username).root };
						log(username);
						normalWork(userdata);
					}
					else
					{
						log();
					}
				});
			}
			else
			{
				log();
				normalWork();
			}

			function updateSessionTimeout(sessionId)
			{
				const now = Date.now();
				const sessionCookie = `sessionId=${sessionId}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict; httpOnly`;
				if (cluster.isPrimary)
				{
					const sessionData = _primarySessions.get(sessionId);
					if (now - sessionData.timeStamp > SESSION_UPDATE_PAUSE_MILLISECONDS)
					{
						clearTimeout(sessionData.timerId);
						sessionData.timeStamp = now;
						sessionData.timerId = setTimeout(() =>
						{
							_primarySessions.delete(sessionId);
						}, SESSION_TIMEOUT * 1000);
						responseCookie.push(sessionCookie);
					}
				}
				else
				{
					const sessionData = _workerSessions.get(sessionId);
					if (now - sessionData.timeStamp > SESSION_UPDATE_PAUSE_MILLISECONDS)
					{
						process.send({ updateSession: sessionId, timeStamp: now });
						sessionData.timeStamp = now;
						responseCookie.push(sessionCookie);
					}
				}
			}

			function log(username)
			{
				if (SHOW_SYSTEM_FILES_REQUESTS)
				{
					show(username);
				}
				else if (!urlPath.startsWith('/wsf_app_files/'))
				{
					show(username);
				}

				function show(username)
				{
					if (now - _lastReqTime > 1000 || _lastIP !== ip || (username && _lastUser !== username)) console.log(`*******${ip}, ${now.toLocaleString()} *******`);
					_lastReqTime = now;
					_lastIP = ip;
					if (username) _lastUser = username;
					if (username)
					{
						console.log(`User: ${username}, url: ${urlPath}`);
					}
					else if (USERS)
					{
						if (_loginExceptions.has(urlPath))
						{
							console.log('url: ' + urlPath);
						}
						else
						{
							console.log('Not authorized yet, url: ' + urlPath);
						}
					}
					else
					{
						console.log('Url: ' + urlPath);
					}
				}
			}
		}

		function login(callback)
		{
			if (urlPath === '/wsf_app_files/credentials')
			{
				const contentType = req.headers['content-type']?.split(';')[0].trim();
				if (contentType === 'application/x-www-form-urlencoded')
				{
					getPostBody(req, (err, postBody) =>
					{
						if (err)
						{
							console.log(err.message);
							res.end('Error occured while handling request!');
							callback(null);
						}
						else
						{
							const reqPostData = parseXwwwFormUrlEncoded(postBody);
							if (USERS.has(reqPostData?.username))
							{
								const username = reqPostData.username;
								const passwordHash = USERS.get(username).passwordHash;
								if (passwordHash === crypto.createHash('sha256').update(reqPostData?.password).digest('hex'))
								{
									let refLink = '/';
									if (cookie?.reflink) refLink = cookie.reflink;
									const sessionId = generateSessionId();
									responseCookie.push(generateSessionCookie(sessionId, username));
									if (cookie?.reflink) responseCookie.push('reflink=/; path=/; max-age=0; samesite=strict');
									const now = Date.now();
									if (cluster.isPrimary)
									{
										const timerId = setTimeout(() =>
										{
											_primarySessions.delete(sessionId);
										}, SESSION_TIMEOUT * 1000);
										_primarySessions.set(sessionId, { username, timerId, timeStamp: now });
									}
									else
									{
										_workerSessions.set(sessionId, { username, timeStamp: now });
										process.send({ newSession: sessionId, username, timeStamp: now });
									}
									reload(res, refLink, responseCookie);
								}
								else
								{
									reload(res, '/wsf_app_files/login_error.html', responseCookie);
								}
							}
							else
							{
								reload(res, '/wsf_app_files/login_error.html', responseCookie);
							}
						}
					});
					callback(null);
				}
				else
				{
					reload(res, '/wsf_app_files/login.html', responseCookie);
					callback(null);
				}
			}
			//Login exceptions
			else if (_loginExceptions.has(urlPath))
			{
				normalWork();
				callback(null);
			}
			else
			{
				let sessionId = null;
				if (cookie?.sessionId)
				{
					if (cluster.isPrimary)
					{
						if (_primarySessions.has(cookie.sessionId)) sessionId = cookie.sessionId;
						next();
					}
					else
					{
						if (_workerSessions.has(cookie.sessionId))
						{
							sessionId = cookie.sessionId;
							next();
						}
						else
						{
							//Рабочий процесс ничего не знает про текущую сессию из кук. Требуется проверить наличие этой сессии в главном процессе.
							function onPrimaryAnswer(msg)
							{
								if (msg.hasSession !== undefined)
								{
									process.removeListener('message', onPrimaryAnswer);
									if (msg.hasSession === true) sessionId = cookie.sessionId;
									next();
								}
							}
							process.on('message', onPrimaryAnswer);
							process.send({ hasSession: cookie.sessionId });
						}
					}
				}
				else
				{
					next();
				}

				function next()
				{
					if (urlPath === '/wsf_app_files/login.html' || urlPath === '/wsf_app_files/login_error.html')
					{
						if (sessionId)
						{
							reload(res, '/', responseCookie);
							callback(null);
						}
						else
						{
							const isErrorPage = urlPath === '/wsf_app_files/login_error.html';
							sendCachedFile(res,
								_login_html[0] + clientLang +
								_login_html[1] + (DIRECTORY_MODE_TITLE ? DIRECTORY_MODE_TITLE : getTranslation('defaultTitle', localeTranslation)) +
								_login_html[2] + (_generateIndex ? 'wsf_app_files/' : '') +
								_login_html[3] + getTranslation('needLoginAndPassword', localeTranslation) +
								_login_html[4] + getTranslation('username', localeTranslation) +
								_login_html[5] + getTranslation('password', localeTranslation) +
								_login_html[6] + getTranslation('signIn', localeTranslation) +
								_login_html[7] + (isErrorPage ? `<p class="error">${getTranslation('signInError', localeTranslation)}</p>` : '') +
								_login_html[8] + getTranslation('poweredBy', localeTranslation) +
								_login_html[9],
								'text/html; charset=utf-8', acceptEncoding, 200, responseCookie);
							callback(null);
						}
					}
					else if (urlPath === '/wsf_app_files/logout')
					{
						if (sessionId)
						{
							if (cluster.isPrimary)
							{
								const sessionData = _primarySessions.get(sessionId);
								clearTimeout(sessionData.timerId);
								_primarySessions.delete(sessionId);
							}
							else
							{
								_workerSessions.delete(sessionId);
								process.send({ deleteSession: sessionId });
							}
							responseCookie.push(deleteSessionCookie(sessionId));
							reload(res, '/wsf_app_files/login.html', responseCookie);
							callback(null);
						}
						else
						{
							reload(res, '/wsf_app_files/login.html', responseCookie);
							callback(null);
						}
					}
					else
					{
						if (sessionId)
						{
							callback(sessionId);
						}
						else if (urlPath === '/favicon.ico' || urlPath === '/sw.js') //Отбиваем стандартные запросы браузера.
						{
							res.writeHead(404);
							res.end();
						}
						else
						{
							responseCookie.push(`reflink=${url[0]}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict`);
							reload(res, '/wsf_app_files/login.html', responseCookie);
							callback(null);
						}
					}
				}
			}

			function generateSessionCookie(sessionId)
			{
				return `sessionId=${sessionId}; path=/; max-age=${SESSION_TIMEOUT}; samesite=strict; httpOnly`;
			}

			function deleteSessionCookie(sessionId)
			{
				return `sessionId=${sessionId}; path=/; max-age=0; samesite=strict; httpOnly`;
			}

			function reload(res, url, responseCookie)
			{
				const headers =
				{
					'Content-Security-Policy': 'default-src \'self\'',
					'Refresh': `0;url=${url}`
				};
				if (responseCookie)
				{
					if (responseCookie?.length)
					{
						headers['Set-Cookie'] = responseCookie;
					}
				}
				res.writeHead(200, headers);
				res.end();
			}

			function generateSessionId()
			{
				const size = 64;
				let key = Buffer.from(crypto.randomBytes(size)).toString('base64url');
				const sessions = cluster.isPrimary ? _primarySessions : _workerSessions;
				while (sessions.has(key))
				{
					key = Buffer.from(crypto.randomBytes(size)).toString('base64url');
				}
				return key;
			}
		}

		function normalWork(userdata)
		{
			const rootPath = userdata ? path.join(ROOT_PATH, userdata.root) : ROOT_PATH;
			const username = userdata?.username;
			//Проверка пути пользователя.
			fs.stat(rootPath, (err, stats) =>
			{
				if (err)
				{
					error404(`User ${username} directory error: ${err?.message}`, res, acceptEncoding, localeTranslation, clientLang);
					return;
				}
				else if (stats.isFile())
				{
					error404(`User ${username} path is not directory`, res, acceptEncoding, localeTranslation, clientLang);
					return;
				}
				if (urlPath.match(/[/\\]\.+\.[/\\]/))
				{
					error404(`You can watch only ${rootPath} directory`, res, acceptEncoding, localeTranslation, clientLang);
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
								answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, { error: err.message });
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
										answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, reqPostData);
									});
								}
								else if (contentType[0] === 'application/x-www-form-urlencoded')
								{
									const reqPostData = parseXwwwFormUrlEncoded(postBody);
									answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, reqPostData);
								}
								else
								{
									answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie);
								}
							}
						});
					}
					else
					{
						answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie);
					}
				}
				else
				{
					answer(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie);
				}
			});
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

	function answer(res, username, urlPath, rootPath, paramsGet, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, reqPostData)
	{
		sendFileByUrl(res, username, urlPath, rootPath, paramsGet, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, reqPostData);
		//if (paramsGet) console.log(paramsGet);
		//if (postData) console.log(postData);
	}

	function sendCachedFile(res, file, contentType, acceptEncoding, code, responseCookie)
	{
		const headers =
		{
			'Content-Type': contentType,
			'Cache-Control': 'no-cache',
			'Content-Security-Policy': 'default-src \'self\''
		};
		if (responseCookie)
		{
			if (responseCookie?.length)
			{
				headers['Set-Cookie'] = responseCookie;
			}
		}
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
	function sendFileByUrl(res, username, urlPath, rootPath, reqGetData, cookie, acceptEncoding, clientLang, localeTranslation, responseCookie, reqPostData)
	{
		if (_generateIndex)
		{
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
		if (urlPath === '/wsf_app_files/404.css')
		{
			sendCachedFile(res, _404_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		}
		else if (urlPath === '/wsf_app_files/login.css')
		{
			sendCachedFile(res, _login_css, 'text/css; charset=utf-8', acceptEncoding);
			return;
		}
		let filePath = path.join(rootPath, urlPath);
		fs.stat(filePath, (err, stats) =>
		{
			if (err)
			{
				error404(err, res, acceptEncoding, localeTranslation, clientLang);
			}
			else if (_generateIndex)
			{
				ifGenetateIndex(res, username, urlPath, rootPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, reqPostData, stats.isFile(), stats.size);
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

	function ifGenetateIndex(res, username, urlPath, rootPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, reqPostData, isFile, fileSize)
	{
		if (!isFile)
		{
			if (reqPostData && !Array.isArray(reqPostData) && typeof reqPostData === 'object')
			{
				if (reqPostData.error)
				{
					generateAndSendIndexHtmlAlias(reqPostData.error);
				}
				else
				{
					if (UPLOAD_ENABLE)
					{
						if (reqPostData.delete)
						{
							deleteFiles(filePath, reqPostData, localeTranslation, (errorMessage) =>
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
						else if (reqPostData.rename_from && reqPostData.rename_to)
						{
							renameItem(filePath, reqPostData.rename_from, reqPostData.rename_to, localeTranslation, (errorMessage) =>
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
						else if (reqPostData.dir)
						{
							createUserDir(filePath, reqPostData, localeTranslation, (errorMessage) =>
							{
								generateAndSendIndexHtmlAlias(errorMessage);
							});
						}
						else if (reqPostData.paste_items && reqPostData.paste_from && reqPostData.paste_type)
						{
							pasteItems(filePath, rootPath, reqPostData.paste_from, reqPostData.paste_items, reqPostData.paste_type, localeTranslation, (errorMessage) =>
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
							generateAndSendIndexHtmlAlias('Invalid request parameters!');
						}
					}
					else
					{
						generateAndSendIndexHtmlAlias('Uploading is not allowed!');
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
				if (Object.keys(reqGetData).length < 2)
				{
					generateAndSendIndexHtmlAlias('No files selected!');
				}
				else
				{
					zipItems(res, urlPath, filePath, reqGetData, acceptEncoding, localeTranslation, clientLang);
				}
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
			generateAndSendIndexHtml(res, username, urlPath, filePath, acceptEncoding, reqGetData, cookie, responseCookie, localeTranslation, clientLang, errorMessage);
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
			if (!cookie?.lang && _generateIndex)
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

	function readFolderRecursive(folderPath, onFolderIn, onFolderOut, onFile, onEnd)
	{
		const rootPath = folderPath;
		read(folderPath, onEnd);

		function read(folderPath, callback)
		{
			if (_forbidden_paths.has(folderPath))
			{
				callback(null);
			}
			else
			{
				fs.readdir(folderPath, { withFileTypes: true }, (err, items) =>
				{
					if (err)
					{
						callback(err);
					}
					else if (items.length > 0)
					{
						let numberOfItems = items.length;
						for (let item of items)
						{
							const fullPath = path.join(folderPath, item.name);
							checkIsDirectory(fullPath, item, afterIsDirectory);
							function afterIsDirectory(isDirectory)
							{
								if (isDirectory)
								{
									const relativePath = path.join(path.relative(rootPath, fullPath));
									onFolderIn(fullPath, relativePath, () =>
									{
										read(fullPath, (err) =>
										{
											if (err)
											{
												callback(err);
											}
											else
											{
												onFolderOut(fullPath, relativePath, () =>
												{
													numberOfItems--;
													if (numberOfItems === 0) callback(null);
												});
											}
										});
									});
								}
								else if (isDirectory !== null)
								{
									const relativePath = path.join(path.relative(rootPath, folderPath), item.name);
									onFile(fullPath, relativePath, () =>
									{
										numberOfItems--;
										if (numberOfItems === 0) callback(null);
									});
								}
								else
								{
									numberOfItems--;
									if (numberOfItems === 0) callback(null);
								}
							}
						}
					}
					else
					{
						callback(null);
					}
				});
			}
		}
	}

	function zipItems(res, urlPath, absolutePath, postData, acceptEncoding, localeTranslation, clientLang)
	{
		const selectedItems = [];
		const rootFolderName = urlPath === '/' ? 'archive' : path.basename(absolutePath);
		let keys = Object.keys(postData);
		for (let key of keys)
		{
			if (key === 'download') continue;
			if (postData[key] === 'on')
			{
				const item = Buffer.from(key, 'base64url').toString(); //decodeURIComponent(decodeURIComponent(key))
				selectedItems.push(item);
			}
		}
		const zip = new JSZip();
		zipItemsByIndex(0);

		function zipItemsByIndex(index)
		{
			const item = selectedItems[index];
			if (item.match(FILE_REG_EXP) !== null)
			{
				zipError('Item path incorrect', res);
				console.log('Zip error: Item path incorrect');
				return;
			}
			const itemPath = path.join(absolutePath, item);
			fs.stat(itemPath, (err, stats) =>
			{
				if (err)
				{
					zipError('Zip error: ' + err, res);
				}
				else
				{
					if (stats.isDirectory())
					{
						zip.folder(item);
						zipDirectory(item, itemPath, (err) =>
						{
							if (err)
							{
								zipError('Zip error: ' + err, res);
							}
							else
							{
								next();
							}
						});
					}
					else
					{
						fs.readFile(itemPath, (err, data) =>
						{
							if (err)
							{
								zipError('Zip error: ' + err, res);
							}
							else
							{
								zip.file(item, data);
								next();
							}
						});
					}
				}
			});

			function next()
			{
				index++;
				if (index < selectedItems.length)
				{
					zipItemsByIndex(index);
				}
				else
				{
					sendZip();
				}
			}
		}

		function zipDirectory(toPathRelative, fromPath, onEnd)
		{
			const onFolderIn = function(fullPath, relativePath, next)
			{
				const zipPath = path.join(toPathRelative, relativePath).replace(/\\/g, '/');
				zip.folder(zipPath);
				next();
			};
			const onFolderOut = function(fullPath, relativePath, next)
			{
				next();
			};
			const onFile = function(fullPath, relativePath, next)
			{
				fs.readFile(fullPath, (err, data) =>
				{
					if (err)
					{
						onEnd(err);
					}
					else
					{
						const zipPath = path.join(toPathRelative, relativePath).replace(/\\/g, '/');
						zip.file(zipPath, data);
						next();
					}
				});
			};
			readFolderRecursive(fromPath, onFolderIn, onFolderOut, onFile, onEnd);
		}

		function zipError(err, res)
		{
			const commonMsg = 'Zip generate error!';
			console.log(commonMsg + ' ' + err);
			error500(commonMsg, res);
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
				console.log('Zip archive sent successfully: ' + selectedItems.join(', '));
			});
		}
	}

	function createUserDir(absolutePath, postData, localeTranslation, callback)
	{
		if (!UPLOAD_ENABLE)
		{
			callback('Writing is not allowed!');
			return;
		}
		if (!postData.dir || postData.dir.length === 0 || postData.dir.length > 255)
		{
			callback(getTranslation('createFolderError', localeTranslation));
		}
		else
		{
			let dpath = postData.dir.replace(/\+/g, ' ');
			dpath = decodeURIComponent(dpath);
			if (dpath.match(FILE_REG_EXP) !== null)
			{
				callback(getTranslation('createFolderError', localeTranslation));
				console.log('Paste error: Dir name incorrect');
				return;
			}
			fs.mkdir(path.join(absolutePath, dpath), { recursive: true }, (err) =>
			{
				if (err)
				{
					callback(getTranslation('createFolderError', localeTranslation));
					console.log('Paste error: ' + err);
				}
				else
				{
					callback(null);
				}
			});
		}
	}

	function testToWrongPath(pathToTest)
	{
		if (pathToTest === '..') return false;
		if (pathToTest.match(/[<>":?*|]/g) !== null) return false;
		const index = pathToTest.indexOf('..');
		if (index === -1) return true;
		if (pathToTest[index - 1] === path.sep) return false;
		if (pathToTest[index + 2] === path.sep) return false;
		return true;
	}

	function pasteItems(absolutePath, rootPath, itemsPath, itemsList, pasteType, localeTranslation, callback)
	{
		if (!UPLOAD_ENABLE)
		{
			callback('Writing is not allowed!');
			console.log('Paste error: Writing is not allowed!');
			return;
		}
		let fromPath = decodeURIComponent(itemsPath.replace(/\+/g, ' '));
		if (!testToWrongPath(fromPath))
		{
			callback(getTranslation('pasteError', localeTranslation));
			console.log('Paste error: Item path incorrect');
			return;
		}
		fromPath = path.join(rootPath, fromPath);
		const items = decodeURIComponent(itemsList).split(',').map((item) => Buffer.from(item, 'base64url').toString());
		pasteItemsByIndex(0);

		function pasteItemsByIndex(index)
		{
			const item = items[index];
			if (item.match(FILE_REG_EXP) !== null)
			{
				callback(`${getTranslation('pasteError', localeTranslation)}: ${item}`);
				console.log('Paste error: Item path incorrect');
				return;
			}
			const itemPath = path.join(fromPath, item);
			paste(itemPath, (err) =>
			{
				if (err)
				{
					callback(getTranslation('pasteError', localeTranslation));
					console.log('Paste error:' + err);
				}
				else
				{
					index++;
					if (index < items.length)
					{
						pasteItemsByIndex(index);
					}
					else
					{
						callback(null);
					}
				}
			});
		}

		function paste(itemPath, onEnd)
		{
			fs.stat(itemPath, (err, stats) =>
			{
				if (err)
				{
					onEnd(err);
				}
				else
				{
					if (stats.isDirectory())
					{
						const itemDirName = path.basename(itemPath);
						const dirPath = path.join(absolutePath, itemDirName);
						fs.mkdir(dirPath, { recursive: true }, (err) =>
						{
							if (err)
							{
								onEnd(err);
							}
							else
							{
								//Копирует содержимое папки.
								copyOrMoveDirectory(dirPath, itemPath, (err) =>
								{
									if (err)
									{
										onEnd(err);
									}
									else if (pasteType === 'move')
									{
										fs.rmdir(itemPath, onEnd);
									}
									else
									{
										onEnd(null);
									}
								});
							}
						});
					}
					else
					{
						const fileName = path.basename(itemPath);
						const pathTo = path.join(absolutePath, fileName);
						copyOrMoveFile(itemPath, pathTo, pasteType, onEnd);
					}
				}
			});

			function copyOrMoveDirectory(toPath, fromPath, onEnd)
			{
				const onFolderIn = function(fullPath, relativePath, next)
				{
					const itemDirName = path.basename(fullPath);
					fs.mkdir(path.join(toPath, itemDirName), { recursive: true }, (err) =>
					{
						if (err)
						{
							onEnd(err);
						}
						else
						{
							next();
						}
					});
				};
				const onFolderOut = function(fullPath, relativePath, next)
				{
					if (pasteType === 'move')
					{
						fs.rmdir(fullPath, (err) =>
						{
							if (err)
							{
								onEnd(err);
							}
							else
							{
								next();
							}
						});
					}
					else
					{
						next();
					}
				};
				const onFile = function(fullPath, relativePath, next)
				{
					const pathTo = path.join(toPath, relativePath);
					copyOrMoveFile(fullPath, pathTo, pasteType, (err) =>
					{
						if (err)
						{
							onEnd(err);
						}
						else
						{
							next();
						}
					});
				};
				readFolderRecursive(fromPath, onFolderIn, onFolderOut, onFile, onEnd);
			}
		}

		function copyOrMoveFile(from, to, type, callback)
		{
			if (type === 'copy')
			{
				fs.copyFile(from, to, callback);
			}
			else if (type === 'move')
			{
				fs.lstat(from, (err, stats) =>
				{
					if (err)
					{
						callback(err);
					}
					{
						if(stats.isSymbolicLink())
						{
							//Саму ссылку не перемещаем, перемещаем сам файл, на который она ссылается.
							fs.copyFile(from, to, (err) =>
							{
								if (err)
								{
									callback(err);
								}
								else
								{
									fs.rm(from, callback);
								}
							});
						}
						else
						{
							fs.rename(from, to, callback);
						}
					}
				});
			}
			else
			{
				callback('Invalid paste_type parameter');
			}
		}
	}

	function renameItem(absolutePath, renameFrom_base64Url, renameTo_uriEncoded, localeTranslation, callback)
	{
		if (!UPLOAD_ENABLE)
		{
			callback('Writing is not allowed!');
			console.log('Rename error: Writing is not allowed!');
			return;
		}
		const newName = decodeURIComponent(renameTo_uriEncoded.replace(/\+/g, ' '));
		const oldName = Buffer.from(renameFrom_base64Url, 'base64url').toString();
		if (newName === oldName)
		{
			callback(null);
			return;
		}
		if ((newName.length > 255) || (newName.match(FILE_REG_EXP) !== null) || (oldName.match(FILE_REG_EXP) !== null))
		{
			callback(getTranslation('invalidName', localeTranslation));
			console.log('Rename error: Invalid item name!');
			return;
		}
		fs.rename(path.join(absolutePath, oldName), path.join(absolutePath, newName), (err) =>
		{
			if (err)
			{
				console.log(err.message);
				callback(`${getTranslation('renameError', localeTranslation)}: ${oldName}`);
				console.log('Rename error: ' + err);
				return;
			}
			else
			{
				callback(null);
			}
		});
	}

	function deleteFiles(absolutePath, postData, localeTranslation, callback)
	{
		if (!UPLOAD_ENABLE)
		{
			callback('Writing is not allowed!');
			console.log('Delete error: Writing is not allowed!');
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
				if (fileName.match(FILE_REG_EXP) !== null)
				{
					callback(getTranslation('deleteError', localeTranslation));
					console.log('Delete error: Item name error!');
					return;
				}
				const filePath = path.join(absolutePath, fileName);
				fs.rm(filePath, { force: true, recursive: true }, (err) =>
				{
					if (err)
					{
						console.log(err.message);
						callback(getTranslation('deleteError', localeTranslation));
						console.log('Delete error: ' + err);
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

	function generateAndSendIndexHtml(res, username, urlPath, absolutePath, acceptEncoding, paramsGet, cookie, responseCookie, localeTranslation, clientLang, errorMessage)
	{
		//Проверка на переход по запрещённым путям.
		for (let forbiddenPath of _forbidden_paths.values())
		{
			if (absolutePath.startsWith(forbiddenPath))
			{
				error404('Attempting to follow a prohibited path', res, acceptEncoding, localeTranslation, clientLang);
				return;
			}
		}
		if (!errorMessage) errorMessage = '';
		fs.readdir(absolutePath, { withFileTypes: true }, (err, files) =>
		{
			if (err)
			{
				error404(err, res, acceptEncoding, localeTranslation, clientLang);
				return;
			}
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
				<input type="checkbox" class="hidden_in_flow">
				<div class="${iconnClassName}"></div>
				<a href="/">[/]</a>
			</div>
			<span>${folderSizeStub}</span>
			<span>-</span>
			<div class="main_container__first_column">
			<input type="checkbox" class="hidden_in_flow">
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
						const fileIndexCopy = fileIndex;
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
							const ext = isDirectory ? 'folder' : path.extname(file.name);
							const maxNameLength = 70;
							const isNameTruncated = linkName.length > maxNameLength;
							if (isNameTruncated)
							{
								linkName = linkName.slice(0, maxNameLength - ext.length - 5) + '&nbsp;...&nbsp;' + ext;
							}
							linkName = linkName.replace(/ /g, '&nbsp;');
							const sizeStr = isDirectory ? folderSizeStub : getStrSize(stats.size, localeTranslation);
							const modify = stats.mtime.toLocaleDateString(clientLang) + ' ' + stats.mtime.toLocaleTimeString(clientLang);
							const fileNameModified = (urlHeader === '' && (file.name === 'index.html' || file.name === 'robots.txt')) ? '_' + file.name : file.name;
							const linkHref = encodeURI(urlHeader) + '/' + encodeURIComponent(fileNameModified);
							const iconnClassName = getIconClassName(ext);
							const showInBrowser = !isDirectory && canShowInBrowser(ext);
							const fileNameInBase64 = Buffer.from(file.name).toString('base64url');
							const linkToUnzipText = getTranslation('linkToUnzip', localeTranslation);
							const linkToOpenInBrowserText = getTranslation('linkToOpenInBrowser', localeTranslation);
							const renameText = getTranslation('rename', localeTranslation);
							hrefs.push({ value:
	`				<div class="main_container__first_column">
					<input id="item-checkbox-${fileIndexCopy}" aria-label="${getTranslation('select', localeTranslation)}" type="checkbox" name="${fileNameInBase64}">${UPLOAD_ENABLE ? `
					<div class="rename_button"><button hidden title="${renameText}" aria-label="${renameText}" id="rename-button-${fileIndexCopy}"></button><div></div></div>` : ''}
					<div class="${iconnClassName}"></div>
					<a href="${linkHref}"${isDirectory ? '' : ' download'} ${isNameTruncated ? `title="${file.name}"` : ''}>${linkName}</a>${ext === '.zip' && UPLOAD_ENABLE ? `
					<a href="${linkHref}?unzip=true" class="flex_right_icons unzip_icon" aria-label="${linkToUnzipText}" title="${linkToUnzipText}"></a>` : ''}${showInBrowser ? `
					<a href="${linkHref}" class="flex_right_icons open-in-browser-icon" target="_blank" aria-label="${linkToOpenInBrowserText}" title = "${linkToOpenInBrowserText}"></a>` : ''}
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
						_indexHtmlbase[2] +
						`${USERS ? (_indexHtmlbase[3] + getTranslation('youSignInAs', localeTranslation) +
						_indexHtmlbase[4] + username +
						_indexHtmlbase[5] + getTranslation('signOut', localeTranslation) +
						_indexHtmlbase[6]) : ''}` +
						_indexHtmlbase[7] + folderName +
						_indexHtmlbase[8] + getTranslation('checkAll', localeTranslation) +
						_indexHtmlbase[9] + getTranslation('downloadZip', localeTranslation) +
						_indexHtmlbase[10] + getTranslation('uncheckAll', localeTranslation) +
						_indexHtmlbase[11] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[12] + getTranslation('deleteFiles', localeTranslation) +
						_indexHtmlbase[13] + getTranslation('selectForCopyOrMove', localeTranslation) +
						_indexHtmlbase[14] + getTranslation('copy', localeTranslation) +
						_indexHtmlbase[15] + getTranslation('move', localeTranslation) +
						_indexHtmlbase[16]) : ''}` +
						_indexHtmlbase[17] + `${getTranslation('filesStats', localeTranslation)}: ${filesNumber} (${getStrSize(filesSize, localeTranslation)}). ${getTranslation('foldersStats', localeTranslation)}: ${foldersNumber}` +
						_indexHtmlbase[18] + getTranslation('fileName', localeTranslation) +
						_indexHtmlbase[19] + (hasFiles ? sortLinks[0] : '') +
						_indexHtmlbase[20] + getTranslation('fileSize', localeTranslation) +
						_indexHtmlbase[21] + (hasFiles ? sortLinks[1] : '') +
						_indexHtmlbase[22] + getTranslation('modifyDate', localeTranslation) +
						_indexHtmlbase[23] + (hasFiles ? sortLinks[2] : '') +
						_indexHtmlbase[24] + hrefsResult +
						_indexHtmlbase[25] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[26] + getTranslation('createFolder', localeTranslation) +
						_indexHtmlbase[27] + getTranslation('invalidName', localeTranslation) +
						_indexHtmlbase[28] + getTranslation('folderName', localeTranslation) +
						_indexHtmlbase[29] + getTranslation('uploadFiles', localeTranslation) +
						_indexHtmlbase[30] + getTranslation('dragAndDropText', localeTranslation) +
						_indexHtmlbase[31] + getTranslation('deleteFilesWarning', localeTranslation) +
						_indexHtmlbase[32] + getTranslation('yes', localeTranslation) +
						_indexHtmlbase[33] + getTranslation('no', localeTranslation) +
						_indexHtmlbase[34] + getTranslation('deleteWithoutAsk', localeTranslation) +
						_indexHtmlbase[35]) : ''}` +
						_indexHtmlbase[36] + errorMessage +
						_indexHtmlbase[37] + getTranslation('poweredBy', localeTranslation) +
						_indexHtmlbase[38] + getTranslation('lightTheme', localeTranslation) +
						_indexHtmlbase[39] + getTranslation('lightTheme', localeTranslation) +
						_indexHtmlbase[40] + getTranslation('autoTheme', localeTranslation) +
						_indexHtmlbase[41] + getTranslation('autoTheme', localeTranslation) +
						_indexHtmlbase[42] + getTranslation('darkTheme', localeTranslation) +
						_indexHtmlbase[43] + getTranslation('darkTheme', localeTranslation) +
						_indexHtmlbase[44] +
						`${UPLOAD_ENABLE ? (_indexHtmlbase[45] + getTranslation('inputNewName', localeTranslation) +
						_indexHtmlbase[46] + getTranslation('invalidName', localeTranslation) +
						_indexHtmlbase[47] + getTranslation('newName', localeTranslation) +
						_indexHtmlbase[48] + getTranslation('ok', localeTranslation) +
						_indexHtmlbase[49] + getTranslation('cancel', localeTranslation) +
						_indexHtmlbase[50] + getTranslation('replaceWarningDialog', localeTranslation) +
						_indexHtmlbase[51] + getTranslation('ok', localeTranslation) +
						_indexHtmlbase[52] + getTranslation('cancel', localeTranslation) +
						_indexHtmlbase[53] + getTranslation('doNotAsk', localeTranslation) +
						_indexHtmlbase[54]) : ''}` +
						_indexHtmlbase[55];
			}
		});
	}

	function checkIsDirectory(pathToItem, dirent, next)
	{
		if (_forbidden_paths.has(pathToItem))
		{
			next(null);
			return;
		}
		if (dirent.isSymbolicLink())
		{
			if (dirent.parentPath)
			{
				process.chdir(dirent.parentPath);
			}
			else
			{
				process.chdir(path.dirname(pathToItem));
			}
			fs.readlink(pathToItem, (err, linkPath) =>
			{
				if (err)
				{
					console.log(err?.message);
					next(null);
					return;
				}
				fs.stat(linkPath, (err, stats) =>
				{
					if (err)
					{
						console.log(err?.message);
						next(null);
					}
					else if (stats.isDirectory())
					{
						console.log('Symbolic links to directories are not allowed! Adding it to forbidden paths list.');
						_forbidden_paths.add(pathToItem);
						next(null);
					}
					else
					{
						next(false);
					}
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
			_404_html[1] + (_generateIndex ? (DIRECTORY_MODE_TITLE ? DIRECTORY_MODE_TITLE : getTranslation('defaultTitle', localeTranslation)) : '404') +
			_404_html[2] + (_generateIndex ? 'wsf_app_files/' : '') +
			_404_html[3] + getTranslation('pageNotFound', localeTranslation) +
			_404_html[4],
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

	function sendHtmlString(res, data, responseCookie, acceptEncoding)
	{
		const headers =
		{
			'Content-Length': Buffer.from(data).byteLength,
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Security-Policy': 'default-src \'self\'',
			'Cache-Control': 'no-cache'
		};
		if (responseCookie)
		{
			if (responseCookie?.length)
			{
				headers['Set-Cookie'] = responseCookie;
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
			//console.log('Sent successfully: ' + filePath);
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
	if (cluster.isWorker) process.send('ready');
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
	let env = Number(process.env.WSF_UPLOAD_ENABLE);
	if (!Number.isNaN(env) && env > 0) flag = true;
	return flag;
}
