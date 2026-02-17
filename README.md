# web-shared-folder

Convenient http server on nodejs. Designed to share files and folders on a local network or even on the Internet via a web interface. Can also be used as a web server to serve static sites.

Capabilities

* Shared directory in a local network or the Internet via a web interface.
* There is an option not only to download data from a specified folder but also to upload data to it.
* It is possible to create users with access only to a specified folder.
* It can work as a server for hosting a static website.
* It is possible to work over HTTPS protocol with an automatic redirect from HTTP.
* If the load is high, then you can enable cluster mode, using all cores of the server machine.
* There is a dark theme.
* Pages are automatically displayed in the user language (only two languages are available at the moment).

## Installation

```
npm i -g web-shared-folder
```

## Usage

```
wsf </path/to/folder/for/sharing> <port> [</path/to/key> </path/to/cert>] [--upload or -u]
```

To output only the version number:

```
wsf -v [or --version]
```

To output help:

```
wsf -h [or --help]
```

To output license information:

```
wsf -l [or --license]
```

Instead of `wsf` you can use the full program name `web-shared-folder`.

## Basic

To run the server, you need to specify at least the path to the directory to be shared and the port number on which the server will operate. The folder path is specified in the first parameter, followed by the port number.

The web-shared-folder server operates as follows:
If there is an index.html file in the root of the specified directory, web-shared-folder starts working as a web server that hosts a static website and sends index.html when the root URL is requested. Otherwise, the server switches to a mode that displays the contents of the directory specified in the startup parameters. In this case, the user can download files and folders located in that directory.

Example:

```
wsf . 80
```

If there is no index.html file in the root directory, this command will start the server on port 80 and share the current folder for browsing and downloading.
The server will be accessible on all available network interfaces (this can be changed by setting the appropriate environment variable). For example, if the server has an IP address of 192.168.1.2, you can access it in the local network by entering the address http://192.168.1.2 in your browser. Since the standard port number 80 is used, the port number does not need to be specified in the address. If a non-standard port number is used, such as 8080, it must be included in the address: http://192.168.1.2:8080. On Linux machines, you may need to run the program from root to work with port 80.

![Screenshot with files upload disabled](https://github.com/Mendeo/web-shared-folder/blob/master/img/screenshot_upload_disabled.png)  
*Screenshot with files upload disabled*

The eye-shaped link next to the file allows you to open it directly in the browser in a separate tab. This way, you can view, for example, text, photos, or some videos (if the browser supports the encoding).

If you need to give users the ability to upload files to the server in a shared folder, as well as the ability to rename, delete, and move existing files and folders, then the web-shared-folder server must be launched with the --upload or -u key.

However, there are limitations on file uploads. The issue is that the uploaded files are transmitted in a single request, and browsers have a limit on the duration of such a request, typically 5 or 10 minutes (depending on the browser). If the upload duration exceeds this time, it will end with an error. Another limitation is the total size of files uploaded at once. It should not exceed 2 GiB.

Example:

```
wsf . 80 -u
```

![Screenshot with files upload enabled](https://github.com/Mendeo/web-shared-folder/blob/master/img/screenshot_upload_enabled.png)  
*Screenshot with files upload enabled*

In this mode, clicking on the link in the form of an up arrow next to the zip archive file will unpack this archive into the current directory.

## Using the HTTPS

To work over HTTPS, you need to specify the path to the SSL secret key file (usually privkey.pem) and the path to the SSL certificate file (usually fullchain.pem).

Example:

```
wsf . 443 /etc/ssl/privkey.pem /etc/ssl/fullchain.pem
```

or with upload capability enabled:

```
wsf . 443 /etc/ssl/privkey.pem /etc/ssl/fullchain.pem -u
```

In the examples above, the standard port number for HTTPS is used: 443. The private key and certificate files are typically issued by certification authorities organizations. However, you can also generate a self-signed certificate, for example, using openssl, but in this case, the browser will display a warning.

## Environment variables

Advanced server configuration is done by setting environment variables.
First of all, you can store the command-line arguments described above in these variables and run the server without any additional arguments.

Below is a table describing all possible environment variables.

### Basic environment variables

Environment Variable                  |Description
:-------------------------------------|:-
WSF_ROOT                              |Path to the folder that needs to be made publicly accessible.
WSF_PORT                              |Port that the server will listen on.
WSF_UPLOAD_ENABLE                     |Switches the server to a mode in which the user can upload their files to the shared folder, as well as move, rename and delete files and folders within it.
WSF_DIRECTORY_MODE                    |If there is an `index.html` file in the root folder, the server by default starts in the mode of displaying the web page associated with `index.html`, rather than displaying the directory contents. To forcibly switch to directory browsing mode, set `WSF_DIRECTORY_MODE=1`.
WSF_DIRECTORY_MODE_TITLE              |Sets the title of the pages displayed in the browser tab. By default, it displays "Remote file manager".

### Working via HTTPS

Environment Variable                  |Description
:-------------------------------------|:-
WSF_CERT                              |Path to the SSL certificate file (usually `fullchain.pem`).
WSF_KEY                               |Path to the SSL private key file (usually `privkey.pem`).
WSF_AUTO_REDIRECT_HTTP_PORT           |When the server operates in secure mode (using HTTPS), it is possible to enable automatic redirection for clients attempting to connect via HTTP. For example, if the server is running on the standard HTTPS port 443, you can set up automatic redirection for clients connecting via HTTP (standard port 80) by setting `WSF_AUTO_REDIRECT_HTTP_PORT=80`.

### Security Settings

Environment Variable                  |Description
:-------------------------------------|:-
WSF_ALLOWED_INTERFACES                |List of interfaces on which the server will be accessible. By default, the server is accessible on all available network interfaces, but this is not desirable if, for example, you need to restrict access from external networks. This variable specifies a list of IP addresses (separated by commas) on which the server will operate. For example, to allow access only from localhost, set `WSF_ALLOWED_INTERFACES=127.0.0.1`.
WSF_FORBIDDEN_PATHS                   |List of paths, relative to the root directory, that will not be displayed to clients. Paths are separated by a colon `:`. For example, to hide the `.git` and `secret` folders, set `WSF_FORBIDDEN_PATHS=.git:secret`.

### User creation and access restrictions

Environment Variable                  |Description
:-------------------------------------|:-
WSF_USERS                             |Setting this environment variable switches the server to a mode where access to files is allowed to specified users. The format of this variable is as follows: username, followed by the `@` symbol, then the SHA-256 hash (hex) of the user's password, followed by the path the user will have access to, then a colon `:` and similar data for other users. The path must start with a `/`, be relative to the root directory, and point to a folder. If there are errors in the path, they will only become apparent when the user attempts to log in. Example: `username1@sha256password1InHex/path1/relative/ROOT_PATH:username2@sha256password2InHex/path2/relative/ROOT_PATH`. **Note that operating in this mode over HTTP is insecure, as usernames and passwords are transmitted over the network in plain text and can be easily intercepted. To securely operate in this mode, use HTTPS. In this case even with a self-signed SSL certificate, communication with the server will be encrypted.**
WSF_SESSION_TIMEOUT                   |User session timeout (in seconds). If the user is inactive for this period, the session ends, and the user will need to re-enter their username and password upon the next request. By default, this time is set to 30 minutes.
WSF_SESSION_UPDATE_PAUSE_MILLISECONDS |The time (in milliseconds) during which the session will not be extended, even if requests are received from the user. By default, this value is set to 5000 milliseconds.

![Prompt for username and password](https://github.com/Mendeo/web-shared-folder/blob/master/img/screenshot_authentication_required.png)  
*Prompt for username and password*

### Cluster mode operation

Environment Variable                  |Description
:-------------------------------------|:-
WSF_USE_CLUSTER_MODE                  |Switches the server to cluster mode. In this mode, multiple copies of the server process (by number of CPU cores) are launched, and the load is distributed among these processes, allowing full utilization of CPU resources and increasing server performance under high request loads. However, this mode also requires a significant amount of RAM. At the same time, this mode makes the server more resilient, as setting the `WSF_SHOULD_RESTART_WORKER` variable will automatically restart worker processes in case of failures.
WSF_SHOULD_RESTART_WORKER             |Whether to restart worker processes in cluster mode in case of unexpected termination. By default, these processes are not restarted.

### Appearance customization

Environment Variable                  |Description
:-------------------------------------|:-
WSF_ICONS_TYPE                        |Web-shared-folder uses the [file-icon-vectors](https://www.npmjs.com/package/file-icon-vectors) npm package to display file and folder icons. There are three available icon styles: `classic`, `square-o`, and `vivid`. You can set `WSF_ICONS_TYPE` to one of these options. By default, `square-o` is used.

### Other settings

Environment Variable                  |Description
:-------------------------------------|:-
WSF_DISABLE_COMPRESSION               |Allows to forcibly disable file compression during network transmission. This is useful for debugging purposes and does not affect what is displayed in the user's browser.
WSF_SHOW_SYSTEM_FILES_REQUESTS        |Forces the server to log not only requests to shared files but also requests to the web-shared-folder application files themselves, requested from a path starting with `/wsf_app_files`, such as `/wsf_app_files/favicon.icon` and others.
